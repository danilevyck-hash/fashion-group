-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_topclientes_summary + ventas_clientes_detalle_summary
--            SARGABLES (rango de fecha en vez de EXTRACT(YEAR ...))
--
-- Hermana de 20260725170100_ventas_dashboard_summary_mes_sargable.sql: es el
-- MISMO arreglo, aplicado a las dos RPC de /ventas que quedaron afuera aquel
-- día. `ventas_dashboard_summary` ya está migrada y viva (verificado 26-jul:
-- ventas_dashboard_summary(2020) devuelve vacío en 314 ms, o sea corta en seco;
-- la versión vieja tardaba 3.354 ms haciendo el trabajo igual).
--
-- ── EL PROBLEMA (medido 26-jul-2026 contra producción) ──────────────────────
--
-- Las dos funciones vienen de 20260606100000_reportes_clientes_solo_switch.sql
-- y filtran el año así:
--
--   WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio
--
-- Eso es una FUNCIÓN SOBRE LA COLUMNA: no es sargable, ningún índice de `fecha`
-- puede usarse, y Postgres cae en SEQ SCAN de switch_facturas ENTERA (52.269
-- filas, fila promedio ~1.116 B por el raw_data jsonb -> ~58 MB de heap) en cada
-- llamada, para cualquier año. Encima aplica dos REGEXP_REPLACE de
-- normalización de nombre a cada una de las 52.269 filas antes de descartarlas.
--
-- `ventas_clientes_detalle_summary` es peor: su CTE `sf` ni siquiera filtra por
-- año (`WHERE cliente_nombre IS NOT NULL` a secas) y se referencia 4 veces, así
-- que Postgres la MATERIALIZA: normaliza y convierte a hora-Panamá las 52.269
-- filas, siempre.
--
-- Prueba de que el trabajo es incondicional: ventas_topclientes_summary(2020)
-- devuelve `[]` (2 bytes, CERO filas) y tarda 414 ms en caliente — 130 ms de
-- trabajo de servidor por encima del baseline de red, para no devolver nada.
--
-- Latencia medida de las dos RPC (PostgREST, incluye ~285 ms de red):
--   topclientes    en frío 2.882-3.493 ms   ·  en caliente 368-451 ms
--   detalle        en frío   993-1.514 ms   ·  en caliente 491-749 ms
-- El caso que duele es el FRÍO, y es el caso normal de estas pantallas: se abren
-- de a ratos, no en ráfaga. En régimen estable la RPC es estable (12 llamadas
-- seguidas: 271-417 ms, mediana 307), pero la PRIMERA después de un rato de
-- inactividad salta a 2,7-3,5 s. Eso es exactamente lo que ve el usuario que
-- abre /ventas.
--
-- La razón de fondo es la misma en los dos casos: como la función tiene que
-- barrer la tabla ENTERA, su costo depende por completo de si las páginas están
-- calientes. Con el rango + índice deja de depender de eso.
--
-- HONESTIDAD SOBRE LA CAUSA DEL ENFRIAMIENTO: se probó la hipótesis de que el
-- scan de backup?grupo=switch fuera el disparador. UNA observación lo sugirió
-- (270 ms -> 1.514 ms justo después de un scan) pero 3 ensayos controlados NO
-- la reprodujeron, y en uno el pico apareció ANTES del scan. O sea: el pico en
-- frío es real y repetible, pero no está demostrado que lo cause el backup.
-- Este cambio no depende de esa hipótesis: elimina el seq scan, que es el
-- costo, venga el enfriamiento de donde venga.
--
-- ── QUÉ CAMBIA ──────────────────────────────────────────────────────────────
--
-- SOLO el filtro de lectura de switch_facturas. Ni una fórmula, ni un filtro de
-- negocio, ni el shape de salida: las firmas y los RETURNS TABLE son idénticos,
-- así que src/app/api/ventas/v2/route.ts no cambia ni una línea.
--
--   topclientes:  EXTRACT(YEAR ...) = p_anio
--              -> fecha >= [1-ene p_anio 00:00 Panamá]  (rango cerrado)
--                 AND fecha < [1-ene p_anio+1 00:00 Panamá]
--
--   detalle:      (sin filtro de fecha en `sf`)
--              -> fecha >= LEAST(1-ene de p_anio-1, p_twelve_months_ago)
--                 expresado en UTC  (solo COTA INFERIOR, ver abajo)
--
-- Los límites se calculan una sola vez en una CTE y se leen con subconsulta
-- escalar (InitPlan), o sea que el planner los ve como CONSTANTES y puede hacer
-- seek por índice. Mismo truco que la migración del 25-jul.
--
-- ── POR QUÉ EL RANGO DA EXACTAMENTE LAS MISMAS FILAS ────────────────────────
--
-- América/Panamá es UTC-5 FIJO: nunca tuvo horario de verano. (Verificado fila
-- por fila el 26-jul contra la tzdb del sistema: en las 52.269 facturas, la
-- fecha-Panamá calculada por la tzdb y la calculada restando 5 h coinciden en
-- las 52.269. Cero discrepancias.)
--
-- Entonces, para una fila cualquiera:
--     EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama')) = A
--   <=>  (fecha - 5h)  in  [A-01-01 00:00, (A+1)-01-01 00:00)
--   <=>   fecha        in  [A-01-01 05:00Z, (A+1)-01-01 05:00Z)
--   <=>   fecha        in  [make_date(A,1,1)   AT TIME ZONE 'America/Panama',
--                           make_date(A+1,1,1) AT TIME ZONE 'America/Panama')
--
-- que es literalmente el filtro nuevo. El intervalo es SEMIABIERTO por los dos
-- lados, igual que la igualdad de año: ninguna fila se duplica ni se pierde en
-- la frontera.
--
-- EL BORDE, con datos reales: hay exactamente 1 factura en la tabla cuyo año UTC
-- NO coincide con su año Panamá —id 52917436-c4c4-4f5c-9144-edfa7b30b80f,
-- 2025-01-01T00:06:53Z, que en Panamá es 31-dic-2024 19:06—. Con el filtro viejo
-- cuenta en 2024; con el nuevo también. Las 410 filas que caen 31-dic o 1-ene en
-- hora Panamá quedan todas en el mismo año que antes.
--
-- ── POR QUÉ EL DETALLE LLEVA SOLO COTA INFERIOR ─────────────────────────────
--
-- `sf` alimenta a TRES consumidores con ventanas distintas:
--     current_filtered   anio = p_anio
--     prev_filtered      anio = p_anio - 1
--     last12m_filtered   fecha >= p_twelve_months_ago   <-- SIN cota superior
-- Como last12m no tiene techo, no existe un rango cerrado válido: poner uno
-- recortaría facturas futuras/recientes que sí entran. La cota inferior segura
-- es el mínimo de los tres arranques, y los tres arranques son
-- min(1-ene de p_anio-1, p_twelve_months_ago). Los filtros de cada CTE se
-- conservan TAL CUAL, así que la cota es solo un pre-descarte de filas que
-- ninguna de las tres podía usar.
--
-- LEAST ignora NULL en Postgres, y eso juega a favor: si p_twelve_months_ago
-- viniera NULL, la cota cae a 1-ene de p_anio-1 y last12m no devuelve nada
-- (`fecha >= NULL` es NULL) — exactamente lo que hacía antes.
--
-- Filas leídas después del cambio (medido): p_anio=2026 -> 29.660 de 52.269
-- (57%); 2025 -> 86%; 2024 -> 99%. La ganancia grande del detalle no es cuántas
-- filas lee sino DE DÓNDE: con el índice de la CORRIDA 1 las lee del índice
-- (~5 MB) en vez del heap (~58 MB).
-- En topclientes el recorte sí es grande: 2026 lee 9.971 de 52.269 (19%).
--
-- ── GUARDA DE AÑO ABSURDO ───────────────────────────────────────────────────
-- make_date(0,1,1) revienta ("date field value out of range"), mientras que el
-- EXTRACT viejo simplemente no matcheaba nada. /ventas?anio=0 pasa el parseInt
-- del route, así que el `WHERE p_anio BETWEEN 1900 AND 2999` mantiene el
-- comportamiento viejo (devolver vacío) en vez de tirar un 500.
--
-- ── PARIDAD VERIFICADA (26-jul-2026, contra producción) ─────────────────────
-- Se reimplementaron las DOS funciones fuera de la base, con aritmética decimal
-- exacta (enteros escala 1e4, sin punto flotante), aplicando el filtro NUEVO, y
-- se comparó contra la RPC VIVA (la vieja) para 2024, 2025 y 2026:
--   · topclientes: 10 clientes por año, nombre y monto IDÉNTICOS al centavo.
--   · detalle: 163 / 133 / 121 clientes por año, los 7 campos de cada uno
--     (subtotal_actual, prev_subtotal, last_fecha, last12m_total, is_inactive,
--     empresas[], y el orden) IDÉNTICOS al centavo.
--   · conjuntos de filas del predicado viejo vs nuevo: idénticos en 2022, 2023,
--     2024, 2025 y 2026 (396 / 6.883 / 15.330 / 19.689 / 9.971 filas).
--   · cota inferior del detalle: 0 filas necesarias descartadas en los 3 años.
-- Candado en src/__tests__/lib/ventas-reportes-sargable.test.ts.
--
-- ── CÓMO APLICAR ────────────────────────────────────────────────────────────
--   >>> CORRIDA 1 y CORRIDA 2 van en EJECUCIONES SEPARADAS del SQL Editor. <<<
-- CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción, y el SQL
-- Editor de Supabase manda toda la pestaña como un bloque implícito. Si se pegan
-- juntas falla con "CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block". Pegar la CORRIDA 1 sola, ejecutar, y recién después la CORRIDA 2.
-- (La CORRIDA 2 sí puede ir entera de una vez: son solo funciones.)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- CORRIDA 1 — índice de cobertura (SOLA, sin nada más pegado)
-- ═════════════════════════════════════════════════════════════════════════════
-- Por qué hace falta uno nuevo: idx_sf_fecha_cover (creado el 25-jul) es
--   (fecha, empresa_key) INCLUDE (tipo_comprobante, subtotal_descuento)
-- y NO lleva cliente_nombre, que es justo la columna que estas dos funciones
-- normalizan. Sin ella el rango tendría que ir al heap por cada fila y, con 19%
-- de selectividad, el planner elegiría seq scan igual y el cambio no serviría de
-- nada. Con este índice las dos resuelven por INDEX ONLY SCAN.
--
-- Tamaño estimado: 52.269 filas x ~90 B ~= 4,7 MB, contra ~58 MB de heap.
-- Es ADITIVO: no toca ni reemplaza idx_sf_fecha_cover.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_fecha_cliente_cover
  ON switch_facturas (fecha)
  INCLUDE (empresa_key, cliente_nombre, tipo_comprobante, subtotal_descuento);


