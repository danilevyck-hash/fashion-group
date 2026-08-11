-- =============================================================================
-- MAYOR CONTABLE de Switch → gastos por empresa
-- =============================================================================
-- Aplicar A MANO en Supabase Dashboard → SQL Editor.
-- ADITIVA e IDEMPOTENTE. CERO DELETE/DROP de objetos existentes.
--
-- La pantalla /gastos-contabilidad FUNCIONA ANTES de que esto corra: las rutas
-- reconocen "la tabla no existe" (PostgREST 42P01 / PGRST205) y responden
-- "modulo no instalado" en vez de reventar.
--
-- ── POR QUE UNA TABLA NUEVA Y NO `empresa_gastos_mensuales` ──────────────────
--
-- `empresa_gastos_mensuales` (carga MANUAL, 6 categorias) se queda intacta y
-- se sigue usando. El mayor NO puede vivir ahi, por cuatro razones medidas:
--
--  1. Su columna `monto` tiene CHECK (monto >= 0). El mayor produce netos
--     NEGATIVOS legitimos: en enero-2026 de Vistana, 6.03.41 da -127.78 y
--     6.03.42 da -69.30. Guardarlos ahi exigiria el valor absoluto que es
--     justo el error prohibido (su firma: la diferencia da el DOBLE exacto).
--  2. El mayor tiene ~60 cuentas con codigo de 5 segmentos. Aplastarlas en 6
--     categorias PIERDE el codigo, que es la llave contra la contabilidad.
--  3. Las dos fuentes colisionarian: si la contadora carga a mano un mes que
--     el mayor tambien trae, la Vista General sumaria los dos y contaria doble.
--     No hay columna de procedencia para desambiguar.
--  4. La ausencia de fila en `empresa_gastos_mensuales` significa "no cargado".
--     Acá hace falta distinguir CUATRO estados (cerrado / incompleto / sin
--     cerrar / no traido), y eso exige registrar QUE RANGO se pidio.
--
-- ── POR QUE SE GUARDAN TODAS LAS LINEAS Y NO SOLO EL GRUPO 6 ────────────────
--
-- Porque es la unica forma de distinguir "el mes no tuvo gastos" de "el mes no
-- tiene contabilidad". Medido en el archivo real: febrero-2026 de Vistana tiene
-- UN asiento (un pago de prestamo) y NI UNA cuenta del grupo 6. Guardando solo
-- el grupo 6, ese mes seria identico a un mes nunca cerrado.
-- El GASTO, en cambio, sale SOLO del grupo 6 (regla de negocio: el grupo 5
-- COSTOS no se trae, porque 5.03 COMPRAS existe en 2 de las 8 empresas).
-- =============================================================================

-- 1. Importaciones: una fila por corrida (empresa + rango pedido) -------------

CREATE TABLE IF NOT EXISTS mayor_importaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key    text NOT NULL CHECK (empresa_key IN (
                   'vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes',
                   'active_wear', 'joystep', 'confecciones_boston',
                   'american_classic'
                 )),
  -- El rango que se le PIDIO a Switch. Es lo que permite decir "este mes se
  -- pidio y vino vacio" (sin cerrar) en vez de "no sabemos nada" (no traido).
  rango_desde    date NOT NULL,
  rango_hasta    date NOT NULL CHECK (rango_hasta >= rango_desde),
  -- 'cron' = sincronizacion automatica; 'archivo' = respaldo manual.
  origen         text NOT NULL DEFAULT 'cron' CHECK (origen IN ('cron', 'archivo')),
  archivo_nombre text,
  lineas_total   int NOT NULL DEFAULT 0,
  lineas_gasto   int NOT NULL DEFAULT 0,
  creado_por     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mayor_importaciones_empresa
  ON mayor_importaciones (empresa_key, rango_desde, rango_hasta);

-- 2. Lineas del mayor: una fila por LINEA de asiento -------------------------

