-- ═════════════════════════════════════════════════════════════════════════════
-- Multifashion (american_classic) — Comisión SOLO sobre ventas de CONTADO
-- ═════════════════════════════════════════════════════════════════════════════
-- Contexto: el reporte oficial de Switch comisiona únicamente las facturas de
-- CONTADO. fashiongr venía comisionando TODA factura por fecha de emisión
-- (incluidas las de crédito), lo que inflaba la base. Validado con Jennifer
-- Miranda, mayo 2026:
--   base contado − NC = 4,479.72   →   comisión 0.5% = 22.40
--   (antes: base 5,147.88 → comisión 25.74)
--
-- Alcance del cambio (NO mezclar):
--   • SOLO la columna `comision` usa la base de contado.
--   • `ventas` y `tickets` (mostrados al usuario) siguen incluyendo TODO,
--     contado y crédito — sin cambios.
--
-- Regla de la base de comisión (`subtotal_comision`):
--   • Documentos positivos (Factura/Tiquete/Transacción/Nota de Débito)
--     comisionan SOLO si condicion_venta = 'Contado'. Las de 'Credito' NO.
--   • Las Notas de Crédito SIEMPRE restan. Switch las emite sin
--     condicion_venta (NULL); el reporte oficial las descuenta del neto de
--     contado, y el target validado (4,656.96 contado − 177.23 NC = 4,479.72)
--     confirma que todas las NC se restan. [Asunción a confirmar: no hay forma
--     en los datos de ligar una NC a su factura origen para saber si era a
--     crédito.]
--
-- No toca migraciones históricas. Recrea (CREATE OR REPLACE):
--   1) la vista _multifashion_sf_vw → agrega columna `subtotal_comision`
--      (aditivo; las demás RPC que leen la vista la ignoran).
--   2) la función multifashion_vendedoras_v3 → la columna `comision` pasa a
--      usar SUM(subtotal_comision). Todo lo demás idéntico a la versión vigente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Vista: agrega subtotal_comision (base de comisión = solo contado) ─────
-- Reproduce la definición VIGENTE (20260601000400_multifashion_horas_pico.sql)
-- y APENDE `subtotal_comision` al final. `subtotal` queda intacto (= todo).
CREATE OR REPLACE VIEW _multifashion_sf_vw AS
SELECT
  'american_classic'::text                AS empresa,
  EXTRACT(YEAR  FROM fecha)::int          AS anio,
  EXTRACT(MONTH FROM fecha)::int          AS mes,
  fecha::date                             AS fecha,
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
  -- NUEVO: base de comisión = SOLO contado. Positivos comisionan únicamente si
  -- condicion_venta='Contado'; las NC siempre restan. Las ventas a crédito NO
  -- comisionan. NO afecta `subtotal` (ventas/tickets siguen incluyendo todo).
  CASE
    WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito')
         AND condicion_venta = 'Contado' THEN subtotal_descuento
    WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
    ELSE 0
  END                                     AS subtotal_comision
FROM switch_facturas
WHERE empresa_key = 'american_classic';

GRANT SELECT ON _multifashion_sf_vw TO service_role;

-- ─── 2) Función vendedoras: comisión sobre base de contado ────────────────────
-- Idéntica a la versión vigente (20260530000000) EXCEPTO:
--   • CTE `actual` agrega  SUM(subtotal_comision) AS base_comision
--   • 'comision'  pasa de  a.ventas * 0.005  →  a.base_comision * 0.005
CREATE OR REPLACE FUNCTION multifashion_vendedoras_v3(
  p_year int, p_periodo text, p_mes int DEFAULT NULL, p_trimestre int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers jsonb;
  v_actual_inicio date; v_actual_fin_full date;
  v_prev_inicio date;   v_prev_fin_full date;
  v_actual_fin date;    v_prev_fin date;
  v_dia_offset int;
  v_es_parcial boolean;
  v_top_vendedor text;
  v_vendedoras jsonb;
  v_ventas_total numeric; v_tickets_total bigint;
  v_ventas_total_prev numeric; v_tickets_total_prev bigint;
  v_prev_year int; v_prev_month int; v_prev_trim int;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes requerido (1..12)'; END IF;
    v_actual_inicio := make_date(p_year, p_mes, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF p_mes > 1 THEN v_prev_year := p_year; v_prev_month := p_mes - 1;
    ELSE v_prev_year := p_year - 1; v_prev_month := 12; END IF;
    v_prev_inicio := make_date(v_prev_year, v_prev_month, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN RAISE EXCEPTION 'p_trimestre requerido (1..4)'; END IF;
    v_actual_inicio := make_date(p_year, (p_trimestre - 1) * 3 + 1, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
    IF p_trimestre > 1 THEN v_prev_year := p_year; v_prev_trim := p_trimestre - 1;
    ELSE v_prev_year := p_year - 1; v_prev_trim := 4; END IF;
    v_prev_inicio := make_date(v_prev_year, (v_prev_trim - 1) * 3 + 1, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'ytd' THEN
    v_actual_inicio := make_date(p_year, 1, 1);     v_actual_fin_full := make_date(p_year, 12, 31);
    v_prev_inicio   := make_date(p_year - 1, 1, 1); v_prev_fin_full   := make_date(p_year - 1, 12, 31);
  ELSE RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  SELECT MAX(fecha) INTO v_actual_fin FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  IF v_actual_fin IS NULL THEN
    RETURN jsonb_build_object(
      'vendedoras', '[]'::jsonb, 'total_vendedoras_periodo', 0,
      'ventas_total', 0, 'tickets_total', 0, 'ventas_total_prev', 0, 'tickets_total_prev', 0,
      'fecha_corte', NULL, 'es_periodo_parcial', v_es_parcial,
      'dia_corte_periodo_anterior', NULL, 'dia_corte_anio_anterior', NULL
    );
  END IF;

  IF v_es_parcial THEN v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE v_actual_fin := v_actual_fin_full; v_prev_fin := v_prev_fin_full; END IF;

  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.base_comision * 0.005,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    ) ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total, v_tickets_total
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior',    to_char(v_prev_fin, 'YYYY-MM-DD')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_vendedoras_v3(int, text, int, int) TO service_role;