-- ═════════════════════════════════════════════════════════════════════════════
-- CORRIDA 2 — las dos funciones (esta sí va entera de una vez)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Top clientes por ventas ──────────────────────────────────────────────────
-- Firma y RETURNS TABLE idénticos a 20260606100000 -> CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION ventas_topclientes_summary(p_anio int, p_top int DEFAULT 10)
RETURNS TABLE (cliente text, total_subtotal numeric)
LANGUAGE sql STABLE AS $$
  -- Ventana del año en hora Panamá, expresada en UTC. Si p_anio es absurdo la
  -- CTE queda vacía, las subconsultas escalares dan NULL, el rango no matchea
  -- nada y la función devuelve vacío (comportamiento viejo).
  WITH win AS (
    SELECT
      (make_date(p_anio,     1, 1)::timestamp AT TIME ZONE 'America/Panama') AS ini_utc,
      (make_date(p_anio + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama') AS fin_utc
    WHERE p_anio BETWEEN 1900 AND 2999
  ),
  normalized AS (
    SELECT
      COALESCE(NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''), '(Sin nombre)') AS cliente_norm,
      CASE
        WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
        WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
        ELSE 0
      END AS subtotal
    FROM switch_facturas
    -- SARGABLE: rango sobre la columna, no función sobre la columna.
    WHERE fecha >= (SELECT w.ini_utc FROM win w)
      AND fecha <  (SELECT w.fin_utc FROM win w)
      AND cliente_nombre IS NOT NULL
  )
  SELECT cliente_norm, SUM(subtotal)::numeric
  FROM normalized
  WHERE cliente_norm NOT IN (
    'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
    'CONTADO', 'VENTAS', 'VENTAS LOCALES'
  )
  GROUP BY cliente_norm
  HAVING SUM(subtotal) > 0
  ORDER BY SUM(subtotal) DESC
  LIMIT p_top;
$$;
GRANT EXECUTE ON FUNCTION ventas_topclientes_summary(int, int) TO service_role;

COMMENT ON FUNCTION ventas_topclientes_summary(int, int) IS
  'Top clientes por ventas netas del anio, desde switch_facturas. Filtra por RANGO de fecha (sargable, usa idx_sf_fecha_cliente_cover) en vez de EXTRACT(YEAR FROM fecha AT TIME ZONE Panama), que forzaba seq scan de las 52.269 filas en cada llamada (2.882-3.493 ms en frio). Cifras identicas: America/Panama es UTC-5 fijo y el rango semiabierto expresa la misma condicion.';


-- ── Detalle de clientes ──────────────────────────────────────────────────────
-- Firma y RETURNS TABLE idénticos a 20260606100000 -> CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION ventas_clientes_detalle_summary(
  p_anio int,
  p_desde date,
  p_twelve_months_ago date,
  p_sixty_days_ago date
)
RETURNS TABLE (
  cliente text,
  subtotal_actual numeric,
  prev_subtotal numeric,
  last_fecha date,
  last12m_total numeric,
  is_inactive boolean,
  empresas jsonb
)
LANGUAGE sql STABLE AS $$
  WITH
  -- COTA INFERIOR común a los tres consumidores de `sf`. Ver el encabezado:
  -- last12m no tiene techo, así que no hay rango cerrado posible.
  win AS (
    SELECT (
      LEAST(
        CASE WHEN p_anio BETWEEN 1900 AND 2999 THEN make_date(p_anio - 1, 1, 1) END,
        p_twelve_months_ago
      )::timestamp AT TIME ZONE 'America/Panama'
    ) AS lo_utc
  ),
  sf AS (
    SELECT
      COALESCE(NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''), '(Sin nombre)') AS cliente_norm,
      empresa_key AS empresa,
      (fecha AT TIME ZONE 'America/Panama')::date AS fecha,
      EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int AS anio,
      CASE
        WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
        WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
        ELSE 0
      END AS subtotal
    FROM switch_facturas
    WHERE cliente_nombre IS NOT NULL
      -- SARGABLE: pre-descarte de filas que NINGUNA de las 3 CTE puede usar.
      -- Los filtros propios de cada CTE quedan intactos más abajo.
      AND fecha >= (SELECT w.lo_utc FROM win w)
  ),
  current_filtered AS (
    SELECT * FROM sf
    WHERE anio = p_anio
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON')
  ),
  current_agg AS (
    SELECT cliente_norm, SUM(subtotal)::numeric AS subtotal_actual
    FROM current_filtered GROUP BY cliente_norm
  ),
  current_empresas AS (
    SELECT cliente_norm,
      jsonb_agg(jsonb_build_object('empresa', empresa, 'subtotal', emp_sub) ORDER BY emp_sub DESC) AS empresas
    FROM (
      SELECT cliente_norm, empresa, SUM(subtotal)::numeric AS emp_sub
      FROM current_filtered GROUP BY cliente_norm, empresa
    ) e
    GROUP BY cliente_norm
  ),
  prev_filtered AS (
    SELECT cliente_norm, SUM(subtotal)::numeric AS prev_subtotal
    FROM sf
    WHERE anio = p_anio - 1
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON')
    GROUP BY cliente_norm
  ),
  last12m_filtered AS (
    SELECT cliente_norm, MAX(fecha)::date AS last_fecha, SUM(subtotal)::numeric AS last12m_total
    FROM sf
    WHERE fecha >= p_twelve_months_ago
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON', 'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
    GROUP BY cliente_norm
  )
  SELECT
    COALESCE(c.cliente_norm, l.cliente_norm) AS cliente,
    COALESCE(c.subtotal_actual, 0)::numeric AS subtotal_actual,
    COALESCE(p.prev_subtotal, 0)::numeric AS prev_subtotal,
    l.last_fecha,
    COALESCE(l.last12m_total, 0)::numeric AS last12m_total,
    (
      l.last_fecha IS NOT NULL
      AND l.last_fecha < p_sixty_days_ago
      AND COALESCE(l.last12m_total, 0) >= 5000
      AND COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
    ) AS is_inactive,
    COALESCE(ce.empresas, '[]'::jsonb) AS empresas
  FROM current_agg c
  FULL OUTER JOIN last12m_filtered l ON c.cliente_norm = l.cliente_norm
  LEFT JOIN prev_filtered p ON COALESCE(c.cliente_norm, l.cliente_norm) = p.cliente_norm
  LEFT JOIN current_empresas ce ON c.cliente_norm = ce.cliente_norm
  WHERE COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
     OR COALESCE(c.subtotal_actual, 0) > 0
  ORDER BY COALESCE(c.subtotal_actual, 0) DESC;
