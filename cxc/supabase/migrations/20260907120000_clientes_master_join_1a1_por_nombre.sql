-- ─────────────────────────────────────────────────────────────────────────────
-- Ventas › Clientes mostraba el DOBLE de la venta real (2-sep-2026)
--
-- Daniel, contra Switch:  City Mall David · Vistana · 2026
--     la app decía   $227.872,28
--     Switch dice    $113.936,14      exactamente 2,000x
--
-- ══ LA CAUSA RAÍZ NO ERA EL JOIN: ERA QUE BOSTON ESTABA ADENTRO ═════════════
--
-- Daniel, textual: *"¿por qué confundirías City de Boston si ya había dicho que
-- Boston no puede tocar esos módulos? Boston es estricto para ver sus ventas y
-- tiene hasta su propio CXC, no quiero que se mezcle en mi grupo"*.
--
-- El 28-jul-2026 a las 07:01 UTC, `sync-clientes-master` metió 4.910 clientes de
-- Confecciones Boston en `clientes_master`. Ese sync excluía `american_classic`
-- y SOLO a `american_classic` — Boston entraba. Y `clientes_master` **no tiene
-- columna `empresa_key`**: es una fila por CÓDIGO, compartida por las 6 del
-- grupo. Una vez adentro, un cliente de Boston es indistinguible de uno del
-- grupo. Eso viola el invariante 🔴 más fuerte del repo
-- (`docs/postmortems/boston-cxc.md`): *"Boston NUNCA se mezcla con el CXC del
-- grupo — ni una fila, ni un total, ni un export, ni un badge"*.
--
-- Ese arreglo va en el CÓDIGO, no acá: `src/lib/switch-api/sync-clientes-master.ts`
-- ahora pide por INCLUSIÓN (`.in("empresa_key", EMPRESAS_DEL_GRUPO)`).
--
-- ══ Y EL SEGUNDO DEFECTO, QUE ES EL QUE ARREGLA ESTA MIGRACIÓN ══════════════
--
-- Las vistas del ranking resolvían el código del cliente **uniendo por NOMBRE**:
--     LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm
-- Un LEFT JOIN contra una tabla que puede tener el mismo nombre en dos filas no
-- "elige una": devuelve LAS DOS. Cada factura de ese cliente se fue por los dos
-- caminos y el SUM la contó dos veces. Medido el 2-sep-2026: **46 nombres
-- repetidos entre filas vivas**, 24 de ellos mezclando un código del grupo con
-- uno de Boston (`CITY MALL DAVID` = `D-24` del grupo y `83` de Boston).
--
-- 🔴 **HACEN FALTA LAS DOS COSAS, Y ESTÁ MEDIDO.** Sacar a Boston sin arreglar
-- el join deja $13.426,00 de doble conteo vivo: quedan 3 nombres repetidos
-- ENTRE clientes del propio grupo (`CITY MODA CHORRERA` D-30/D-26,
-- `METRO SHOES PANAMA SA` D-103/D-173, `EL MACHETAZO SAN MIGUELITO` D-171/D-101),
-- que son códigos desfasados en el panel de Switch, no un error nuestro. Y
-- arreglar el join sin sacar a Boston deja clientes del grupo rotulados con
-- código de Boston. Un nombre repetido NO es un error; unir por él, sí.
--
-- ══ POR QUÉ NO SE PUEDE "UNIR POR CÓDIGO" A SECAS ═══════════════════════════
--
-- Se midió antes de escribirlo, que es lo que pidió Daniel. La fuente del
-- ranking es `switch_facturas`, que trae `cliente_switch_id` y `cliente_nombre`
-- — **NO trae el código**. El código sale de `switch_clientes` por el par
-- (empresa, id), y cuando ese par no existe el nombre es lo único que queda.
-- Borrar el fallback SÍ pierde clientes reales del ranking: medido, `AIDY SHOP
-- NO2` (D-2) y `A-AMANI SA` (D-1) —clientes del grupo en las 6 empresas— caían a
-- la fila «Otros clientes». Perder un cliente del ranking es peor que mostrarlo
-- doble.
--
-- LA SOLUCIÓN es que el fallback sea **1-a-1 POR CONSTRUCCIÓN**, no por suerte:
-- una vista que agrupa por nombre y se queda SOLO con los nombres que tienen una
-- única fila viva. Cuando el nombre es ambiguo **se abstiene** (devuelve nada) y
-- el cliente cae a huérfano — la misma regla que ya gobierna Asistencia:
-- 🔑 *cuando el sistema no puede saber, se abstiene*. Adivinar cuál de dos
-- clientes homónimos es el dueño de la plata sería inventar.
--
-- ══ MEDIDO CONTRA PRODUCCIÓN (solo lectura, 2-sep-2026) ═════════════════════
--
-- Reproduciendo la aritmética de la vista sobre los datos REALES:
--                                             filas      suma 2026 YTD    City Mall David
--   hoy (join por nombre, Boston adentro)      255      $7.911.210,10      $227.872,28
--   solo sacando a Boston                      255      $5.371.023,39      $113.936,14
--   ESTA MIGRACIÓN + Boston afuera             255      $5.357.597,39      $113.936,14
--
-- El «hoy» reproduce EXACTO lo que publica la MV en producción (255 filas /
-- $7.909.875,00 en el refresh de las 07:35; la diferencia son las facturas que
-- entraron después). **No se pierde ni una fila: 255 antes y 255 después.**
--
-- ══ QUÉ TOCA Y QUÉ NO ═══════════════════════════════════════════════════════
--
--   TOCA:  clientes_master_por_nombre_unico_vw (NUEVA, el resolvedor 1-a-1)
--          clientes_empresa_12m_vw   (MV, Ventas › Clientes año en curso)
--          clientes_agregado_12m_vw  (modo «Todas»; se recrea por el CASCADE)
--          clientes_anio()           (Ventas › Clientes años CERRADOS — tenía el
--                                     mismo join y lee el clientes_master de HOY,
--                                     así que duplicaba la historia entera hacia
--                                     atrás: 2025/vistana City Mall Paso Canoa
--                                     $1.118.329,60 contra $559.164,80 real)
--
--   NO TOCA (verificado, no supuesto — no romperlo):
--          ventas_dashboard_summary   · no menciona clientes_master
--          ventas_rollup_mensual_mv   · idem
--          comision_b2b_v5            · idem
--          switch_estadocuenta_aging  · joinea por `codigo`, que es único
--          cliente_ficha_ventas       · joinea por `codigo` y ya daba bien
--   Los TOTALES de venta no se mueven: acá se listan CLIENTES. Si un total de
--   Ventas o de Vista General cambia, el cambio está mal.
--
-- 🩸 ESTE MISMO BUG SE PARCHÓ DOS VECES SIN MIRAR LA TERCERA SUPERFICIE:
--    Directorio (#387) y buscador ⌘K (#388), los dos el 30-jul-2026. Las dos
--    veces se arregló la pantalla que alguien notó. El ranking de Ventas llevaba
--    cinco semanas publicando $2,55 millones de venta que no existió.
--
-- ADITIVO Y REVERSIBLE: recrea vistas y una función; NO borra ni modifica datos.
-- ⚠️ La limpieza de las 4.914 filas de Boston que ya están en `clientes_master`
--    va APARTE y NO se ejecuta acá — ver `scripts/_verif-clientes-master-boston.mjs`
--    (solo lectura), que reporta exactamente qué filas son antes de tocar nada.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 0 — EL RESOLVEDOR 1-A-1. Una sola definición, leída por los dos objetos.
--
-- 🔴 `HAVING COUNT(*) = 1` ES EL INVARIANTE, no una optimización. Es lo que hace
-- que un LEFT JOIN contra esta vista NO PUEDA multiplicar filas: el GROUP BY es
-- por la misma columna con la que se joinea, así que hay como máximo una fila por
-- `nombre_normalized`. `MIN(codigo)` no "elige" nada — con COUNT(*)=1 hay un solo
-- código posible.
--
-- Un `DISTINCT ON (nombre_normalized) … ORDER BY codigo` también sería 1-a-1,
-- pero elegiría un dueño ARBITRARIO para la plata de dos homónimos y se callaría.
-- Preferimos abstenernos: sin fila, el cliente cae a «Otros clientes», que es
-- visible y revisable.
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS clientes_master_por_nombre_unico_vw CASCADE;

CREATE VIEW clientes_master_por_nombre_unico_vw AS
SELECT
  m.nombre_normalized,
  MIN(m.codigo) AS codigo
FROM clientes_master m
WHERE m.deleted = false
  AND m.nombre_normalized IS NOT NULL
GROUP BY m.nombre_normalized
HAVING COUNT(*) = 1;

GRANT SELECT ON clientes_master_por_nombre_unico_vw TO service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — El ranking del año EN CURSO (MV + vista agregada).
-- Copia EXACTA de 20260727230000 salvo por los dos LEFT JOIN marcados con ⬇️.
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
    -- ⬇️ EL ARREGLO (ver el encabezado). Antes acá decía `clientes_master mc`
    -- a secas: un LEFT JOIN contra una tabla que puede tener el mismo
    -- `nombre_normalized` en dos filas MULTIPLICA la factura por la cantidad de
    -- homónimos, y el SUM de más abajo la cuenta esas veces. Ahora resuelve
    -- contra la vista 1-a-1, que por construcción devuelve como máximo una fila.
    LEFT JOIN clientes_master_por_nombre_unico_vw mc
      ON mc.nombre_normalized = a.cliente_norm
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
    -- Misma corrección que en la rama A, por el mismo motivo.
    LEFT JOIN clientes_master_por_nombre_unico_vw m
      ON m.nombre_normalized = nb.cliente_norm
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


-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — El ranking de los años CERRADOS.
-- Copia EXACTA de 20260606050000 salvo por los dos LEFT JOIN marcados.
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
        COALESCE(sc.codigo, mc.codigo) AS cliente_codigo,
        a.c_norm, a.fecha, a.anio, a.mes, a.subtotal
      FROM a_raw a
      LEFT JOIN switch_clientes sc
        ON sc.empresa_key = a.empresa_key AND sc.cliente_switch_id = a.cliente_switch_id
      -- Mismo arreglo que en clientes_empresa_12m_vw: esta función lee el
      -- `clientes_master` de HOY, así que el fan-out por nombre duplicaba
      -- también TODOS los años cerrados, retroactivamente.
      LEFT JOIN clientes_master_por_nombre_unico_vw mc
        ON mc.nombre_normalized = a.c_norm
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
      LEFT JOIN clientes_master_por_nombre_unico_vw m
        ON m.nombre_normalized = nb.c_norm
    ),
    src AS (
      SELECT * FROM src_a
      UNION ALL
      SELECT * FROM src_b
    ),
    filtered AS (
      SELECT *
      FROM src s
      WHERE s.c_norm NOT IN (
        'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
        'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)'
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
