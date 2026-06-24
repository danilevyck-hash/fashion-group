-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Multifashion — índice de expresión sobre fecha-local Panamá (Parte A
-- del audit de performance). SIN tocar force-dynamic, SIN mover un centavo.
--
-- PROBLEMA: el cuello de multifashion_mensual_v6/v7 (bloque retail.meses) hace ~48
-- scans de _multifashion_sf_vw con `fecha BETWEEN inicio AND corte` (y anio/mes).
-- La vista deriva fecha/anio/mes como (fecha AT TIME ZONE 'America/Panama') — y el
-- único índice (idx_sf_empresa_fecha) está sobre el `fecha` CRUDO (UTC). Filtrar
-- sobre la expresión Panamá no es sargable contra ese índice → seq-scan + conversión
-- TZ por fila, ~48 veces.
--
-- POR QUÉ NO SE PUEDE "solo crear el índice" propuesto por el audit:
--   CREATE INDEX ... ((fecha AT TIME ZONE 'America/Panama')::date) FALLA: la función
--   timezone(text, timestamptz) es STABLE, y Postgres EXIGE IMMUTABLE en expresiones
--   de índice ("functions in index expression must be marked IMMUTABLE").
--
-- FIX: wrapper IMMUTABLE mf_panama_date(timestamptz) que envuelve la EXPRESIÓN
-- EXACTA ((ts AT TIME ZONE 'America/Panama')::date). Reescribir _multifashion_sf_vw
-- para usarlo en fecha/anio/mes → la vista produce valores BYTE-IDÉNTICOS (es la
-- misma cuenta, solo envuelta) → NINGÚN consumidor mueve un número. Y el índice de
-- expresión sobre mf_panama_date(fecha) ahora SÍ es creable y el planner lo usa
-- para el predicado `mf_panama_date(fecha) BETWEEN ...` (el bloque de los ~48 scans).
--
-- SEGURIDAD del IMMUTABLE: marcar la función IMMUTABLE es seguro para Panamá: UTC-5
-- fijo desde 1908, sin DST ni cambios de offset (jamás cambia para data 2022+). Es
-- el patrón estándar para indexar timestamps convertidos a zona de regla fija.
--
-- IMPACTO: el bloque retail.meses (~48 scans) pasa de seq-scan a index range-seek.
-- (Los bloques YTD `anio=X` siguen sin índice — son 4 agregados baratos; no se tocan.)
--
-- ⚠️ APLICACIÓN EN DOS PASOS (CREATE INDEX CONCURRENTLY NO corre en transacción):
--   PASO 1: correr el bloque de abajo (función + vista) — es transaccional, OK.
--   PASO 2: correr el CREATE INDEX CONCURRENTLY SOLO, como statement suelto (no
--           junto con otros statements ni dentro de BEGIN/COMMIT).
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ PASO 1 (transaccional) ═══════════════════════════════════════════════════

-- Wrapper IMMUTABLE = la MISMA expresión que ya usaba la vista (byte-idéntico).
CREATE OR REPLACE FUNCTION mf_panama_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT (ts AT TIME ZONE 'America/Panama')::date $$;

GRANT EXECUTE ON FUNCTION mf_panama_date(timestamptz) TO service_role;

-- Reescritura de la vista: SOLO fecha/anio/mes pasan a usar mf_panama_date(fecha).
-- El resto de columnas (subtotal, total, is_wholesale, fecha_ts, etc.) IDÉNTICO.
-- Valores byte-idénticos a la versión vigente (la función envuelve la misma cuenta).
CREATE OR REPLACE VIEW _multifashion_sf_vw AS
SELECT
  'american_classic'::text                          AS empresa,
  EXTRACT(YEAR  FROM mf_panama_date(fecha))::int     AS anio,
  EXTRACT(MONTH FROM mf_panama_date(fecha))::int     AS mes,
  mf_panama_date(fecha)                              AS fecha,
  switch_factura_id::text                 AS n_sistema,
  vendedor_nombre                         AS vendedor,
  cliente_nombre                          AS cliente,
  CASE
    WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
    WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
    ELSE 0
  END                                     AS subtotal,
  total::numeric                          AS total,
  is_wholesale,
  tipo_comprobante,
  1::int                                  AS _row,
  -- timestamp crudo (UTC) para análisis de hora del día. Convertir a hora local
  -- con AT TIME ZONE 'America/Panama' en el consumidor.
  fecha                                   AS fecha_ts,
  -- base de comisión = SOLO contado (las NC siempre restan; crédito NO comisiona).
  CASE
    WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito')
         AND condicion_venta = 'Contado' THEN subtotal_descuento
    WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
    ELSE 0
  END                                     AS subtotal_comision
FROM switch_facturas
WHERE empresa_key = 'american_classic';

NOTIFY pgrst, 'reload schema';

-- ═══ PASO 2 — CORRER SOLO, SEPARADO (CONCURRENTLY no va en transacción) ═══════
-- Índice de expresión sobre la fecha-local Panamá + is_wholesale, parcial al slice
-- american_classic. Hace sargable `mf_panama_date(fecha) BETWEEN ...` (el bloque de
-- los ~48 scans de retail.meses). CONCURRENTLY = sin lock de escritura.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_ac_panama_date
  ON switch_facturas (mf_panama_date(fecha), is_wholesale)
  WHERE empresa_key = 'american_classic';
