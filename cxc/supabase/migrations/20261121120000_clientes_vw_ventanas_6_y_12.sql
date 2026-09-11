-- ─────────────────────────────────────────────────────────────────────────────
-- VENTAS › CLIENTES SIRVE «ÚLTIMOS 12 MESES» Y «ÚLTIMOS 6 MESES» (11-sep-2026)
--
-- Desde el 11-sep-2026 Ventas tiene UN solo selector de período arriba (Año
-- 2026 · 2025 · … · Últimos 12 meses · Últimos 6 meses) que manda en las tres
-- pestañas. La vista `clientes_empresa_12m_vw` sumaba SOLO el año de calendario
-- (`compras_ytd`) y el mismo tramo del año anterior; el «12m» de su nombre era
-- el UNIVERSO (quién está activo), no una suma. Sin estas columnas la pestaña
-- Clientes no podía servir las ventanas y caía al año en curso.
--
-- QUÉ AGREGA (todo ADITIVO — ninguna columna existente cambia de valor):
--   · `compras_12m`      — venta neta desde el piso de `cutoff` (el mismo que
--                          decide quién está activo: el 1 del mes, 12 meses atrás).
--   · `compras_12m_prev` — la MISMA ventana un año antes, cortada en `corte_prev`
--                          (los mismos días, regla de la casa).
--   · `compras_6m` / `compras_6m_prev` — idem con seis meses de calendario
--                          incluido el en curso (el mismo corte que Productos).
--   La vista agregada (`clientes_agregado_12m_vw`) las suma por cliente y las
--   lleva en `empresas_breakdown` (`monto_12m`, `monto_6m`).
--
-- 🔴 `compras_ytd`, `compras_anio_anterior`, `delta_vs_2025` y `ultima_compra`
-- son BYTE A BYTE las de 20260909120000: «Compras · Año 2026» no se mueve.
-- El resto del archivo es copia de esa migración con las líneas nuevas marcadas.
--
-- DROP + CREATE porque el cuerpo de una MV no se puede reemplazar (mismo patrón
-- que 20260908120000). Mismo nombre, mismos índices, misma función de refresh.
-- Rollback = volver a correr 20260909120000.
--
-- ⚠️ MIENTRAS NO SE CORRA, la pantalla no empeora: el servidor no encuentra
-- `compras_12m` en las filas, dice `ventanasDisponibles: []` y el selector de
-- Clientes ofrece solo años. Sin la DDL todo se comporta como hoy.
--
-- Aplicar: `npm run migrar supabase/migrations/20261121120000_clientes_vw_ventanas_6_y_12.sql`
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- ⬇️ LAS VENTANAS DE 6 Y 12 MESES (11-sep-2026). Ver el encabezado.
  -- 12 meses = desde el piso de `cutoff` (el mismo con el que se decide quién
  -- está activo); 6 meses = seis meses de calendario incluido el en curso.
  cutoff6 AS (
    SELECT (date_trunc('month', h.d::timestamp)::date - INTERVAL '6 months')::date AS d FROM hoy h
  ),
  ult12 AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_12m
    FROM keyed k, cutoff c
    WHERE k.fecha >= c.d
    GROUP BY k.cliente_key, k.empresa
  ),
  -- La misma ventana un año antes, cortada en corte_prev (los mismos días).
  ult12_prev AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_12m_prev
    FROM keyed k, cutoff c, corte_prev cp
    WHERE k.fecha >= (c.d - INTERVAL '1 year')::date AND k.fecha <= cp.d
    GROUP BY k.cliente_key, k.empresa
  ),
  ult6 AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_6m
    FROM keyed k, cutoff6 c
    WHERE k.fecha >= c.d
    GROUP BY k.cliente_key, k.empresa
  ),
  ult6_prev AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_6m_prev
    FROM keyed k, cutoff6 c, corte_prev cp
    WHERE k.fecha >= (c.d - INTERVAL '1 year')::date AND k.fecha <= cp.d
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
  COALESCE(u12.compras_12m, 0)::numeric                               AS compras_12m,
  COALESCE(u12p.compras_12m_prev, 0)::numeric                         AS compras_12m_prev,
  COALESCE(u6.compras_6m, 0)::numeric                                 AS compras_6m,
  COALESCE(u6p.compras_6m_prev, 0)::numeric                           AS compras_6m_prev,
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
LEFT JOIN ult12      u12 ON u12.cliente_key = ap.cliente_key AND u12.empresa = ap.empresa
LEFT JOIN ult12_prev u12p ON u12p.cliente_key = ap.cliente_key AND u12p.empresa = ap.empresa
LEFT JOIN ult6       u6  ON u6.cliente_key  = ap.cliente_key AND u6.empresa  = ap.empresa
LEFT JOIN ult6_prev  u6p ON u6p.cliente_key = ap.cliente_key AND u6p.empresa = ap.empresa
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
        jsonb_build_object('empresa', empresa, 'monto', compras_ytd, 'monto_12m', compras_12m, 'monto_6m', compras_6m)
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
      compras_12m, compras_12m_prev, compras_6m, compras_6m_prev,
      ultima_compra,
      COUNT(*)                   OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS empresas_count,
      SUM(compras_ytd)           OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_ytd,
      SUM(compras_anio_anterior) OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_prev,
      SUM(compras_12m)           OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_12m,
      SUM(compras_12m_prev)      OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_12m_prev,
      SUM(compras_6m)            OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_6m,
      SUM(compras_6m_prev)       OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_6m_prev,
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
  r.total_12m               AS compras_12m,
  r.total_12m_prev          AS compras_12m_prev,
  r.total_6m                AS compras_6m,
  r.total_6m_prev           AS compras_6m_prev,
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
