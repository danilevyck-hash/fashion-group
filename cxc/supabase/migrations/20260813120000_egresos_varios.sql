-- =============================================================================
-- EGRESOS VARIOS de Switch (Caja y Bancos -> Reportes -> Egresos Varios)
-- =============================================================================
-- Aplicar A MANO en Supabase Dashboard -> SQL Editor.
-- ADITIVA e IDEMPOTENTE. CERO DELETE/DROP de objetos existentes.
--
-- La pantalla /gastos-contabilidad FUNCIONA ANTES de que esto corra: la ruta
-- reconoce "la tabla no existe" (PostgREST 42P01 / PGRST205) y responde
-- "esta fuente todavia no esta encendida" en vez de reventar; y el cron
-- `sync-egresos-varios` se omite LIMPIO sin abrir una sola sesion en Switch
-- (mismo patron que calvin-catalogo).
--
-- ── POR QUE UNA TABLA NUEVA Y NO `mayor_lineas` ─────────────────────────────
--
-- El mayor NO se apaga: enero-2026 esta cerrado ahi y hay que poder comparar
-- las dos fuentes antes de decidir nada. Pero no pueden vivir en la misma
-- tabla, por cuatro razones medidas:
--
--  1. SON COSAS DISTINTAS. El mayor es contabilidad DEVENGADA (una linea por
--     asiento, con debito y credito, incluye depreciacion y provisiones);
--     egresos varios es CAJA (un renglon por pago, un solo monto). Meterlos
--     juntos obliga a inventar un debito/credito que no existe.
--  2. ENERO ESTA EN LAS DOS. Vistana enero-2026: 44 lineas de mayor y 46
--     egresos de caja. En una sola tabla, cualquier SUM(...) del mes contaria
--     enero dos veces, y no habria columna con que desambiguar.
--  3. La llave del mayor es la POSICION en el archivo (`linea_nro`) porque un
--     mismo asiento repite la misma cuenta; la de egresos es el DOCUMENTO
--     (`n_interno`). Son identidades distintas.
--  4. El mayor guarda `debito`/`credito` y deriva `neto` (que puede ser
--     NEGATIVO). Egresos guarda `total`, que en los 378 renglones reales es
--     siempre positivo.
--
-- ── POR QUE SE GUARDAN TODOS LOS GRUPOS Y NO SOLO EL 6 ──────────────────────
--
-- El reporte trae TODO lo que sale de caja y banco. Medido sobre los 378
-- renglones reales de Vistana (1-ene -> 13-ago-2026, $243.342,48):
--   grupo 6 GASTOS 233 renglones $118.753,76  <- esto es GASTO
--   grupo 2 pasivos 101          $ 36.012,81
--   grupo 1 activos  40          $ 83.439,75  <- transferencias entre cuentas
--   grupo 3 patrimonio 2         $  4.212,34
--   grupo 5 costos     2         $    923,82
-- Guardar solo el grupo 6 haria imposible cuadrar contra el panel de Switch
-- (que muestra el total), y "salio plata" seria indistinguible de "gaste".
-- La separacion la hace el codigo (`src/lib/egresos/reglas.ts`), con el MISMO
-- criterio de gasto que el mayor.
-- =============================================================================

-- 1. Importaciones: una fila por corrida (empresa + rango pedido) -------------

CREATE TABLE IF NOT EXISTS egresos_importaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key     text NOT NULL CHECK (empresa_key IN (
                    'vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes',
                    'active_wear', 'joystep', 'confecciones_boston',
                    'american_classic'
                  )),
  -- El rango que se le PIDIO a Switch. Es lo que permite decir "este mes se
  -- pidio y no tuvo movimientos" en vez de "no sabemos nada".
  rango_desde     date NOT NULL,
  rango_hasta     date NOT NULL CHECK (rango_hasta >= rango_desde),
  origen          text NOT NULL DEFAULT 'cron' CHECK (origen IN ('cron', 'archivo')),
  archivo_nombre  text,
  renglones_total int NOT NULL DEFAULT 0,
  renglones_gasto int NOT NULL DEFAULT 0,
  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_egresos_importaciones_empresa
  ON egresos_importaciones (empresa_key, rango_desde, rango_hasta);

-- 2. Egresos: una fila por RENGLON del reporte -------------------------------

