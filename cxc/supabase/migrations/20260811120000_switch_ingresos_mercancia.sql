-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_ingresos_mercancia — el detalle LÍNEA POR ARTÍCULO de lo que
-- entró a bodega, de las empresas del grupo, desde 2022.
--
-- Es el dato que faltaba para responder "compré X unidades tal fecha y se me
-- acabaron en Y meses". Hoy el sistema sabe lo que VENDIÓ por artículo
-- (switch_articulo_diario) y lo que TIENE (switch_articulo_info), pero no lo que
-- COMPRÓ: sin la entrada, la rotación no se puede calcular.
--
-- ── DE DÓNDE SALE, y por qué NO del API ─────────────────────────────────────
-- `/apiingresomercancia/lista` e `/info` responden 200 pero el detalle trae solo
-- 10 campos ESCALARES (id, secuencial, fecha, subTotal, impuesto, total,
-- proveedor, proveedorId, sucursal, sucursalId) y CERO líneas por artículo —
-- verificado en vivo contra 3 documentos. La API sabe que entraron $542,08 de
-- mercancía; no sabe de qué artículo.
--
-- La fuente es el reporte WEB `Stock → Reportes → Reporte ingreso mercancía`,
-- botón **Descargar Detalle** (CSV con `;`). El mismo reporte tiene un botón
-- "Descargar" (resumen, una fila por documento) que se usa SOLO para CUADRAR:
-- las unidades del detalle tienen que sumar exactamente las del resumen,
-- documento por documento, o no se carga nada.
--
-- ── 🔴 FOB Y CIF SE GUARDAN TAL COMO VIENEN ─────────────────────────────────
-- Son los del momento de la compra (mucho mejor que estimar CIF÷1,1). PERO en la
-- muestra medida de vistana solo **104 de 1.477 líneas tienen FOB ≠ CIF**: en el
-- 93% vienen iguales, y eso es un error de carga conocido EN SWITCH, del lado de
-- Daniel. **No se corrige ni se estima acá** — arreglarlo sería inventar plata.
-- La columna generada `fob_confiable` deja que quien lea después distinga "FOB
-- de verdad" de "FOB que es el CIF repetido" sin tener que reimplementar la
-- regla ni adivinar.
--
-- ── 🔴 LOS SIGNOS NO SE TOCAN ───────────────────────────────────────────────
-- `cantidad` se guarda tal como viene del reporte. Este sistema ya pagó un error
-- grave por firmar lo que no había que firmar (la firma de ese bug es que la
-- diferencia da exactamente el DOBLE). Si algún día aparecen devoluciones de
-- compra en negativo, se miden y se decide; no se asume.
--
-- ── 🔴 LA LLAVE **NO** ES (empresa, n_interno, codigo_articulo) ─────────────
-- Esa era la candidata obvia, y MEDIRLA fue lo que la descartó: sobre la bajada
-- completa (2022-01-01 → 2026-08-10) hay **6 pares `(n_interno, codigo)` que
-- aparecen DOS VECES**, en 4 de las 5 empresas bajadas:
--
--   active_wear   19-000000014  RBKFHJB        → 200 uds + 60 uds
--   active_shoes  19-000000054  EY-32228BK     · 19-000000054  EY-41297BK
--                 19-000000055  100228710      · 19-000000078  100250370
--   fashion_shoes 19-000000207  TW2021004-120
--
-- Con esa llave, el upsert habría pisado un renglón con el otro y perdido
-- unidades EN SILENCIO — en el caso de active_wear, 60 unidades de un artículo
-- de 200. Es exactamente "info duplicada o mal" y no se puede permitir.
--
-- La llave es **`(empresa_key, n_interno, linea)`**, donde `linea` es el orden
-- del renglón dentro de su documento (1-based, tal como lo entrega el reporte).
-- Y la carga **REEMPLAZA EL DOCUMENTO ENTERO** (borra sus filas y las inserta de
-- nuevo) en vez de hacer upsert renglón por renglón: así, si mañana Switch
-- devuelve los renglones en otro orden, el documento queda íntegro y no se
-- duplica ni se pierde nada. Re-cargar el mismo rango es idempotente.
--
-- Tabla nueva y aditiva: no toca ninguna tabla existente. Seguro de correr en
-- caliente. Evitar igual las ventanas de sync: 05:30-07:35 y 23:50-00:20 UTC.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_ingresos_mercancia (
  empresa_key      text NOT NULL,
  -- Día del ingreso, tal como lo publica el reporte (YYYY-MM-DD, sin hora).
  fecha            date NOT NULL,
  -- Número interno del documento de ingreso, ej. '19-000000580'.
  n_interno        text NOT NULL,
  -- Orden del renglón dentro de su documento (1-based). Ver el encabezado: sin
  -- esto, un artículo repetido en el mismo documento pisa al otro.
  linea            int  NOT NULL,
  sucursal         text,
  proveedor        text,
  codigo_articulo  text NOT NULL,
  -- Nombre del artículo tal como viene (los dobles espacios ya colapsados).
  articulo         text,
  referencia       text,
  -- Precio de venta de etiqueta al momento del ingreso.
  precio           numeric(14,4),
  -- 🔴 TAL COMO VIENE. Sin signo agregado. Ver el encabezado.
  cantidad         numeric(18,4) NOT NULL,
  -- 🔴 Los dos TAL COMO VIENEN. En el 93% de las líneas son iguales (error de
  -- carga en Switch). No se corrigen ni se derivan uno del otro.
  costo_fob        numeric(14,4),
  costo_cif        numeric(14,4),
  -- 🔴 El reporte de FASHION SHOES trae UNA sola columna `COSTO`, sin desglose
  -- FOB/CIF (12 columnas en vez de 13; las otras 4 empresas sí lo traen). NO SE
  -- SABE cuál de los dos es, así que NO se copia a `costo_fob` ni a `costo_cif`
  -- — meter un CIF en la columna del FOB haría que su margen salga mal sin que
  -- nadie pueda notarlo. Queda acá, a la espera de que Daniel lo confirme
  -- contra Switch. (El menú de Stock tiene un módulo aparte, `/imercanciafob`:
  -- el desglose es una función que está prendida en unas empresas y no en otras.)
  costo_sin_desglosar numeric(14,4),
  costo_promedio   numeric(14,4),
  utilidad_pct     numeric(12,4),
  synced_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, n_interno, linea)
);

