-- ─────────────────────────────────────────────────────────────────────────────
-- Proyección de cierre MENSUAL por 2 regímenes (método-b, validado backtest 8.6%).
-- Bucketea por día Panamá (igual que _multifashion_sf_vw). Aplicar manual en
-- Supabase Dashboard → SQL Editor.
--
-- RETAIL (proyeccion_mensual_retail_v1): american_classic + confecciones_boston.
--   método-b = acum_real + (días_mes − dia_corte) × run_rate
--   run_rate = (acum − Σpicos) / (dia_corte − n_picos)   [por día calendario]
--   picos = días > 4× mediana del mes (SOLO si dia_corte≥10 Y la empresa los detecta:
--           american_classic=SÍ, confecciones_boston=NO). El pico queda en acum_real,
--           NO se extrapola. dia_corte = último día con venta (= "al día N").
--   Sobre is_wholesale=false. Para american_classic devuelve además mayoreo del mes
--   (is_wholesale=true) → proyeccion_total = retail + mayoreo (P5, sin extrapolar).
--   suficiente_data = ≥3 días con venta en el mes.
--
-- MAYORISTA (proyeccion_mensual_mayorista_v1): las 6 mayoristas. run-rate plano sobre
--   el total, SIN picos (su venta lumpy es normal). dias_transcurridos = días de
--   CALENDARIO corridos (hoy Panamá) — NO el último día con venta, porque sus órdenes
--   son esporádicas y los días secos deben contar. volatil=true siempre.
--   "datos insuficientes" si <3 días con venta en el mes (cubre active_wear/joystep/
--   active_shoes, que casi nunca llegan a 3).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION proyeccion_mensual_retail_v1(p_anio int, p_mes int)
RETURNS jsonb LANGUAGE sql STABLE AS $$
WITH cfg(empresa_key, detecta_picos) AS (
  VALUES ('american_classic', true), ('confecciones_boston', false)
),
rango AS (
  SELECT make_date(p_anio, p_mes, 1) AS ini,
         (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date AS fin_excl,
         EXTRACT(DAY FROM (make_date(p_anio, p_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int AS dim
),
diario AS (
  SELECT sf.empresa_key,
         EXTRACT(DAY FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS dom,
         SUM(CASE WHEN sf.tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN sf.subtotal_descuento
                  WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento ELSE 0 END) AS net
  FROM switch_facturas sf
  JOIN cfg c ON c.empresa_key = sf.empresa_key
  CROSS JOIN rango r
  WHERE sf.is_wholesale = false
    AND (sf.fecha AT TIME ZONE 'America/Panama') >= r.ini
    AND (sf.fecha AT TIME ZONE 'America/Panama') <  r.fin_excl
  GROUP BY 1, 2
),
dpos AS (SELECT * FROM diario WHERE net > 0),
stats AS (
  SELECT empresa_key, SUM(net) AS acum, MAX(dom) AS dia_corte, COUNT(*) AS nd,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY net) AS med
  FROM dpos GROUP BY empresa_key
),
picos AS (
  SELECT d.empresa_key, SUM(d.net) AS pico_monto, COUNT(*) AS n_picos
  FROM dpos d
  JOIN stats s ON s.empresa_key = d.empresa_key
  JOIN cfg   c ON c.empresa_key = d.empresa_key
  WHERE c.detecta_picos AND s.dia_corte >= 10 AND d.net > 4 * s.med
  GROUP BY d.empresa_key
),
mayoreo AS (
  SELECT sf.empresa_key,
         SUM(CASE WHEN sf.tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN sf.subtotal_descuento
                  WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento ELSE 0 END) AS monto
  FROM switch_facturas sf CROSS JOIN rango r
  WHERE sf.empresa_key = 'american_classic' AND sf.is_wholesale = true
    AND (sf.fecha AT TIME ZONE 'America/Panama') >= r.ini
    AND (sf.fecha AT TIME ZONE 'America/Panama') <  r.fin_excl
  GROUP BY 1
),
calc AS (
  SELECT c.empresa_key, r.dim,
         s.acum, s.dia_corte, s.nd,
         COALESCE(p.pico_monto, 0) AS pico_monto, COALESCE(p.n_picos, 0) AS n_picos,
         COALESCE(m.monto, 0) AS mayoreo,
         (s.nd >= 3) AS suf,
         CASE WHEN s.dia_corte - COALESCE(p.n_picos,0) > 0
              THEN (s.acum - COALESCE(p.pico_monto,0)) / (s.dia_corte - COALESCE(p.n_picos,0))
              ELSE 0 END AS run_rate
  FROM cfg c
  CROSS JOIN rango r
  LEFT JOIN stats   s ON s.empresa_key = c.empresa_key
  LEFT JOIN picos   p ON p.empresa_key = c.empresa_key
  LEFT JOIN mayoreo m ON m.empresa_key = c.empresa_key
)
SELECT jsonb_agg(jsonb_build_object(
  'empresa_key', empresa_key, 'regimen', 'retail',
  'suficiente_data', COALESCE(suf, false),
  'dia_corte', COALESCE(dia_corte, 0), 'dias_mes', dim,
  'acumulado', COALESCE(acum, 0), 'n_picos', n_picos, 'pico_monto', pico_monto, 'run_rate', run_rate,
  'mayoreo', mayoreo,
  'proyeccion_retail', CASE WHEN suf THEN acum + (dim - dia_corte) * run_rate ELSE NULL END,
  'proyeccion_total',  CASE WHEN suf THEN acum + (dim - dia_corte) * run_rate + mayoreo ELSE NULL END,
  'nota', CASE WHEN COALESCE(suf,false) THEN NULL ELSE 'datos insuficientes' END
))
FROM calc;
$$;
GRANT EXECUTE ON FUNCTION proyeccion_mensual_retail_v1(int, int) TO service_role;

CREATE OR REPLACE FUNCTION proyeccion_mensual_mayorista_v1(p_anio int, p_mes int)
RETURNS jsonb LANGUAGE sql STABLE AS $$
WITH emp(empresa_key) AS (
  VALUES ('fashion_wear'),('vistana'),('fashion_shoes'),('active_shoes'),('active_wear'),('joystep')
),
rango AS (
  SELECT make_date(p_anio, p_mes, 1) AS ini,
         (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date AS fin_excl,
         EXTRACT(DAY FROM (make_date(p_anio, p_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int AS dim,
         (now() AT TIME ZONE 'America/Panama')::date AS hoy
),
rango2 AS (
  SELECT *, CASE
    WHEN p_anio = EXTRACT(YEAR FROM hoy)::int AND p_mes = EXTRACT(MONTH FROM hoy)::int
      THEN LEAST(EXTRACT(DAY FROM hoy)::int, dim)   -- mes en curso → días calendario corridos
    WHEN make_date(p_anio, p_mes, 1) > hoy THEN 0   -- mes futuro
    ELSE dim END AS dias_transcurridos                -- mes cerrado → mes completo
  FROM rango
),
diario AS (
  SELECT sf.empresa_key,
         EXTRACT(DAY FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS dom,
         SUM(CASE WHEN sf.tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN sf.subtotal_descuento
                  WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento ELSE 0 END) AS net
  FROM switch_facturas sf
  JOIN emp e ON e.empresa_key = sf.empresa_key
  CROSS JOIN rango2 r
  WHERE (sf.fecha AT TIME ZONE 'America/Panama') >= r.ini
    AND (sf.fecha AT TIME ZONE 'America/Panama') <  r.fin_excl
  GROUP BY 1, 2
),
stats AS (
  SELECT e.empresa_key,
         COALESCE(SUM(CASE WHEN d.net > 0 THEN d.net END), 0) AS acum,
         COUNT(d.dom) FILTER (WHERE d.net > 0) AS nd
  FROM emp e LEFT JOIN diario d ON d.empresa_key = e.empresa_key
  GROUP BY e.empresa_key
)
SELECT jsonb_agg(jsonb_build_object(
  'empresa_key', s.empresa_key, 'regimen', 'mayorista',
  'suficiente_data', (s.nd >= 3 AND r.dias_transcurridos > 0),
  'dias_transcurridos', r.dias_transcurridos, 'dias_mes', r.dim,
  'acumulado', s.acum, 'dias_con_venta', s.nd, 'volatil', true,
  'proyeccion', CASE WHEN s.nd >= 3 AND r.dias_transcurridos > 0
                     THEN s.acum / r.dias_transcurridos * r.dim ELSE NULL END,
  'nota', CASE WHEN s.nd >= 3 AND r.dias_transcurridos > 0 THEN 'estimación volátil' ELSE 'datos insuficientes' END
))
FROM stats s CROSS JOIN rango2 r;
$$;
GRANT EXECUTE ON FUNCTION proyeccion_mensual_mayorista_v1(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
