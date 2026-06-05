-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_empresa_12m_vw → FUENTE ÚNICA switch_facturas (Paso 3,
-- proyecto Fuente Única API). Retira el blend con ventas_raw.
--
-- CONTEXTO: switch_facturas tiene TODA la historia backfilleada del API (2022+),
-- reconciliada vs ventas_raw al centavo. Esta vista deja de leer ventas_raw.
--
-- QUÉ CAMBIA vs 20260601000100:
--   • Rama A (B2B): antes solo fecha >= 2025-05-02; ahora TODAS las fechas desde
--     switch_facturas. Atribución por ID (cliente_switch_id → switch_clientes.codigo)
--     con FALLBACK por nombre (clientes_master.nombre_normalized) cuando el ID no
--     resuelve. El histórico B2B tiene ~31% de IDs sin puente (clientes viejos
--     fuera del snapshot actual de switch_clientes); el fallback por nombre los
--     recupera, igual que hacía la rama ventas_raw vieja. Para los que SÍ tienen
--     ID, se preserva el split correcto (separa "Dana Mall" de "Dana Mall Aguas").
--   • Rama B (NO-B2B: boston, american_classic): antes ventas_raw todas las fechas;
--     ahora switch_facturas todas las fechas, join por nombre (sin código, igual).
--   • Se elimina toda lectura de ventas_raw.
--
-- BUCKETING HORA-PANAMÁ: fecha/anio/mes con (fecha AT TIME ZONE America/Panama),
--   consistente con switch_ventas_unificado_vw (Paso 2) y la convención local de
--   ventas_raw.
--
-- INVARIANTE: SUM(compras_ytd) y SUM(compras_anio_anterior) por empresa se
--   conservan (mismas ventas, re-atribuidas). La distribución por cliente del
--   tramo histórico mejora (ID-split + recuperación de huérfanos por nombre).
--
-- SE PRESERVA TODO lo demás de 20260601000100: Δ same-period (max_mes), active_pairs
--   rolling 12m, exclusión de genéricos, UNIQUE INDEX para REFRESH CONCURRENTLY,
--   todas las columnas, clientes_agregado_12m_vw, grano cliente_key (codigo o
--   '~'||nombre para huérfanos sin código ni match).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW              IF EXISTS clientes_agregado_12m_vw CASCADE;
DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw  CASCADE;

CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS
WITH
  -- ── Rama A: B2B desde switch_facturas, TODAS las fechas ─────────────────────
  -- cliente_norm + bucket Panama se calculan acá para poder usarlos en el join
  -- de fallback por nombre.
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
      COALESCE(sc.codigo, mc.codigo) AS cliente_codigo,   -- ID primario, nombre fallback
      a.cliente_norm,
      a.fecha, a.anio, a.mes, a.subtotal
    FROM a_raw a
    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = a.empresa_key
     AND sc.cliente_switch_id = a.cliente_switch_id
    LEFT JOIN clientes_master mc
      ON mc.nombre_normalized = a.cliente_norm
     AND mc.deleted = false
  ),

  -- ── Rama B: NO-B2B (boston, american_classic) desde switch_facturas, por nombre ─
  src_b AS (
    SELECT
      nb.empresa,
      m.codigo AS cliente_codigo,
      nb.cliente_norm,
      nb.fecha, nb.anio, nb.mes, nb.subtotal
    FROM (
      SELECT
        sf.empresa_key AS empresa,
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
    LEFT JOIN clientes_master m
      ON m.nombre_normalized = nb.cliente_norm
     AND m.deleted = false
  ),

  src AS (
    SELECT * FROM src_a
    UNION ALL
    SELECT * FROM src_b
  ),

  filtered AS (
    SELECT *
    FROM src
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
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

  cutoff AS (
    SELECT (date_trunc('month', NOW())::date - INTERVAL '12 months')::date AS d
  ),
  current_year AS (
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
  ),
  max_mes AS (
    SELECT COALESCE(MAX(k.mes), 12) AS m
    FROM keyed k, current_year cy
    WHERE k.anio = cy.y
  ),
  active_pairs AS (
    SELECT DISTINCT k.cliente_key, k.empresa
    FROM keyed k, cutoff c
    WHERE k.fecha >= c.d
  ),
  ytd_actual AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_ytd
    FROM keyed k, current_year cy, max_mes mm
    WHERE k.anio = cy.y AND k.mes <= mm.m
    GROUP BY k.cliente_key, k.empresa
  ),
  prev_year AS (
    SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_anio_anterior
    FROM keyed k, current_year cy, max_mes mm
    WHERE k.anio = cy.y - 1 AND k.mes <= mm.m
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
  COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))             AS whatsapp
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


-- ─────────────────────────────────────────────────────────────────────────────
-- Vista agregada (modo "Todas") — B2B only. Idéntica a 20260601000100; se
-- reconstruye por el CASCADE. Lee de la materialized view.
-- ─────────────────────────────────────────────────────────────────────────────

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

NOTIFY pgrst, 'reload schema';