-- ¿El FOB de esta línea es un dato propio, o es el CIF repetido?
-- Se calcula en la base para que NADIE tenga que reimplementar la regla: si
-- viviera solo en TypeScript, la primera consulta SQL que alguien escriba a mano
-- iba a sumar los 1.373 FOB falsos junto con los 104 buenos.
ALTER TABLE switch_ingresos_mercancia
  ADD COLUMN IF NOT EXISTS fob_confiable boolean
  GENERATED ALWAYS AS (
    costo_fob IS NOT NULL AND costo_cif IS NOT NULL AND costo_fob <> costo_cif
  ) STORED;

-- Rotación: "de este código, cuándo y cuánto entró". Es LA consulta del módulo.
CREATE INDEX IF NOT EXISTS idx_sim_codigo_fecha
  ON switch_ingresos_mercancia (empresa_key, codigo_articulo, fecha);

-- Barridos por período (qué entró en tal mes, de todas las empresas).
CREATE INDEX IF NOT EXISTS idx_sim_fecha
  ON switch_ingresos_mercancia (fecha);

-- Ficha del proveedor: qué le compramos y cuándo.
CREATE INDEX IF NOT EXISTS idx_sim_proveedor_fecha
  ON switch_ingresos_mercancia (empresa_key, proveedor, fecha);

ALTER TABLE switch_ingresos_mercancia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON switch_ingresos_mercancia;
CREATE POLICY service_role_all ON switch_ingresos_mercancia
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON switch_ingresos_mercancia TO service_role;

-- ── Verificacion (correr despues) ───────────────────────────────────────────
--   SELECT empresa_key,
--          count(*)                          AS lineas,
--          count(DISTINCT n_interno)         AS documentos,
--          sum(cantidad)                     AS unidades,
--          min(fecha)                        AS desde,
--          max(fecha)                        AS hasta,
--          count(*) FILTER (WHERE fob_confiable)          AS con_fob_propio,
--          count(*) FILTER (WHERE costo_sin_desglosar IS NOT NULL)
--                                                         AS sin_desglose_fob_cif,
--          count(*) FILTER (WHERE cantidad < 0)           AS negativas
--   FROM switch_ingresos_mercancia
--   GROUP BY empresa_key
--   ORDER BY empresa_key;
--
-- Esperado tras la primera carga (medido el 11-ago-2026, 4 empresas — ver el PR):
--   vistana       10.138 líneas ·  703 docs ·   453.768 uds · 2022-10-25 → 2026-08-07
--   fashion_wear  18.529 líneas ·  748 docs · 708.526,60 uds · 2023-01-27 → 2026-08-07
--   fashion_shoes  3.515 líneas ·  209 docs · 410.539,50 uds · 2023-01-29 → 2026-08-07
--   active_wear      558 líneas ·   25 docs ·    37.363 uds · 2022-12-02 → 2026-07-09
