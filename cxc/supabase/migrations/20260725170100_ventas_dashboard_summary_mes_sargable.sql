-- ─────────────────────────────────────────────────────────────────────────────
-- Migration (PASO 2 de 2): ventas_dashboard_summary — mes en curso SARGABLE
--
-- Aplicar DESPUÉS de 20260725170000_ventas_indices_cobertura.sql. EL ORDEN NO ES
-- OPCIONAL: hoy NO existe ningún índice que lidere con `fecha`, así que sin el
-- PASO 1 el filtro de rango de esta función cae igual en seq scan del heap.
-- Medido 25-jul con la base cargada: leer switch_facturas del mes en curso
-- (1.160 filas de 52.222) por rango de fecha MURIÓ con statement timeout — sin
-- índice ese "filtro barato" sigue barriendo los ~58 MB de la tabla. El índice
-- es el que convierte el rango en un seek; la función es la que hace que el
-- rango exista.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
-- La versión de 20260609120100 ya movió los meses CERRADOS a
-- ventas_rollup_mensual_mv (eso quedó bien: la MV responde en 260-500 ms).
-- Pero dejó la rama del MES EN CURSO leyendo dos vistas no materializadas:
--
--   FROM switch_ventas_unificado_vw v
--   LEFT JOIN switch_costo_unificado_vw c ON c.empresa_key = v.empresa_key AND c.mes = v.mes
--   CROSS JOIN cur
--   WHERE v.mes = cur.m
--
-- `v.mes` es una columna CALCULADA de la vista
-- (date_trunc('month', fecha AT TIME ZONE 'America/Panama')) y `cur.m` viene de
-- una CTE, así que el predicado es una condición de JOIN: Postgres NO la puede
-- empujar dentro de la vista. Resultado: agrega switch_facturas ENTERA (52.222
-- filas, ~58 MB) y switch_articulo_diario ENTERA (197.128 filas, ~74 MB), une
-- las dos agregaciones, y recién ahí se queda con ~8 filas del mes.
--
-- Prueba de que el trabajo es incondicional: ventas_dashboard_summary(2020)
-- devuelve `[]` (2 bytes) y tarda 3.354 ms. Con año en curso, 8.233 ms en frío.
--
-- ── QUÉ CAMBIA ──────────────────────────────────────────────────────────────
-- La rama del mes en curso deja de pasar por las vistas y agrega DIRECTO sobre
-- las tablas base, con un filtro de RANGO sobre la columna `fecha` indexada:
--
--   switch_facturas         fecha >= inicio_utc  AND fecha < fin_utc
--   switch_articulo_diario  fecha >= mes         AND fecha < mes + 1 mes
--
-- Los límites se calculan una sola vez (subconsulta escalar -> InitPlan), o sea
-- que el planner los ve como constantes y puede hacer seek por índice. Con
-- idx_sf_fecha_cover / idx_sad_fecha_cover eso es un INDEX ONLY SCAN de 1.160 y
-- 3.608 filas (julio-2026) en vez de dos seq scans de 52k y 197k.
--
-- La rama de meses CERRADOS (la MV) NO se toca.
--
-- ── POR QUÉ DA EXACTAMENTE EL MISMO NÚMERO ──────────────────────────────────
-- 1) Ventas. switch_ventas_unificado_vw agrupa por
--      date_trunc('month', fecha AT TIME ZONE 'America/Panama')::date
--    Una fila cae en el bucket `m` si y solo si su `fecha` (timestamptz) está en
--    el intervalo semiabierto [m 00:00 Panamá, (m+1 mes) 00:00 Panamá). Eso es
--    literalmente lo que expresa el filtro de rango. América/Panamá es UTC-5
--    FIJO (nunca tuvo horario de verano), así que la conversión es exacta y no
--    hay ambigüedad de frontera.
--    La fórmula del monto se copia LITERAL de la vista (Factura/Tiquete/
--    Transacción/Nota de Débito suman subtotal_descuento; Nota de Crédito resta;
--    cualquier otro tipo aporta 0 pero SÍ crea el grupo de la empresa — igual
--    que la vista, que tampoco filtra por tipo en el WHERE).
-- 2) Costo. switch_articulo_diario.fecha ya es DATE local, y la vista agrupa por
--    date_trunc('month', fecha)::date -> el rango [m, m+1 mes) es idéntico.
--    Fórmula copiada literal: 'NC' resta, todo lo demás suma.
-- 3) El LEFT JOIN sigue siendo desde ventas hacia costo por empresa_key dentro
--    del mismo mes, con COALESCE(costo, 0) -> mismas empresas, mismos ceros.
--
-- FIRMA Y SHAPE DE SALIDA IDÉNTICOS (empresa, mes, total_subtotal, total_costo,
-- total_utilidad, total_facturado, filas) -> src/lib/ventas/queries.ts no cambia.
--
-- ── VERIFICACIÓN DE PARIDAD (correr ANTES de reemplazar, ver el pie) ────────
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_summary(p_anio int)
RETURNS TABLE (
  empresa text,
  mes int,
  total_subtotal numeric,
  total_costo numeric,
  total_utilidad numeric,
  total_facturado numeric,
  filas bigint
)
LANGUAGE sql STABLE AS $$
  WITH cur AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Panama'))::date AS m
  ),
  -- Ventana del mes en curso. Si p_anio no es el año en curso, esta CTE queda
  -- VACÍA: las subconsultas escalares devuelven NULL, los filtros de rango no
  -- matchean nada y el CROSS JOIN elimina la rama entera sin leer las tablas.
  win AS (
    SELECT
      cur.m                                                                       AS m,
      (cur.m::timestamp AT TIME ZONE 'America/Panama')                            AS ini_utc,
      ((cur.m + interval '1 month')::timestamp AT TIME ZONE 'America/Panama')     AS fin_utc,
      (cur.m + interval '1 month')::date                                          AS fin_date
    FROM cur
    WHERE EXTRACT(YEAR FROM cur.m)::int = p_anio
  ),
  -- Ventas netas del mes en curso, directo de la tabla base y por rango de fecha.
  -- Misma fórmula que switch_ventas_unificado_vw.
  ventas_cur AS (
    SELECT
      f.empresa_key,
      SUM(
        CASE
          WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN f.subtotal_descuento
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.subtotal_descuento
          ELSE 0
        END
      )::numeric AS ventas_netas
    FROM switch_facturas f
    WHERE f.fecha >= (SELECT w.ini_utc FROM win w)
      AND f.fecha <  (SELECT w.fin_utc FROM win w)
    GROUP BY f.empresa_key
  ),
  -- Costo neto del mes en curso. Misma fórmula que switch_costo_unificado_vw.
  costo_cur AS (
    SELECT
      a.empresa_key,
      SUM(CASE WHEN a.tipo = 'NC' THEN -a.costo_total ELSE a.costo_total END)::numeric AS costo_total
    FROM switch_articulo_diario a
    WHERE a.fecha >= (SELECT w.m        FROM win w)
      AND a.fecha <  (SELECT w.fin_date FROM win w)
    GROUP BY a.empresa_key
  )
  -- Meses CERRADOS: desde la MV (precomputado). Sin cambios.
  SELECT
    r.empresa_key  AS empresa,
    r.mes_num      AS mes,
    r.ventas_netas AS total_subtotal,
    r.costo_total  AS total_costo,
    r.utilidad     AS total_utilidad,
    r.ventas_netas AS total_facturado,
    0::bigint      AS filas
  FROM ventas_rollup_mensual_mv r
  CROSS JOIN cur
  WHERE r.anio = p_anio
    AND r.mes < cur.m
  UNION ALL
  -- Mes EN CURSO: en vivo, sin perder frescura.
  SELECT
    v.empresa_key AS empresa,
    EXTRACT(MONTH FROM w.m)::int AS mes,
    v.ventas_netas::numeric AS total_subtotal,
    COALESCE(c.costo_total, 0)::numeric AS total_costo,
    (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS total_utilidad,
    v.ventas_netas::numeric AS total_facturado,
    0::bigint AS filas
  FROM ventas_cur v
  LEFT JOIN costo_cur c ON c.empresa_key = v.empresa_key
  CROSS JOIN win w
  ORDER BY 1, 2
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_summary(int) TO service_role;

COMMENT ON FUNCTION ventas_dashboard_summary(int) IS
  'Resumen mensual de /ventas por empresa. Meses cerrados desde ventas_rollup_mensual_mv; mes en curso en vivo, agregado DIRECTO sobre switch_facturas y switch_articulo_diario por rango de fecha (sargable, usa idx_sf_fecha_cover / idx_sad_fecha_cover). Antes pasaba por switch_ventas_unificado_vw y switch_costo_unificado_vw, que agregaban las tablas completas en cada llamada (8,2 s en frio). Formulas copiadas literal de esas vistas: cifras identicas.';

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- PARIDAD — correr esto ANTES de reemplazar la función (compara la rama nueva
-- del mes en curso contra las vistas de hoy). Debe devolver CERO filas.
-- ─────────────────────────────────────────────────────────────────────────────
-- WITH cur AS (
--   SELECT date_trunc('month', (now() AT TIME ZONE 'America/Panama'))::date AS m
-- ), win AS (
--   SELECT m,
--          (m::timestamp AT TIME ZONE 'America/Panama') AS ini_utc,
--          ((m + interval '1 month')::timestamp AT TIME ZONE 'America/Panama') AS fin_utc,
--          (m + interval '1 month')::date AS fin_date
--   FROM cur
-- ), nuevo AS (
--   SELECT f.empresa_key,
--          SUM(CASE
--                WHEN f.tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN f.subtotal_descuento
--                WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.subtotal_descuento
--                ELSE 0 END)::numeric AS ventas_netas,
--          (SELECT SUM(CASE WHEN a.tipo='NC' THEN -a.costo_total ELSE a.costo_total END)::numeric
--             FROM switch_articulo_diario a, win w2
--            WHERE a.empresa_key = f.empresa_key AND a.fecha >= w2.m AND a.fecha < w2.fin_date) AS costo_total
--   FROM switch_facturas f, win w
--   WHERE f.fecha >= w.ini_utc AND f.fecha < w.fin_utc
--   GROUP BY f.empresa_key
-- ), viejo AS (
--   SELECT v.empresa_key, v.ventas_netas, c.costo_total
--   FROM switch_ventas_unificado_vw v
--   LEFT JOIN switch_costo_unificado_vw c ON c.empresa_key = v.empresa_key AND c.mes = v.mes
--   CROSS JOIN cur
--   WHERE v.mes = cur.m
-- )
-- SELECT COALESCE(n.empresa_key, o.empresa_key) AS empresa_key,
--        n.ventas_netas AS ventas_nuevo, o.ventas_netas AS ventas_viejo,
--        n.costo_total  AS costo_nuevo,  o.costo_total  AS costo_viejo
-- FROM nuevo n FULL OUTER JOIN viejo o ON o.empresa_key = n.empresa_key
-- WHERE n.empresa_key IS NULL
--    OR o.empresa_key IS NULL
--    OR COALESCE(n.ventas_netas,0) <> COALESCE(o.ventas_netas,0)
--    OR COALESCE(n.costo_total,0)  <> COALESCE(o.costo_total,0);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLAN — para ver que efectivamente usa los índices (debe decir
-- "Index Only Scan using idx_sf_fecha_cover" y "... idx_sad_fecha_cover",
-- y NO "Seq Scan on switch_facturas"):
-- ─────────────────────────────────────────────────────────────────────────────
-- EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM ventas_dashboard_summary(2026);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: reaplicar 20260609120100_ventas_dashboard_summary_mv.sql tal cual.
-- ─────────────────────────────────────────────────────────────────────────────
