-- ─────────────────────────────────────────────────────────────────────────────
-- DOS cambios pedidos por Daniel el 27-jul-2026. Van juntos porque tocan el
-- mismo número visto desde dos pantallas.
--
-- ══ 1. Las empresas del GRUPO vuelven a aparecer como clientes ═══════════════
--
-- Daniel buscó "Multi Fashion Holding" en Ventas → Clientes y no estaba. No era
-- un top-N ni un bug de búsqueda: la vista lo tiraba a propósito con
--   WHERE cliente_norm NOT IN ('CONFECCIONES BOSTON','MULTI FASHION HOLDING',
--                              'MULTIFASHION','BOSTON','CONTADO','VENTAS',…)
-- Su decisión, textual: *"es un cliente al final del dia. tiene que aparecer"*,
-- *"al final es venta real"*, *"hay q estar pendiente tambien como cliente"*.
-- Fashion Wear le factura y le tiene que cobrar: es una venta como cualquier
-- otra.
--
-- LOS TOTALES NO SE MUEVEN, y esto está MEDIDO, no supuesto. La exclusión vivía
-- ÚNICAMENTE en el ranking de clientes; los totales de venta nunca la tuvieron:
--   ventas_dashboard_summary (Resumen de /ventas + resumen mensual de Telegram)
--     B2B 2026 = 4.656.824,38  ← idéntico a la suma cruda CON Multi Fashion
--     (la suma SIN Multi Fashion daría 4.459.906,18)
--   ventas_rollup_mensual_mv (tabla mes a mes + Vista General) = 4.656.957,38
--     → también lo incluye
-- O sea: su plata YA estaba contada en las ventas; lo único que faltaba era la
-- fila del cliente. Después de esta migración los totales dan exactamente lo
-- mismo que antes. Multi Fashion Holding 2026: 196.918,20 sin ITBMS, 155 docs.
--
-- QUÉ CAMBIA Y QUÉ NO:
--   · SALEN de la lista de exclusión las 4 formas de las empresas del grupo
--     ('CONFECCIONES BOSTON','MULTI FASHION HOLDING','MULTIFASHION','BOSTON').
--   · SIGUEN excluidos los genéricos ('CONTADO','VENTAS','VENTAS LOCALES',
--     '(Sin nombre)'). No son un cliente: son el pseudo-cliente de mostrador
--     (cliente_codigo = 'TCKCTA'), que el sistema ya excluye a propósito de la
--     base de comisiones sobre esta misma data. Meterlos al ranking mezclaría
--     254 tiquetes sin nombre entre clientes reales. Pesan poco y no son de
--     nadie: VENTAS 19.751,75 · CONTADO 6.036,07 · VENTAS LOCALES 1.933,73 (2026).
--   · Columna NUEVA `es_del_grupo`: no resta ni filtra nada, sólo permite que la
--     pantalla los marque. Daniel los quiere ver identificados de un vistazo
--     ("es información, no exclusión"): venderle a una empresa propia es venta
--     real, pero no es haber ganado un cliente en la calle.
--
-- ══ 2. La ficha del cliente pasa a SIN ITBMS ═════════════════════════════════
--
-- `cliente_ficha_ventas` sumaba `f.total` (CON ITBMS) mientras Ventas → Clientes
-- suma `subtotal_descuento` (SIN). El mismo cliente, el mismo año, dos números:
-- City Mall Paso Canoa en fashion_wear 2026 daba 479.870,40 en Ventas y
-- 513.457,72 en la ficha. Daniel: **"Sin ITBMS"** para ventas, porque ese
-- impuesto se cobra para el fisco y nunca fue ingreso de la empresa.
-- Efecto medido en D-108: 210.702,50 → 196.918,20 (−13.784,30).
--
-- ⚠️ OJO — ESTO **NO** APLICA A CXC. Daniel lo dijo y es lo contablemente
-- correcto: *"pero cxc si se muestra con itbms, porq es lo que tengo q cobrar"*.
-- Saldos, aging y estado de cuenta siguen CON ITBMS y esta migración no los
-- toca. Son dos preguntas distintas: "cuánto me compró" (sin ITBMS) y "cuánto
-- me tiene que pagar" (con ITBMS).
--
-- ADITIVO Y REVERSIBLE: recrea vistas y una función; no borra ni modifica datos.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — RPC de la ficha: total → subtotal_descuento
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cliente_ficha_ventas(p_codigo text)
RETURNS TABLE (
  empresa_key    text,
  ventas_ytd     numeric,
  ultima_factura date
)
LANGUAGE sql STABLE AS $fn$
  WITH pares AS (
    SELECT sc.empresa_key, sc.cliente_switch_id
    FROM switch_clientes sc
    WHERE sc.codigo = p_codigo
      AND sc.cliente_switch_id IS NOT NULL
  ),
  fac AS (
    SELECT
      sf.empresa_key,
      sf.tipo_comprobante,
      -- SIN ITBMS. Era sf.total; ver el encabezado.
      sf.subtotal_descuento                                       AS base,
      (sf.fecha AT TIME ZONE 'America/Panama')::date              AS f_pa,
      EXTRACT(YEAR FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio_pa
    FROM switch_facturas sf
    JOIN pares p
      ON p.empresa_key = sf.empresa_key
     AND p.cliente_switch_id = sf.cliente_switch_id
  )
  SELECT
    f.empresa_key,
    COALESCE(SUM(
      CASE
        WHEN f.anio_pa = EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Panama'))::int THEN
          CASE
            WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN f.base
            WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.base
            ELSE 0
          END
        ELSE 0
      END
    ), 0)::numeric AS ventas_ytd,
    MAX(CASE
      WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción') THEN f.f_pa
    END) AS ultima_factura
  FROM fac f
  GROUP BY f.empresa_key;
$fn$;

GRANT EXECUTE ON FUNCTION cliente_ficha_ventas(text) TO service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — El ranking de clientes deja de esconder a las empresas del grupo
--
-- Copia EXACTA de 20260606020000 salvo por: (a) el CTE `filtered`, que ya no
-- excluye a las empresas del grupo, y (b) la columna nueva `es_del_grupo`.
-- Todo lo demás —atribución por ID con fallback por nombre, bucketing en hora
-- Panamá, corte same-period por max_mes, universo rolling 12m, grano
-- cliente_key— queda igual.
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
      COALESCE(sc.codigo, mc.codigo) AS cliente_codigo,
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

  -- ⬇️ EL CAMBIO. Antes esta lista también tenía a las empresas del grupo
  -- ('CONFECCIONES BOSTON','MULTI FASHION HOLDING','MULTIFASHION','BOSTON') y
  -- por eso Multi Fashion Holding no aparecía en ningún lado del ranking.
  -- Quedan sólo los GENÉRICOS, que no son un cliente sino el mostrador.
  filtered AS (
    SELECT *
    FROM src
    WHERE cliente_norm NOT IN (
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


-- ── Vista agregada (modo "Todas") — B2B only. Igual que antes + es_del_grupo ──

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

NOTIFY pgrst, 'reload schema';
