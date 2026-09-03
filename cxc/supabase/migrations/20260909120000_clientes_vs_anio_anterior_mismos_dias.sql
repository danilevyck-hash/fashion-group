-- ─────────────────────────────────────────────────────────────────────────────
-- «vs 2025» de Ventas › Clientes comparaba OCHO meses contra NUEVE (3-sep-2026)
--
-- Daniel toma decisiones mirando esa columna. Caso medido: Multi Fashion
-- Holding (D-108), «Todas», 2026 — la pantalla decía **$238.486 · +3%**.
--
--   2026: 1-ene → 2-sep            $238.485,70   (ocho meses y dos días)
--   2025: 1-ene → 30-SEP           $231.485,02   (nueve meses)  → +3,0%   ← lo que usaba la vista
--   2025: 1-ene → 2-sep            $174.821,02   (los mismos días)  → +36,4%  ← la verdad
--
-- ══ DÓNDE ESTABA ═══════════════════════════════════════════════════════════
--
-- En `clientes_empresa_12m_vw` (y en `clientes_anio()`, su copia para el año en
-- curso) el año anterior se cortaba por MES, no por día:
--
--   max_mes   AS (SELECT MAX(k.mes) FROM keyed k WHERE k.anio = año_en_curso)
--   prev_year AS (... WHERE k.anio = año_en_curso - 1 AND k.mes <= max_mes)
--
-- `mes <= 9` es «hasta el 30 de septiembre». Así que el día 2 del mes el año
-- pasado corría con 28 días de ventaja, cada día del mes la comparación se
-- corregía sola un poco, el día 30 por fin decía la verdad, y el día siguiente
-- —cuando entraba la primera factura del mes nuevo— volvía a saltar. Un cliente
-- que crece de verdad se veía plano casi todo el mes.
--
-- El texto de la pantalla decía «El cambio compara contra el mismo período de
-- 2025», y no era cierto.
--
-- 🩸 ES LA MISMA CLASE DE ERROR QUE YA PAGÓ ESTA CASA DOS VECES, y por eso la
-- regla ya existía y está escrita:
--
--   · Multifashion (`docs/postmortems/multifashion.md`, `rangoComparativo`):
--     **«un mes empezado se compara contra los MISMOS DÍAS del año pasado»**.
--     El 7 de agosto, medir 7 días contra los 31 de agosto-2025 mostraba una
--     caída del ~78% que no ocurrió.
--   · El resumen diario de ACS por Telegram (`src/lib/acs-resumen-diario.ts`,
--     `ventanasResumen`): la línea «Mes» es 1..D contra 1..D con el MISMO D en
--     los dos lados, el YTD es 1-ene..D contra 1-ene..mismo D del año anterior,
--     y el 29-feb cae en el 28. El 2-sep-2026 se revisó justamente la línea
--     «Mes» del día 1 de ese resumen (Daniel: se deja, calendario contra
--     calendario) — la misma pregunta que esta vista contestaba mal.
--   · Ventas › Productos (`productosRangoComparativo`) ya lo aplica al año con
--     `unAnioAntes`. Ventas › Resumen ya lo aplica por día
--     (`ventas_dashboard_prev_same_period_v2`, `fecha_corte` = último día con
--     ventas del mes en curso). Esta vista era la única de la pantalla que no.
--
-- ══ LA REGLA, AHORA TAMBIÉN AQUÍ ═══════════════════════════════════════════
--
--   corte      = el último día con ventas cargadas del año en curso,
--                nunca después de HOY en Panamá
--   corte_prev = la misma fecha, un año antes (29-feb → 28-feb)
--   año anterior = 1-ene → corte_prev
--
--   · «Último día con ventas cargadas» y no «hoy» a secas porque esta vista es
--     MATERIALIZADA: se refresca a las 02:35 de Panamá (cron 07:35 UTC) y a esa
--     hora el año en curso llega hasta AYER. Cortar el año pasado en «hoy» le
--     regalaría un día. Es el mismo criterio que ya usa Resumen en esta misma
--     pantalla (`fecha_corte` = MAX(fecha) del mes en curso). Y si el sync se
--     atrasa dos días, las dos ventanas se acortan JUNTAS: el delta sigue
--     siendo honesto para lo que hay cargado.
--   · Con el tope de HOY para que una factura con fecha futura (error de carga
--     en Switch) no corra el corte hacia adelante.
--   · HOY es el día de PANAMÁ (UTC−5 fijo): `(now() AT TIME ZONE
--     'America/Panama')::date`, igual que `hoyPanama()` en la app y que
--     `multifashion_hoy_panama()` en SQL. Entre las 7 p.m. y la medianoche de
--     Panamá, `CURRENT_DATE` ya está en mañana — y el 31-dic a las 8 p.m. diría
--     que el año en curso es el que viene. Por eso `current_year` y el piso de
--     los 12 meses también salen de ese mismo `hoy`.
--   · El 29 de febrero: `DATE '2028-02-29' - INTERVAL '1 year'` = 2027-02-28
--     (Postgres recorta al último día del mes). Misma decisión que
--     `unAnioAntes` en la app y que `cortePrev` en el resumen de ACS.
--   · «Compras 2026» (`compras_ytd`) NO se toca: sigue siendo todo lo cargado
--     del año en curso, al centavo. Lo único que cambia es hasta dónde se suma
--     el año ANTERIOR.
--   · Un año CERRADO no tiene caso especial: su corte es el 31-dic y un año
--     antes es el 31-dic anterior — año entero contra año entero, como hoy.
--
-- ══ MEDIDO CONTRA PRODUCCIÓN (3-sep-2026, solo lectura) ════════════════════
--
-- `scripts/_diag-clientes-vs-2025-mismos-dias.ts` reconstruye las dos ventanas
-- desde `switch_facturas` y primero comprueba que la ventana VIEJA reproduce lo
-- publicado: **116 de 116 filas cuadran al centavo**. Con la ventana nueva
-- (corte 3-sep-2025), sobre los 115 clientes del ranking (82 con «vs 2025»):
--
--   · 37 filas cambian de número.
--   · 6 cambian de SIGNO: 2 pasaban de «baja» a «sube»
--       D-142 Sporting Shoes N 4   $164.900   −0,2%  → +24,1%
--       D-32  City Moda Los Andes   $24.835   −7,4%  → +10,1%
--     y 4 pierden el número (el año pasado hasta esa fecha da 0 o negativo,
--     y la vista contesta «—» en vez de inventar un %): D-10, D-49, D-54, D-23.
--   · Las que más se mueven (con número en las dos ventanas):
--       D-156 Wolf Mall Center Int      +105%  → +964%
--       D-43  De Moda                    +26%  → +355%
--       D-117 Outlet Duty Free N2       +862%  → +1.065%
--       D-1   A-Amani                    −58%  →  −0,9%
--       D-108 Multi Fashion Holding      +3,0% →  +36,3%
--
-- ══ QUÉ NO CAMBIA ══════════════════════════════════════════════════════════
--
--   · El mostrador sigue reconocido por CÓDIGO (`TCKCTA`) y fuera del ranking
--     (20260908120000). Las dos ramas dicen lo mismo, palabra por palabra.
--   · El puente por `switch_clientes`, la marca `es_del_grupo`, el corte de
--     Boston y ACS: intactos.
--   · Ninguna fuente de totales de venta se toca: `ventas_dashboard_summary`,
--     `ventas_rollup_mensual_mv`, `comision_b2b_v5`, `switch_estadocuenta_aging`
--     y `cliente_ficha_ventas` no aparecen en este archivo.
--
-- ADITIVO Y REVERSIBLE: recrea dos vistas y una función; NO borra ni modifica
-- datos. Revertir = volver a correr 20260908120000.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
--
-- ⚠️ MIENTRAS NO SE CORRA, la columna sigue mintiendo como hoy — y el texto de
-- la pantalla («el mismo período») sigue siendo falso hasta el día 30 de cada
-- mes.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — El ranking del año EN CURSO (MV + vista agregada).
-- Copia EXACTA de 20260908120000 salvo por el CORTE del año anterior
-- (`hoy` / `corte` / `corte_prev` en lugar de `max_mes`).
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW              IF EXISTS clientes_agregado_12m_vw CASCADE;
DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw  CASCADE;

CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS
WITH
  a_raw AS (
    SELECT
      sf.empresa_key AS empresa,
      sf.empresa_key AS empresa_key,
      sf.cliente_switch_id,
      COALESCE(
        NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
        '(Sin nombre)'
      ) AS cliente_norm,
      (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
      EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
      EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
      CASE
        WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
        WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
        ELSE 0
      END AS subtotal
    FROM switch_facturas sf
    WHERE sf.empresa_key IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
      AND sf.cliente_nombre IS NOT NULL
  ),
  src_a AS (
    SELECT
      a.empresa,
      sc.codigo AS cliente_codigo,
      a.cliente_norm,
      a.fecha, a.anio, a.mes, a.subtotal
    FROM a_raw a
    -- ⬇️ EL PUENTE, Y NADA MÁS. `switch_clientes` es la ÚNICA fuente del código:
    -- el par (empresa_key, cliente_switch_id) es único por construcción, así que
    -- este JOIN no puede multiplicar una factura.
    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = a.empresa_key
     AND sc.cliente_switch_id = a.cliente_switch_id
  ),

  src_b AS (
    SELECT
      nb.empresa,
      m.codigo AS cliente_codigo,
      nb.cliente_norm,
      nb.fecha, nb.anio, nb.mes, nb.subtotal
    FROM (
      SELECT
        sf.empresa_key AS empresa,
        sf.cliente_switch_id,
        COALESCE(
          NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
          '(Sin nombre)'
        ) AS cliente_norm,
        (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
        EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
        EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
        CASE
          WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
          WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
          ELSE 0
        END AS subtotal
      FROM switch_facturas sf
      WHERE sf.empresa_key NOT IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
        AND sf.cliente_nombre IS NOT NULL
    ) nb
    -- La rama no-B2B ahora usa EL MISMO puente que la del grupo. Antes era la
    -- única que resolvía SOLO por nombre, y es la que traía clientes de Boston
    -- a la mesa del grupo.
    LEFT JOIN switch_clientes m
      ON m.empresa_key = nb.empresa
     AND m.cliente_switch_id = nb.cliente_switch_id
  ),

  -- `del_grupo` NO es una lista nueva: sale del MISMO corte que ya hicieron
  -- `a_raw` (las 6) y `src_b` (el resto). Escribir acá una cuarta copia de los
  -- seis nombres es exactamente como esta casa se quemó antes.
  src AS (
    SELECT *, true  AS del_grupo FROM src_a
    UNION ALL
    SELECT *, false AS del_grupo FROM src_b
  ),

  -- ⬇️ EL CAMBIO. Antes esta lista también tenía a las empresas del grupo
  -- ('CONFECCIONES BOSTON','MULTI FASHION HOLDING','MULTIFASHION','BOSTON') y
  -- por eso Multi Fashion Holding no aparecía en ningún lado del ranking.
  -- Quedan sólo los GENÉRICOS, que no son un cliente sino el mostrador.
  filtered AS (
    SELECT *
    FROM src
    WHERE
      -- ⬇️ EL CAMBIO DE HOY. El mostrador del grupo PASA, y pasa reconocido por
      -- su CÓDIGO. No entra al ranking: la pantalla lo aparta por ese mismo
      -- código y lo muestra en su fila ámbar. Lo que se arregla es que ahora
      -- llegan los SEIS y no solo el que se salvaba por un nombre truncado.
      (del_grupo AND cliente_codigo = 'TCKCTA')
      -- El resto sigue igual: los genéricos NO son un cliente. 'VENTAS LOCALES'
      -- se queda afuera a propósito — no es el mostrador sino facturas con un
      -- `cliente_switch_id` viejo que `switch_clientes` ya no conoce ($1.933,73
      -- en 2026, medido), y su código es NULL. El mostrador de Boston y de ACS
      -- también se queda afuera, igual que hoy: se llama 'CONTADO' y esta
      -- pantalla es del grupo.
      OR cliente_norm NOT IN (
        'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)'
      )
  ),

  keyed AS (
    SELECT
      empresa,
      COALESCE(cliente_codigo, '~' || cliente_norm) AS cliente_key,
      cliente_codigo,
      cliente_norm,
      fecha,
      anio,
      mes,
      subtotal
    FROM filtered
  ),

  -- ⬇️ EL CAMBIO. HOY es el día de PANAMÁ, una sola vez, y de él salen el año
  -- en curso, el piso de los 12 meses y el corte. `CURRENT_DATE` es UTC: entre
  -- las 7 p.m. y la medianoche de Panamá ya está en mañana.
  hoy AS (
    SELECT (NOW() AT TIME ZONE 'America/Panama')::date AS d
  ),
  current_year AS (
    SELECT EXTRACT(YEAR FROM h.d)::int AS y FROM hoy h
  ),
  cutoff AS (
    SELECT (date_trunc('month', h.d::timestamp)::date - INTERVAL '12 months')::date AS d FROM hoy h
  ),
  -- 🩸 EL CORTE: el último día con ventas cargadas del año en curso, nunca
  -- después de hoy. Antes aquí había `max_mes` (`MAX(k.mes)`) y el año anterior
  -- se sumaba con `k.mes <= max_mes` — o sea hasta FIN de ese mes: el 2-sep se
  -- comparaban ocho meses y dos días contra nueve. Un mes empezado se compara
  -- contra los MISMOS DÍAS del año pasado (regla de Multifashion, y la del
  -- resumen diario de ACS). Ver el encabezado.
  corte AS (
    SELECT LEAST(COALESCE(MAX(k.fecha), h.d), h.d) AS d
    FROM hoy h
    LEFT JOIN keyed k ON k.anio = EXTRACT(YEAR FROM h.d)::int
    GROUP BY h.d
  ),
  -- La misma fecha, un año antes. El 29-feb cae en el 28 (Postgres recorta al
  -- último día del mes), igual que `unAnioAntes` en la app.
  corte_prev AS (
    SELECT (c.d - INTERVAL '1 year')::date AS d FROM corte c
  ),
  active_pairs AS (
    SELECT DISTINCT k.cliente_key, k.empresa
    FROM keyed k, cutoff c
    WHERE k.fecha >= c.d
  ),
  -- «Compras <año>» no se toca: todo lo cargado del año en curso, como siempre.
  ytd_actual AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_ytd
    FROM keyed k, current_year cy
    WHERE k.anio = cy.y
    GROUP BY k.cliente_key, k.empresa
  ),
  -- El año anterior se corta en corte_prev: 1-ene → la misma fecha del corte,
  -- un año antes. Por DÍA, no por mes.
  prev_year AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_anio_anterior
    FROM keyed k, current_year cy, corte_prev cp
    WHERE k.anio = cy.y - 1 AND k.fecha <= cp.d
    GROUP BY k.cliente_key, k.empresa
  ),
  ultima AS (
    SELECT cliente_key, empresa, MAX(fecha) AS ultima_compra
    FROM keyed
    GROUP BY cliente_key, empresa
  ),
  ident AS (
    SELECT cliente_key, empresa,
           MAX(cliente_codigo) AS cliente_codigo,
           MIN(cliente_norm)   AS cliente_norm
    FROM keyed
    GROUP BY cliente_key, empresa
  )
