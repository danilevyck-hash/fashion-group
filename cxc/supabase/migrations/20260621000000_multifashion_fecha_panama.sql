-- ─────────────────────────────────────────────────────────────────────────────
-- FIX zona horaria: _multifashion_sf_vw bucketiza anio/mes/fecha por DÍA PANAMÁ.
--
-- Problema: la vista derivaba anio/mes/fecha con EXTRACT/::date sobre el timestamptz
-- crudo (= UTC). Panamá es UTC-5, así que las ventas de la NOCHE (≈7-11pm Panamá)
-- caían al día siguiente UTC. Efecto visible: el gráfico día-a-día y `dia_actual`
-- partían mal la última noche (ej. jun-20 noche → "día 21"), y la barra del día
-- quedaba corta vs Switch (Switch reporta por día Panamá).
--
-- La hora pico YA convertía a Panamá (fecha_ts AT TIME ZONE 'America/Panama'); este
-- cambio aplica la MISMA conversión al día/mes/año. Único cambio: las 3 primeras
-- expresiones. fecha_ts (timestamptz crudo) y subtotal_comision quedan idénticas.
-- Mismos nombres/tipos de columna (anio/mes int, fecha date) → CREATE OR REPLACE
-- no rompe dependientes. Vista plana (no MV), reemplazo instantáneo.
--
-- Propaga el fix a TODO consumidor que lea anio/mes/fecha de la vista (gráfico,
-- dia_actual, mejor/peor día, YoY, proyección, YTD, clientes, vendedoras v3+range,
-- bonos). Volumen american_classic = 27,098 filas → perf del filtro por expresión
-- despreciable.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW _multifashion_sf_vw AS
SELECT
  'american_classic'::text                                          AS empresa,
  EXTRACT(YEAR  FROM (fecha AT TIME ZONE 'America/Panama'))::int     AS anio,
  EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Panama'))::int     AS mes,
  (fecha AT TIME ZONE 'America/Panama')::date                        AS fecha,
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
