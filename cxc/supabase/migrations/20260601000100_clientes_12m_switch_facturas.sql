-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_empresa_12m_vw → fuente switch_facturas (puente por ID)
--
-- ⚠️ PRERREQUISITO: switch_clientes debe existir Y estar poblada antes de aplicar
-- esta migration. Orden:
--   1. 20260601000000_switch_clientes.sql   (crea tabla)
--   2. node scripts/backfill-switch-clientes.mjs   (puebla puente id→codigo)
--   3. ESTA migration
-- Si se aplica con switch_clientes vacía, todas las facturas switch quedan
-- huérfanas (sin codigo) y la vista colapsa todo en "Otros clientes".
--
-- QUÉ CAMBIA:
-- El tab Clientes leía SOLO de ventas_raw (CSV manual, incompleto: omitía
-- facturas mayoristas B2B que la API sí captura → clientes con ventas 2026 reales
-- aparecían en $0/-100%, ej. Quality Shoes D-129). Ahora la fuente B2B es:
--   • switch_facturas para fecha >= 2025-05-02 (API, completo y al día),
--     puenteado switch_facturas.(empresa_key,cliente_switch_id) → switch_clientes
--     .codigo → clientes_master.codigo (join por ID, robusto: separa "Dana Mall"
--     de "Dana Mall Aguas" que el match por nombre fusionaba),
--   • ventas_raw para fecha < 2025-05-02 (histórico pre-Switch), join por nombre.
-- Empresas NO B2B (boston, american_classic, etc.) siguen 100% en ventas_raw
-- (todas las fechas, join por nombre) — sin cambio, sin regresión.
--
-- Corte hermético 2025-05-02 (idéntico a switch_ventas_unificado_vw): switch
-- arranca el 02 (1-may feriado, $0 verificado). Las dos ramas son disjuntas por
-- fecha → sin doble conteo.
--
-- Base de monto: subtotal_descuento neto por tipo (Factura/Tiquete/Transacción/
-- Nota de Débito = +, Nota de Crédito = −) para switch — consistente con el
-- Resumen (switch_ventas_unificado_vw); subtotal para ventas_raw (ya viene
-- firmado, las NC son filas negativas). Reconciliación validada al centavo:
-- SUM(compras_ytd) B2B 2026 = SUM net switch_facturas B2B 2026 (excl. genéricos).
--
-- SE PRESERVA del fix anterior (20260510040000):
--   • Δ same-period: max_mes global, ambos lados (YTD y prev) capados a mes<=max_mes.
--   • active_pairs: al menos 1 factura en los últimos 12 meses (rolling).
--   • Exclusión de nombres genéricos (+ 'VENTAS LOCALES', nuevo bucket POS Switch).
--   • UNIQUE INDEX para REFRESH ... CONCURRENTLY.
--   • Todas las columnas expuestas (compras_ytd, compras_anio_anterior,
--     delta_vs_2025, ultima_compra, empresa, cliente_codigo, cliente_nombre,
--     cliente_id, whatsapp) — el frontend y clientes_agregado_12m_vw dependen.
--
-- GRANO: cambia de cliente_norm (nombre) a cliente_key = codigo D-XXX (o
-- '~'||nombre para huérfanos sin codigo). La columna se sigue llamando
-- cliente_norm para no romper el UNIQUE INDEX ni lectores. Huérfanos
-- (cliente_id null) se colapsan en "Otros clientes" en la UI (igual que hoy).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW              IF EXISTS clientes_agregado_12m_vw CASCADE;
DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw  CASCADE;

CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS
WITH
  -- ── Fuente unificada con dimensión cliente ──────────────────────────────────
  src AS (
    -- (A) switch_facturas B2B, fecha >= 2025-05-02. Puente por ID a codigo D-XXX.
    SELECT
      sf.empresa_key                                                       AS empresa,
      sc.codigo                                                            AS cliente_codigo,
      COALESCE(
        NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
        '(Sin nombre)'
      )                                                                    AS cliente_norm,
      sf.fecha::date                                                       AS fecha,
      EXTRACT(YEAR  FROM sf.fecha)::int                                     AS anio,
      EXTRACT(MONTH FROM sf.fecha)::int                                     AS mes,
      CASE
        WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
        WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
        ELSE 0
      END                                                                  AS subtotal
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = sf.empresa_key
     AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.fecha >= DATE '2025-05-02'
      AND sf.empresa_key IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
      AND sf.cliente_nombre IS NOT NULL

    UNION ALL

    -- (B) ventas_raw: histórico B2B (< 2025-05-02) + todo lo NO-B2B (todas las
    --     fechas). Join por nombre a clientes_master (como la vista anterior).
    SELECT
      vn.empresa                                                           AS empresa,
      m.codigo                                                             AS cliente_codigo,
      vn.cliente_norm                                                      AS cliente_norm,
      vn.fecha,
      vn.anio,
      vn.mes,
      vn.subtotal
    FROM (
      SELECT
        CASE
          WHEN r.empresa IN ('vistana', 'vistana_international') THEN 'vistana'
          WHEN r.empresa IN ('boston', 'confecciones_boston')   THEN 'confecciones_boston'
          ELSE r.empresa
        END                                                                AS empresa,
        COALESCE(
          NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(r.cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
          '(Sin nombre)'
        )                                                                  AS cliente_norm,
        r.fecha,
        r.anio,
        r.mes,
        r.subtotal
      FROM ventas_raw r
      WHERE r.cliente IS NOT NULL
    ) vn
    LEFT JOIN clientes_master m
      ON m.nombre_normalized = vn.cliente_norm
     AND m.deleted = false
    WHERE
      CASE
        -- B2B: solo histórico pre-Switch (switch_facturas cubre >= 2025-05-02).
        WHEN vn.empresa IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
          THEN vn.fecha < DATE '2025-05-02'
        -- No-B2B (boston, american_classic, ...): todas las fechas (sin cambio).
        ELSE true
      END
  ),

  filtered AS (
    SELECT *
    FROM src
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
      'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)'
    )
  ),

  -- Grano unificado: codigo D-XXX, o '~'||nombre para huérfanos (sin puente /
  -- sin match en master). Nunca null → apto para el UNIQUE INDEX.
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
  -- max_mes: último mes con ventas en el año actual. Tope para numerador y
  -- denominador → ventanas comparables (fix same-period preservado).
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
  -- Representante de identidad por (cliente_key, empresa): codigo no-nulo + nombre.
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

-- UNIQUE index requerido por REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_clientes_empresa_12m_vw_unq
  ON clientes_empresa_12m_vw (cliente_norm, empresa);

CREATE INDEX idx_clientes_empresa_12m_vw_empresa_ultima
  ON clientes_empresa_12m_vw (empresa, ultima_compra DESC NULLS LAST);

CREATE INDEX idx_clientes_empresa_12m_vw_cliente_id
  ON clientes_empresa_12m_vw (cliente_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- Vista agregada (modo "Todas") — B2B only. Sin cambios de lógica vs
-- 20260510060000; se reconstruye por el CASCADE. Lee de la materialized view.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW clientes_agregado_12m_vw AS
WITH
  -- Pre-filtro B2B: sincronizado con B2B_EMPRESA_KEYS en src/lib/empresa-mapping.ts.
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


-- ─────────────────────────────────────────────────────────────────────────────
-- Refresh inicial + permisos
-- ─────────────────────────────────────────────────────────────────────────────

REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;

GRANT SELECT ON clientes_empresa_12m_vw  TO service_role;
GRANT SELECT ON clientes_agregado_12m_vw TO service_role;

NOTIFY pgrst, 'reload schema';