CREATE TABLE IF NOT EXISTS mayor_lineas (
  id             bigserial PRIMARY KEY,
  importacion_id uuid REFERENCES mayor_importaciones(id) ON DELETE SET NULL,
  empresa_key    text NOT NULL,
  -- Bucket mensual, SIEMPRE dia 1. Es la unidad de reemplazo idempotente.
  mes            date NOT NULL CHECK (mes = date_trunc('month', mes)::date),
  fecha          date NOT NULL,
  asiento        text NOT NULL,
  descripcion    text,
  -- Codigo COMPLETO de 5 segmentos ("6.03.07.00.00"). No se aplana nunca.
  cuenta         text NOT NULL CHECK (cuenta ~ '^[0-9]+(\.[0-9]+){4}'),
  -- El nombre lo trae el CSV de ESA empresa. NO hay catalogo global a proposito:
  -- el mismo codigo significa cosas distintas segun la empresa (6.03.09 es
  -- "GASTOS DE MARKETING" en Multifashion y "MUEBLES Y ESTANTERIA" en el resto;
  -- 6.03.33 difiere entre Boston y Multifashion). La verdad de cada empresa es
  -- lo que dice SU mayor.
  cuenta_nombre  text,
  -- Los dos SIEMPRE positivos, tal como vienen del CSV.
  debito         numeric(14,2) NOT NULL DEFAULT 0,
  credito        numeric(14,2) NOT NULL DEFAULT 0,
  -- debito - credito. PUEDE SER NEGATIVO y eso es correcto (reversos/ajustes).
  -- Generada: no puede desincronizarse de sus dos sumandos.
  neto           numeric(14,2) GENERATED ALWAYS AS (debito - credito) STORED,
  -- Posicion dentro del archivo. Hace falta porque un MISMO asiento repite la
  -- MISMA cuenta en varias lineas: el asiento 02-012026 trae 6.03.41 dos veces
  -- (una por debito, otra por credito). O sea (empresa, asiento, cuenta) NO
  -- identifica una linea.
  linea_nro      int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mayor_lineas_empresa_mes
  ON mayor_lineas (empresa_key, mes);
CREATE INDEX IF NOT EXISTS idx_mayor_lineas_cuenta
  ON mayor_lineas (empresa_key, mes, cuenta);

-- 3. Reemplazo ATOMICO de un mes ---------------------------------------------
--
-- La idempotencia NO se apoya en una llave unica de contenido, sino en
-- reemplazar el MES COMPLETO: borrar lo que hay de (empresa, mes) e insertar lo
-- que vino. Re-leer un mes ya cargado ACTUALIZA, nunca duplica, y ademas
-- refleja las correcciones de la contadora (una linea que ella borro
-- desaparece; una llave de contenido la habria dejado viva para siempre).
--
-- Va en una funcion para que el DELETE y el INSERT ocurran en la MISMA
-- transaccion: hechos por separado desde PostgREST habria una ventana en la que
-- el mes se ve vacio, y un mes vacio es exactamente lo que la pantalla
-- interpreta como "sin cerrar".

CREATE OR REPLACE FUNCTION mayor_reemplazar_mes(
  p_empresa_key    text,
  p_mes            date,
  p_importacion_id uuid,
  p_lineas         jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS '
DECLARE
  v_insertadas int;
BEGIN
  IF p_mes <> date_trunc(''month'', p_mes)::date THEN
    RAISE EXCEPTION ''p_mes tiene que ser el dia 1 del mes (recibido %)'', p_mes;
  END IF;

  DELETE FROM mayor_lineas
   WHERE empresa_key = p_empresa_key
     AND mes = p_mes;

  INSERT INTO mayor_lineas (
    importacion_id, empresa_key, mes, fecha, asiento, descripcion,
    cuenta, cuenta_nombre, debito, credito, linea_nro
  )
  SELECT
    p_importacion_id,
    p_empresa_key,
    p_mes,
    (x->>''fecha'')::date,
    x->>''asiento'',
    x->>''descripcion'',
    x->>''cuenta'',
    x->>''cuenta_nombre'',
    COALESCE((x->>''debito'')::numeric, 0),
    COALESCE((x->>''credito'')::numeric, 0),
    COALESCE((x->>''linea_nro'')::int, 0)
  FROM jsonb_array_elements(COALESCE(p_lineas, ''[]''::jsonb)) AS x;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
';

-- 4. Rollup mensual de GASTOS (solo grupo 6) ---------------------------------
--
-- Es lo que puede leer la Vista General el dia que se decida enchufarla. Se
-- deja creada pero NO se cablea en esta tanda: mientras la carga manual y el
-- mayor puedan describir el mismo mes, elegir cual gana es una decision de
-- negocio de Daniel, no del codigo.

CREATE OR REPLACE VIEW mayor_gastos_mensual_v AS
SELECT
  l.empresa_key,
  l.mes,
  l.cuenta,
  -- Los 3 segmentos que se muestran en pantalla ("6.03.07").
  split_part(l.cuenta, '.', 1) || '.' || split_part(l.cuenta, '.', 2) || '.' ||
    split_part(l.cuenta, '.', 3)                       AS cuenta_corta,
  MIN(l.cuenta_nombre)                                 AS cuenta_nombre,
  SUM(l.debito)                                        AS debito,
  SUM(l.credito)                                       AS credito,
  SUM(l.neto)                                          AS neto,
  COUNT(*)                                             AS lineas
FROM mayor_lineas l
WHERE l.cuenta LIKE '6.%'
GROUP BY l.empresa_key, l.mes, l.cuenta;

-- 5. sync_type 'mayor' (un CHECK no se extiende: se reescribe entero) ---------
-- Sin esto el logger es degradable: el INSERT viola el CHECK, se traga el error
-- y la corrida NO deja fila ni de exito ni de error. Ya paso dos veces
-- (catalogo_tommy y articulo_marca), por eso va en la MISMA migracion.

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'mayor'
  ));

-- 6. RLS: patron estandar service_role only -----------------------------------

ALTER TABLE mayor_importaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON mayor_importaciones;
CREATE POLICY service_role_all ON mayor_importaciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE mayor_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON mayor_lineas;
CREATE POLICY service_role_all ON mayor_lineas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. Permisos: card visible para contabilidad ---------------------------------

UPDATE role_permissions
SET modulos = array_append(modulos, 'gastos-contabilidad')
WHERE role = 'contabilidad'
  AND NOT ('gastos-contabilidad' = ANY (COALESCE(modulos, '{}')));

-- Refrescar schema cache de PostgREST.
NOTIFY pgrst, 'reload schema';