$$;
GRANT EXECUTE ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) TO service_role;

COMMENT ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) IS
  'Detalle de clientes de /ventas/reporte desde switch_facturas. La CTE sf ahora lleva cota inferior de fecha (sargable, usa idx_sf_fecha_cliente_cover) = LEAST(1-ene de p_anio-1, p_twelve_months_ago); antes materializaba las 52.269 filas en cada llamada. Solo cota inferior porque last12m no tiene techo. Cifras identicas: los filtros de cada CTE quedan intactos y la cota solo descarta filas que ninguna podia usar.';

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- CÓMO VERIFICAR (después de la CORRIDA 2)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Que use el índice y NO haga seq scan. Debe decir
--    "Index Only Scan using idx_sf_fecha_cliente_cover" y NO
--    "Seq Scan on switch_facturas":
--
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM ventas_topclientes_summary(2026, 10);
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM ventas_clientes_detalle_summary(
--      2026, NULL, (CURRENT_DATE - 365), (CURRENT_DATE - 60));
--
-- 2) Que un año sin datos ya no haga trabajo (antes 414 ms, ahora debe ser
--    ~0 ms de servidor):
--
--    EXPLAIN (ANALYZE) SELECT * FROM ventas_topclientes_summary(2019, 10);
--
-- 3) Que el año absurdo devuelva vacío en vez de reventar:
--
--    SELECT count(*) FROM ventas_topclientes_summary(0, 10);   -- 0, sin error
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PARIDAD — se puede correr ANTES de la CORRIDA 2 para comparar el filtro nuevo
-- contra el viejo sobre la tabla real. Debe devolver CERO filas.
-- ─────────────────────────────────────────────────────────────────────────────
-- WITH viejo AS (
--   SELECT id FROM switch_facturas
--   WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = 2026
-- ), nuevo AS (
--   SELECT id FROM switch_facturas
--   WHERE fecha >= (make_date(2026, 1, 1)::timestamp AT TIME ZONE 'America/Panama')
--     AND fecha <  (make_date(2027, 1, 1)::timestamp AT TIME ZONE 'America/Panama')
-- )
-- SELECT 'solo_viejo' AS lado, id FROM (SELECT id FROM viejo EXCEPT SELECT id FROM nuevo) a
-- UNION ALL
-- SELECT 'solo_nuevo' AS lado, id FROM (SELECT id FROM nuevo EXCEPT SELECT id FROM viejo) b;
--
-- Repetir cambiando 2026/2027 por 2024/2025 y 2025/2026.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: reaplicar 20260606100000_reportes_clientes_solo_switch.sql tal cual
-- (usa DROP + CREATE, así que vuelve a dejar las dos funciones como estaban), y
-- opcionalmente, en una corrida aparte:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_sf_fecha_cliente_cover;
-- ─────────────────────────────────────────────────────────────────────────────