CREATE TABLE IF NOT EXISTS egresos_varios (
  id             bigserial PRIMARY KEY,
  importacion_id uuid REFERENCES egresos_importaciones(id) ON DELETE SET NULL,
  empresa_key    text NOT NULL,
  -- Bucket mensual, SIEMPRE dia 1. Es la unidad de reemplazo idempotente.
  mes            date NOT NULL CHECK (mes = date_trunc('month', mes)::date),
  fecha          date NOT NULL,
  -- N. INTERNO del documento ("120-000001276"). Es la identidad con la que se
  -- audita un renglon contra el panel de Switch.
  --
  -- 🔴 NO LLEVA UNIQUE, Y ES A PROPOSITO. Un mismo egreso PUEDE repartirse en
  -- varias cuentas contables, y un UNIQUE por documento haria fallar el sync
  -- entero (o, peor, obligaria a colapsar renglones y PERDER plata). La
  -- garantia anti-duplicado no es un indice: es el REEMPLAZO DE MES de
  -- `egresos_reemplazar_mes`, que borra antes de insertar. Medido sobre los 378
  -- renglones reales: los 378 n_interno son distintos, o sea que hoy ningun
  -- egreso se reparte -- pero el esquema no puede apostar a que siga asi.
  n_interno      text NOT NULL,
  -- Codigo COMPLETO de 5 segmentos ("6.03.98.00.00"). No se aplana nunca.
  cuenta         text NOT NULL CHECK (cuenta ~ '^[0-9]+(\.[0-9]+){4}'),
  sucursal       text,
  -- Viene VACIA en los 378 renglones reales; el dato humano esta en referencia.
  proveedor      text,
  referencia     text,
  -- Lo que salio. Positivo en los 378 renglones reales; la columna admite
  -- negativos por si Switch registra un reverso, y el codigo NUNCA toma valor
  -- absoluto (su firma es que la diferencia da exactamente el doble).
  total          numeric(14,2) NOT NULL DEFAULT 0,
  -- Posicion dentro del archivo, para poder reconstruir el orden original.
  linea_nro      int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_egresos_varios_empresa_mes
  ON egresos_varios (empresa_key, mes);
CREATE INDEX IF NOT EXISTS idx_egresos_varios_cuenta
  ON egresos_varios (empresa_key, mes, cuenta);
-- Para auditar un documento contra el panel de Switch.
CREATE INDEX IF NOT EXISTS idx_egresos_varios_ninterno
  ON egresos_varios (empresa_key, n_interno);

-- 3. Reemplazo ATOMICO de un mes ---------------------------------------------
--
-- La idempotencia NO se apoya en una llave unica de contenido, sino en
-- reemplazar el MES COMPLETO: borrar lo que hay de (empresa, mes) e insertar lo
-- que vino. Re-leer un mes ya cargado ACTUALIZA, nunca duplica, y ademas refleja
-- las anulaciones (un egreso anulado en Switch desaparece; una llave de
-- contenido lo habria dejado vivo para siempre).
--
-- Va en una funcion para que el DELETE y el INSERT ocurran en la MISMA
-- transaccion: hechos por separado desde PostgREST habria una ventana en la que
-- el mes se ve vacio, y un mes vacio es exactamente lo que la pantalla
-- interpreta como "sin movimientos".

CREATE OR REPLACE FUNCTION egresos_reemplazar_mes(
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

  DELETE FROM egresos_varios
   WHERE empresa_key = p_empresa_key
     AND mes = p_mes;

  INSERT INTO egresos_varios (
    importacion_id, empresa_key, mes, fecha, n_interno,
    cuenta, sucursal, proveedor, referencia, total, linea_nro
  )
  SELECT
    p_importacion_id,
    p_empresa_key,
    p_mes,
    (x->>''fecha'')::date,
    x->>''n_interno'',
    x->>''cuenta'',
    x->>''sucursal'',
    x->>''proveedor'',
    x->>''referencia'',
    COALESCE((x->>''total'')::numeric, 0),
    COALESCE((x->>''linea_nro'')::int, 0)
  FROM jsonb_array_elements(COALESCE(p_lineas, ''[]''::jsonb)) AS x;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
';

-- 4. Rollup mensual por cuenta -----------------------------------------------
--
-- Se deja creada pero NO se cablea a Vista General en esta tanda: mientras el
-- mayor y los egresos puedan describir el mismo mes, elegir cual gana es una
-- decision de negocio de Daniel, no del codigo. `es_gasto` es el MISMO criterio
-- que usa el mayor (grupo 6).

CREATE OR REPLACE VIEW egresos_varios_mensual_v AS
SELECT
  e.empresa_key,
  e.mes,
  e.cuenta,
  split_part(e.cuenta, '.', 1) || '.' || split_part(e.cuenta, '.', 2) || '.' ||
    split_part(e.cuenta, '.', 3)                     AS cuenta_corta,
  split_part(e.cuenta, '.', 1)                       AS grupo,
  (split_part(e.cuenta, '.', 1) = '6')               AS es_gasto,
  SUM(e.total)                                       AS total,
  COUNT(*)                                           AS renglones,
  COUNT(DISTINCT e.n_interno)                        AS documentos
FROM egresos_varios e
GROUP BY e.empresa_key, e.mes, e.cuenta;

-- 5. sync_type 'egresos_varios' (un CHECK no se extiende: se reescribe entero) -
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
    'catalogo_calvin',
    'mayor',
    'egresos_varios'
  ));

-- 6. RLS: patron estandar service_role only -----------------------------------

ALTER TABLE egresos_importaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON egresos_importaciones;
CREATE POLICY service_role_all ON egresos_importaciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE egresos_varios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON egresos_varios;
CREATE POLICY service_role_all ON egresos_varios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Refrescar schema cache de PostgREST.
NOTIFY pgrst, 'reload schema';