SELECT
  ap.cliente_key                                                      AS cliente_norm,
  m.id                                                                AS cliente_id,
  COALESCE(m.nombre, id2.cliente_norm)                                AS cliente_nombre,
  COALESCE(m.codigo, id2.cliente_codigo, '—')                         AS cliente_codigo,
  ap.empresa                                                          AS empresa,
  COALESCE(ya.compras_ytd, 0)::numeric                                AS compras_ytd,
  COALESCE(py.compras_anio_anterior, 0)::numeric                      AS compras_anio_anterior,
  CASE
    WHEN COALESCE(py.compras_anio_anterior, 0) > 0
      THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_anio_anterior) / py.compras_anio_anterior)::numeric
    ELSE NULL
  END                                                                 AS delta_vs_2025,
  u.ultima_compra                                                     AS ultima_compra,
  COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))             AS whatsapp,
  -- Marca informativa. NO filtra ni resta: la pantalla la usa para poner una
  -- etiqueta "Del grupo" al lado del nombre.
  (id2.cliente_norm IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON'))
                                                                      AS es_del_grupo
FROM active_pairs ap
JOIN      ident      id2 ON id2.cliente_key = ap.cliente_key AND id2.empresa = ap.empresa
LEFT JOIN ytd_actual ya  ON ya.cliente_key  = ap.cliente_key AND ya.empresa  = ap.empresa
LEFT JOIN prev_year  py  ON py.cliente_key  = ap.cliente_key AND py.empresa  = ap.empresa
LEFT JOIN ultima     u   ON u.cliente_key   = ap.cliente_key AND u.empresa   = ap.empresa
LEFT JOIN clientes_master m ON m.codigo = id2.cliente_codigo AND m.deleted = false
ORDER BY u.ultima_compra DESC NULLS LAST;

CREATE UNIQUE INDEX idx_clientes_empresa_12m_vw_unq
  ON clientes_empresa_12m_vw (cliente_norm, empresa);

CREATE INDEX idx_clientes_empresa_12m_vw_empresa_ultima
  ON clientes_empresa_12m_vw (empresa, ultima_compra DESC NULLS LAST);

CREATE INDEX idx_clientes_empresa_12m_vw_cliente_id
  ON clientes_empresa_12m_vw (cliente_id);


-- ── Vista agregada (modo "Todas") — B2B only. Sin cambios: suma lo de arriba ──

CREATE VIEW clientes_agregado_12m_vw AS
WITH
  b2b_only AS (
    SELECT *
    FROM clientes_empresa_12m_vw
    WHERE empresa IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
  ),
  breakdowns AS (
    SELECT
      cliente_nombre,
      cliente_id,
      jsonb_agg(
        jsonb_build_object('empresa', empresa, 'monto', compras_ytd)
        ORDER BY compras_ytd DESC NULLS LAST
      ) AS empresas_breakdown
    FROM b2b_only
    GROUP BY cliente_nombre, cliente_id
  ),
  ranked AS (
    SELECT
      cliente_id,
      cliente_nombre,
      cliente_codigo,
      whatsapp,
      empresa AS empresa_principal,
      compras_ytd,
      compras_anio_anterior,
      ultima_compra,
      COUNT(*)                   OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS empresas_count,
      SUM(compras_ytd)           OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_ytd,
      SUM(compras_anio_anterior) OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_prev,
      MAX(ultima_compra)         OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS ultima_compra_agg,
      BOOL_OR(es_del_grupo)      OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS es_del_grupo_agg,
      ROW_NUMBER()               OVER (PARTITION BY cliente_id, cliente_nombre ORDER BY compras_ytd DESC NULLS LAST)      AS rn
    FROM b2b_only
  )
SELECT
  r.cliente_id,
  r.cliente_nombre,
  r.cliente_codigo,
  r.whatsapp,
  r.empresa_principal       AS empresa,
  r.empresas_count,
  r.total_compras_ytd       AS compras_ytd,
  r.total_compras_prev      AS compras_anio_anterior,
  CASE
    WHEN r.total_compras_prev > 0
      THEN (r.total_compras_ytd - r.total_compras_prev) / r.total_compras_prev
    ELSE NULL
  END                       AS delta_vs_2025,
  r.ultima_compra_agg       AS ultima_compra,
  r.es_del_grupo_agg        AS es_del_grupo,
  b.empresas_breakdown
FROM ranked r
LEFT JOIN breakdowns b
  ON b.cliente_nombre = r.cliente_nombre
 AND b.cliente_id IS NOT DISTINCT FROM r.cliente_id
WHERE r.rn = 1
ORDER BY r.ultima_compra_agg DESC NULLS LAST;


REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;

GRANT SELECT ON clientes_empresa_12m_vw  TO service_role;
GRANT SELECT ON clientes_agregado_12m_vw TO service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — El ranking de los años CERRADOS (y del año en curso por RPC).
-- Copia EXACTA de 20260908120000 salvo por el CORTE del año anterior: la
-- misma regla que arriba, para que las dos ramas no puedan decir cosas
-- distintas. Un año cerrado no tiene caso especial (corte = 31-dic).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION clientes_anio(
  p_year    integer,
  p_empresa text DEFAULT NULL
)
RETURNS TABLE (
  cliente_norm           text,
  cliente_id             uuid,
  cliente_nombre         text,
  cliente_codigo         text,
  empresa                text,
  compras_ytd            numeric,
  compras_anio_anterior  numeric,
  delta_vs_2025          numeric,
  ultima_compra          date,
  whatsapp               text,
  empresas_count         bigint,
  empresas_breakdown     jsonb
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_hoy        date;
  v_year_now   int;
  v_corte      date;
  v_corte_prev date;
  v_is_todas   boolean;
BEGIN
  -- HOY es el día de PANAMÁ (UTC−5 fijo), no `CURRENT_DATE` (UTC).
  v_hoy      := (NOW() AT TIME ZONE 'America/Panama')::date;
  v_year_now := EXTRACT(YEAR FROM v_hoy)::int;
  v_is_todas := (p_empresa IS NULL OR p_empresa = 'todas');

  IF p_year = v_year_now THEN
    -- 🩸 Misma regla que `clientes_empresa_12m_vw`: el corte es el último día
    -- con ventas cargadas del año en curso, nunca después de hoy. Antes aquí
    -- había `v_max_mes` y el año anterior corría hasta FIN de ese mes.
    -- Por RANGO y no con EXTRACT(YEAR …): `switch_facturas` es la tabla grande.
    SELECT LEAST(COALESCE(MAX((fecha AT TIME ZONE 'America/Panama')::date), v_hoy), v_hoy)
    INTO v_corte
    FROM switch_facturas
    WHERE fecha >= (make_date(p_year, 1, 1)::timestamp AT TIME ZONE 'America/Panama')
      AND fecha <  (make_date(p_year + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama');
  ELSE
    -- Año cerrado: el corte es el 31-dic y un año antes es el 31-dic anterior.
    -- Año entero contra año entero, sin caso especial.
    v_corte := make_date(p_year, 12, 31);
  END IF;
  -- La misma fecha, un año antes. El 29-feb cae en el 28.
  v_corte_prev := (v_corte - INTERVAL '1 year')::date;

  RETURN QUERY
  WITH
    -- ── Rama A: B2B switch, ID primario + fallback nombre ──────────────────────
    a_raw AS (
      SELECT
        sf.empresa_key AS empresa,
        sf.empresa_key AS empresa_key,
        sf.cliente_switch_id,
        COALESCE(
          NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
          '(Sin nombre)'
        ) AS c_norm,
        (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
        EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
        EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
        CASE
          WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
          WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
          ELSE 0
        END AS subtotal
      FROM switch_facturas sf
      WHERE sf.empresa_key IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
        AND sf.cliente_nombre IS NOT NULL
    ),
    src_a AS (
      SELECT
        a.empresa,
        sc.codigo AS cliente_codigo,
        a.c_norm, a.fecha, a.anio, a.mes, a.subtotal
      FROM a_raw a
      -- ⬇️ Mismo arreglo que en clientes_empresa_12m_vw. Esta función lee el
      -- `clientes_master` de HOY, así que el fan-out por nombre duplicaba
      -- también TODOS los años cerrados, retroactivamente.
      LEFT JOIN switch_clientes sc
        ON sc.empresa_key = a.empresa_key AND sc.cliente_switch_id = a.cliente_switch_id
    ),
    -- ── Rama B: NO-B2B (boston, american_classic) switch por nombre ────────────
    src_b AS (
      SELECT
        nb.empresa,
        m.codigo AS cliente_codigo,
        nb.c_norm, nb.fecha, nb.anio, nb.mes, nb.subtotal
      FROM (
        SELECT
          sf.empresa_key AS empresa,
          sf.cliente_switch_id,
          COALESCE(
            NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
            '(Sin nombre)'
          ) AS c_norm,
          (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
          EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
          EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
          CASE
            WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
            WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
            ELSE 0
          END AS subtotal
        FROM switch_facturas sf
        WHERE sf.empresa_key NOT IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
          AND sf.cliente_nombre IS NOT NULL
      ) nb
      LEFT JOIN switch_clientes m
        ON m.empresa_key = nb.empresa AND m.cliente_switch_id = nb.cliente_switch_id
    ),
    src AS (
      SELECT *, true  AS del_grupo FROM src_a
      UNION ALL
      SELECT *, false AS del_grupo FROM src_b
    ),
    filtered AS (
      SELECT *
      FROM src s
      -- Mismo criterio que la vista del año en curso, palabra por palabra: el
      -- mostrador del grupo pasa por CÓDIGO y la pantalla lo aparta. Los años
      -- cerrados tienen que decir lo mismo que el año en curso — si solo se
      -- arreglara arriba, la fila ámbar cambiaría de número al elegir 2025.
      WHERE (
            (s.del_grupo AND s.cliente_codigo = 'TCKCTA')
            OR s.c_norm NOT IN (
              'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
              'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)'
            )
          )
      AND (NOT v_is_todas OR s.empresa NOT IN ('confecciones_boston', 'american_classic'))
      AND (v_is_todas OR s.empresa = p_empresa)
    ),
    keyed AS (
      SELECT
        f.empresa,
        COALESCE(f.cliente_codigo, '~' || f.c_norm) AS cliente_key,
        f.cliente_codigo,
        f.c_norm,
        f.fecha, f.anio, f.mes, f.subtotal
      FROM filtered f
    ),
    -- «Compras <año>» no se toca: todo lo cargado de p_year.
    ytd_actual AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_ytd
      FROM keyed k
      WHERE k.anio = p_year
      GROUP BY k.cliente_key, k.empresa
    ),
    -- El año anterior se corta en v_corte_prev: por DÍA, no por mes.
    prev_year AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_prev
      FROM keyed k
      WHERE k.anio = p_year - 1 AND k.fecha <= v_corte_prev
      GROUP BY k.cliente_key, k.empresa
    ),
    ultima AS (
      SELECT k.cliente_key, k.empresa, MAX(k.fecha) AS ultima_compra
      FROM keyed k
      WHERE k.anio <= p_year
      GROUP BY k.cliente_key, k.empresa
    ),
    ident AS (
      SELECT k.cliente_key, k.empresa,
             MAX(k.cliente_codigo) AS cliente_codigo,
             MIN(k.c_norm)         AS c_norm
      FROM keyed k
      GROUP BY k.cliente_key, k.empresa
    ),
    active_pairs AS (
      SELECT DISTINCT y.cliente_key, y.empresa
      FROM ytd_actual y
    ),
    per_empresa_row AS (
      SELECT
        ap.cliente_key                                                   AS cliente_norm,
        m.id                                                             AS cliente_id,
        COALESCE(m.nombre, id2.c_norm)                                   AS cliente_nombre,
        COALESCE(m.codigo, id2.cliente_codigo, '—')                      AS cliente_codigo,
        ap.empresa                                                       AS empresa,
        COALESCE(ya.compras_ytd, 0)::numeric                             AS compras_ytd,
        COALESCE(py.compras_prev, 0)::numeric                            AS compras_anio_anterior,
        CASE
          WHEN COALESCE(py.compras_prev, 0) > 0
            THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_prev) / py.compras_prev)::numeric
          ELSE NULL
        END                                                              AS delta_vs_2025,
        u.ultima_compra                                                  AS ultima_compra,
        COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))          AS whatsapp
      FROM active_pairs ap
      JOIN      ident      id2 ON id2.cliente_key = ap.cliente_key AND id2.empresa = ap.empresa
      LEFT JOIN ytd_actual ya  ON ya.cliente_key  = ap.cliente_key AND ya.empresa  = ap.empresa
      LEFT JOIN prev_year  py  ON py.cliente_key  = ap.cliente_key AND py.empresa  = ap.empresa
      LEFT JOIN ultima     u   ON u.cliente_key   = ap.cliente_key AND u.empresa   = ap.empresa
      LEFT JOIN clientes_master m ON m.codigo = id2.cliente_codigo AND m.deleted = false
    )
  SELECT
    pe.cliente_norm,
    pe.cliente_id,
    pe.cliente_nombre,
    pe.cliente_codigo,
    pe.empresa,
    CASE
      WHEN v_is_todas
        THEN SUM(pe.compras_ytd) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.compras_ytd
    END                                                                   AS compras_ytd,
    CASE
      WHEN v_is_todas
        THEN SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.compras_anio_anterior
    END                                                                   AS compras_anio_anterior,
    CASE
      WHEN v_is_todas THEN
        CASE
          WHEN SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre) > 0
            THEN (
              SUM(pe.compras_ytd) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
              - SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
            ) / SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
          ELSE NULL
        END
      ELSE pe.delta_vs_2025
    END                                                                   AS delta_vs_2025,
    CASE
      WHEN v_is_todas
        THEN MAX(pe.ultima_compra) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.ultima_compra
    END                                                                   AS ultima_compra,
    pe.whatsapp,
    CASE
      WHEN v_is_todas
        THEN COUNT(*) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE 1::bigint
    END                                                                   AS empresas_count,
    CASE
      WHEN v_is_todas THEN (
        SELECT jsonb_agg(
          jsonb_build_object('empresa', e.empresa, 'monto', e.compras_ytd)
          ORDER BY e.compras_ytd DESC NULLS LAST
        )
        FROM per_empresa_row e
        WHERE e.cliente_id IS NOT DISTINCT FROM pe.cliente_id
          AND e.cliente_nombre = pe.cliente_nombre
      )
      ELSE NULL
    END                                                                   AS empresas_breakdown
  FROM per_empresa_row pe
  WHERE
    NOT v_is_todas
    OR pe.empresa = (
      SELECT e.empresa FROM per_empresa_row e
      WHERE e.cliente_id IS NOT DISTINCT FROM pe.cliente_id
        AND e.cliente_nombre = pe.cliente_nombre
      ORDER BY e.compras_ytd DESC NULLS LAST
      LIMIT 1
    )
  ORDER BY ultima_compra DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION clientes_anio(integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
