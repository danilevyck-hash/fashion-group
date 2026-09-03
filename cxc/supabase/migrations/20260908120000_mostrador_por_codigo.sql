-- ─────────────────────────────────────────────────────────────────────────────
-- La fila ámbar «Mostrador» de Ventas › Clientes mostraba UNA empresa de seis
-- (2-sep-2026)
--
-- Daniel lee ese número. Decía **$25.835,65**; el mostrador del grupo es
-- **$54.478,59**. Faltaban **$28.642,94** — el 53%.
--
-- ══ LA CAUSA ES LA MISMA DE ESTA MAÑANA, UN PISO MÁS ARRIBA ═════════════════
--
-- El commit 44be9b16 (`20260907120000_clientes_ranking_por_codigo.sql`) arregló
-- que el RANKING identificara al cliente por nombre. Ese mismo defecto seguía
-- vivo, sin tocar, en las DOS puertas que deciden qué es «el mostrador»:
--
--   1. Este SQL — `filtered` sacaba los genéricos POR NOMBRE
--      (`CONTADO`, `VENTAS`, `VENTAS LOCALES`).
--   2. La pantalla — `ClientesView.tsx` marcaba la fila ámbar comparando
--      `nombre === 'VENTAS LOCAL'`.
--
-- 🩸 **IDENTIFICAR UN CLIENTE POR SU NOMBRE FALLA PORQUE EL NOMBRE ES DE CADA
-- EMPRESA; EL CÓDIGO ES DEL GRUPO.** El mostrador es `TCKCTA` en las seis y se
-- llama distinto en cada una (medido hoy en `switch_clientes`, y el `id` es 1
-- en las seis):
--
--   Contado       → joystep · active_wear · active_shoes
--   VENTAS        → fashion_wear · vistana
--   VENTAS LOCA   → fashion_shoes          (truncado por Switch)
--
-- Ninguna se llama `VENTAS LOCAL`. Ese texto salía de `clientes_master`, que
-- tiene UNA fila `TCKCTA` con `nombre = 'VENTAS LOCAL'` — el nombre canónico que
-- el join le pega encima a la fila que sobrevivía. Por eso a veces coincidía y
-- casi siempre no.
--
-- Y las dos puertas se sumaban: la lista de nombres mataba cinco mostradores de
-- seis (`CONTADO` y `VENTAS`), y el sexto se salvaba de casualidad porque
-- Switch escribe `VENTAS LOCA` y la lista dice `VENTAS LOCALES`. La pantalla
-- entonces mostraba fashion_shoes solo, con el nombre de otra tabla.
--
-- ══ MEDIDO CONTRA PRODUCCIÓN (2-sep-2026, solo lectura) ════════════════════
--
--   MOSTRADOR 2026 POR EMPRESA — cliente con código TCKCTA
--
--     empresa          subtotal_descuento        subtotal
--     ─────────────────────────────────────────────────────
--     fashion_shoes            25.835,65        25.967,35
--     fashion_wear             15.264,12        15.751,75
--     vistana                   6.847,75         7.282,53
--     active_wear               3.691,50         3.699,50
--     active_shoes              2.220,20         2.224,00
--     joystep                     619,37           630,36
--     ─────────────────────────────────────────────────────
--     TOTAL                    54.478,59        55.555,49
--
-- ⚠️ **LA COLUMNA QUE VALE ES LA PRIMERA.** Todo este tab mide con
-- `subtotal_descuento` (el neto, después del descuento) — es la misma columna
-- con la que se calcula «Compras 2026» de cada cliente del ranking. Medir el
-- mostrador con `subtotal` (el bruto) daría **$55.555,49** y pondría la fila
-- ámbar en una base distinta de la de las filas de arriba: los $1.076,90 de
-- diferencia son descuentos que el resto de la pantalla ya restó. Un total que
-- no se puede comparar con la columna de al lado es peor que uno chico.
--
-- ══ EL GRANO — POR QUÉ NO HACE FALTA DECIDIR NADA A MANO ═══════════════════
--
-- El grano de estas vistas es `(cliente_key, EMPRESA)`, así que `TCKCTA` da
-- **una fila por empresa** y nunca una sola sumando las seis (candado:
-- `clientes-master-solo-del-grupo.test.ts`). Y de ahí para arriba, cada modo de
-- la pantalla recibe exactamente lo que su filtro permite:
--
--   · Modo «Todas» → `clientes_agregado_12m_vw` agrupa por
--     `(cliente_id, cliente_nombre)`; las seis filas comparten la fila
--     `TCKCTA` de `clientes_master`, así que llegan como UNA con el total del
--     grupo, igual que cualquier cliente multiempresa.
--   · Con una empresa elegida → llega la fila de esa empresa y nada más.
--
-- La pantalla suma las filas de mostrador que le llegaron. No enumera empresas
-- ni las descuenta: **la coherencia con el filtro es por construcción**, que es
-- la única que no se puede desincronizar.
--
-- ══ QUÉ NO CAMBIA ══════════════════════════════════════════════════════════
--
-- 🔴 **EL MOSTRADOR SIGUE FUERA DEL RANKING DE CLIENTES.** No es un cliente. La
-- vista lo deja pasar para que la pantalla pueda MOSTRARLO APARTE, y la pantalla
-- lo aparta por el mismo código con el que la vista lo dejó pasar. Si alguna vez
-- se cuela entre los clientes, el candado se pone rojo.
--
--   · `VENTAS LOCALES` sigue excluido: NO es el mostrador. Son facturas con un
--     `cliente_switch_id` que `switch_clientes` ya no conoce (ids 61/60/122/55,
--     $1.933,73 en 2026), sin código, y ya eran huérfanas antes de hoy.
--   · El mostrador de Boston y de ACS sigue afuera, igual que hoy: se llama
--     `CONTADO` y esta pantalla es del grupo.
--   · Ninguna fuente de totales de venta se toca: `ventas_dashboard_summary`,
--     `ventas_rollup_mensual_mv`, `comision_b2b_v5`, `switch_estadocuenta_aging`
--     y `cliente_ficha_ventas` no aparecen en este archivo.
--   · «Otros clientes» no se mueve: el mostrador tiene fila en
--     `clientes_master`, así que nunca fue huérfano.
--
-- ADITIVO Y REVERSIBLE: recrea dos vistas y una función; NO borra ni modifica
-- datos. Revertir = volver a correr 20260907120000.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
--
-- ⚠️ MIENTRAS NO SE CORRA, la pantalla no empeora: sigue habiendo una sola fila
-- `TCKCTA` (fashion_shoes) y la fila ámbar dice lo mismo que hoy — pero
-- identificada por código en vez de por un nombre prestado.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — El ranking del año EN CURSO (MV + vista agregada).
-- Copia EXACTA de 20260907120000 salvo por el `filtered` (el mostrador pasa).
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


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — El ranking de los años CERRADOS.
-- Copia EXACTA de 20260907120000 salvo por el `filtered` (el mostrador pasa).
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
  v_year_now int;
  v_max_mes  int;
  v_is_todas boolean;
BEGIN
  v_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_is_todas := (p_empresa IS NULL OR p_empresa = 'todas');

  IF p_year = v_year_now THEN
    SELECT COALESCE(MAX(EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Panama'))::int), 12)
    INTO v_max_mes
    FROM switch_facturas
    WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_year;
  ELSE
    v_max_mes := 12;
  END IF;

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
    ytd_actual AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_ytd
      FROM keyed k
      WHERE k.anio = p_year AND k.mes <= v_max_mes
      GROUP BY k.cliente_key, k.empresa
    ),
    prev_year AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_prev
      FROM keyed k
      WHERE k.anio = p_year - 1 AND k.mes <= v_max_mes
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
