-- ─────────────────────────────────────────────────────────────────────────────
-- EL COSTO DEL RESUMEN INCLUYE LAS NOTAS DE DÉBITO (3-sep-2026)
--
-- 🩸 EL DEFECTO. Ventas › Resumen, Active Wear, agosto 2026: costo −$44.483,03 y
-- utilidad mayor que la venta. El 27-ago se anuló una nota de crédito de
-- $74.166 con una NOTA DE DÉBITO de $73.752. La fuente de costo del Resumen
-- (`switch_costo_unificado_vw` → `switch_articulo_diario`, que baja de
-- `/apireporte/ventasucursal`) NO trae notas de débito: restó la NC y nunca
-- sumó la ND. Al armar esa vista (20260606080000) se aceptó «~0,1 % del costo»;
-- en agosto fueron $50.041,20 de costo en un solo mes-empresa.
--
-- LA FUENTE QUE SÍ TIENE EL COSTO DE LAS ND. `switch_factura_utilidad` (reporte
-- web «Listado de comprobantes», `sync-utilidad`, 07:00 UTC) trae costo POR
-- DOCUMENTO para las 6 empresas del grupo desde ene-2026, con `tipo_comprobante`
-- = 'Nota de Débito'. Medido contra el panel de Switch (Reportes › Total de
-- ventas, `totalventas?tipo=04`) el 3-sep-2026, 8 empresas × may–ago 2026:
--
--   · Active Wear ago: FA 5.885,27 − NC 50.368,30 + ND 50.041,20 = 5.558,17,
--     el número exacto del panel.
--   · Las 32 celdas cuadran a ±$0,08 (redondeo por artículo vs por documento)
--     salvo Boston jul (el panel de Switch está corrupto: $900 M de costo por la
--     fila del 14-jul que ya cazó el guard de montos) y Boston ago (−$160,02:
--     dos artículos con costo sospechoso que el guard de `sync-articulos` guarda
--     en 0; no es una ND).
--
-- POR QUÉ NO LAS OTRAS DOS OPCIONES:
--   · `switch_facturas` (cabecera de la ND) no tiene costo. El API tampoco lo
--     da por documento (`docs/switch-referencia.md` §1.8).
--   · `switch_costo_diario` (`totalventas?tipo=03`) sí trae la ND, pero su
--     ÚLTIMO DÍA de cada mes vale $0 para siempre (se escribe a las 00:30 de
--     Panamá y el día 1 el reporte ya es del mes nuevo): vistana 31-ago =
--     $13.606,69 de costo real, $0 en esa tabla. Y un día que Switch manda
--     corrupto se queda con el último valor parcial (Boston 30-jul: $40 de
--     costo contra $1.649,64 reales). Sirve para CUADRAR, no para mostrar.
--
-- QUÉ HAY EN ESTA MIGRACIÓN (nada se reemplaza in-place; lo anterior queda):
--   1. `switch_costo_unificado_v2` — la vista mensual: `switch_articulo_diario`
--      firmado por tipo (sin el código 'ND', ver abajo) + el costo de las ND de
--      `switch_factura_utilidad`. `switch_costo_unificado_vw` queda intacta.
--   2. `ventas_rollup_mensual_mv` — se recrea sobre la v2 (DROP + CREATE: el
--      cuerpo de una MV no se puede reemplazar; mismo patrón que
--      20260812180000). Mismo nombre, mismas columnas, mismos índices, misma
--      función de refresh: los lectores no cambian. Rollback = volver a correr
--      20260609120000, que la arma sobre la vista vieja.
--   3. `ventas_dashboard_summary_v2` — el mes EN CURSO en vivo, con las ND.
--   4. `ventas_dashboard_prev_same_period_v4` — el «vs año anterior» del
--      Resumen. 🩸 Su CTE `dia_costo` (v1..v3) leía `switch_costo_diario` para
--      el año anterior: hoy devuelve vacío (esa tabla arranca 2026-05 y el año
--      anterior es 2025), pero el 1-ene-2027 despierta y alimentaría el costo
--      «vs 2026» con los últimos días de cada mes en $0. Ahora lee la MISMA
--      fuente que el resto (artículo diario + ND de utilidad). Para 2025 eso
--      además reemplaza `ventas_raw.costo` por `switch_articulo_diario`, que
--      es lo que el Resumen muestra al abrir 2025 (Δ medido ene–sep 2025:
--      entre 0,00 % y −2,28 % por empresa, active_shoes la mayor).
--   5. `cuadre_costo_mensual_v1` — el LECTOR de `switch_costo_diario`: por
--      (empresa, mes cerrado), el costo según esa tabla contra el costo según
--      la fuente del Resumen, sumando SOLO los días comparables. La decisión
--      (>2 % → Telegram 🔧 SISTEMA) vive en `src/lib/alertas/cuadre-costo.ts`.
--
-- 🔴 EL CÓDIGO 'ND' DE `switch_articulo_diario` SE EXCLUYE A PROPÓSITO. Hoy no
-- hay ni una fila con ese código (medido: FA · NC · CNF, 0 'ND' en toda la
-- tabla). Si algún día `ventasucursal` empezara a mandarlas, sumarlas junto con
-- las de `switch_factura_utilidad` contaría cada ND dos veces. La ND tiene UNA
-- fuente, y es utilidad. (`switch_articulo_diario_tipos_sin_clasificar` sigue
-- sin marcar 'ND' como desconocido: es un código válido que acá no se suma.)
--
-- LÍMITES QUE QUEDAN, dichos:
--   · ACS y Boston no tienen `sync-utilidad`: sus ND siguen fuera del costo.
--     Medido: ninguna en may–ago 2026; la última de Boston es de feb-2026
--     ($453) y la de ACS de ago-2025 ($33). El cuadre (5) las vigila.
--   · Antes de ene-2026 no hay `switch_factura_utilidad`: las ND de 2025 hacia
--     atrás siguen fuera, como hasta hoy.
--
-- Aplicar: `npm run migrar supabase/migrations/20260915120000_costo_con_notas_de_debito.sql`
-- Mientras no corra, el código cae a `ventas_dashboard_summary` y a
-- `…prev_same_period_v3` (`rpcConFallbackDeVersion`) y el cuadre se omite.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Índice parcial para la rama de ND (212 filas de 1.831 hoy) ───────────
-- Cubre la vista, la RPC del mes en curso y el cuadre: los tres filtran por
-- 'Nota de Débito' y leen (empresa_key, fecha, costo). Index-only scan.
CREATE INDEX IF NOT EXISTS idx_sfu_nd_fecha
  ON switch_factura_utilidad (fecha, empresa_key)
  INCLUDE (costo)
  WHERE tipo_comprobante = 'Nota de Débito';

-- ── 1. La vista mensual, versión 2 ──────────────────────────────────────────
CREATE OR REPLACE VIEW switch_costo_unificado_v2 AS
SELECT empresa_key, mes, SUM(costo_total)::numeric AS costo_total
FROM (
  -- Facturas, tiquetes, transacciones (suman) y notas de crédito (restan), por
  -- artículo y día. Misma fórmula que la vista v1, menos el código 'ND'.
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    SUM(CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END) AS costo_total
  FROM switch_articulo_diario
  WHERE tipo <> 'ND'
  GROUP BY 1, 2
  UNION ALL
  -- Las notas de débito, por documento, desde el reporte de utilidad.
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    SUM(costo) AS costo_total
  FROM switch_factura_utilidad
  WHERE tipo_comprobante = 'Nota de Débito'
  GROUP BY 1, 2
) u
GROUP BY empresa_key, mes;

GRANT SELECT ON switch_costo_unificado_v2 TO service_role;

COMMENT ON VIEW switch_costo_unificado_v2 IS
  'Costo neto por empresa_key x mes: switch_articulo_diario firmado por tipo (FA/TQ/CNF suman, NC resta, el codigo ND se excluye) + costo de las Notas de Debito de switch_factura_utilidad (unica fuente con costo de ND; 6 empresas del grupo desde ene-2026). Cuadrado al centavo contra el panel de Switch el 3-sep-2026. Reemplaza a switch_costo_unificado_vw, que excluia las ND.';

-- ── 2. La MV mensual, recreada sobre la v2 ──────────────────────────────────
-- ⚠️ DROP + CREATE: el cuerpo de una MV no se puede reemplazar. Se rehace
-- dentro de la misma transacción con las mismas columnas e índices; la función
-- `refresh_ventas_rollup_mensual_mv()` no cambia (referencia el nombre, y el
-- nombre es el mismo).
DROP MATERIALIZED VIEW IF EXISTS ventas_rollup_mensual_mv;

CREATE MATERIALIZED VIEW ventas_rollup_mensual_mv AS
SELECT
  v.empresa_key,
  v.mes,
  EXTRACT(YEAR  FROM v.mes)::int AS anio,
  EXTRACT(MONTH FROM v.mes)::int AS mes_num,
  v.ventas_netas::numeric                                AS ventas_netas,
  COALESCE(c.costo_total, 0)::numeric                    AS costo_total,
  (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS utilidad
FROM switch_ventas_unificado_vw v
LEFT JOIN switch_costo_unificado_v2 c
  ON c.empresa_key = v.empresa_key AND c.mes = v.mes
WITH DATA;

CREATE UNIQUE INDEX ventas_rollup_mensual_mv_pk
  ON ventas_rollup_mensual_mv (empresa_key, mes);

CREATE INDEX ventas_rollup_mensual_mv_anio
  ON ventas_rollup_mensual_mv (empresa_key, anio);

GRANT SELECT ON ventas_rollup_mensual_mv TO service_role;

-- ── 3. El Resumen: mes en curso en vivo, con las ND ─────────────────────────
-- Clon de `ventas_dashboard_summary` (20260725170100) con UN cambio: `costo_cur`
-- suma las ND de `switch_factura_utilidad` del mismo mes. Misma firma, mismo
-- shape de salida.
CREATE OR REPLACE FUNCTION ventas_dashboard_summary_v2(p_anio int)
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
  win AS (
    SELECT
      cur.m                                                                       AS m,
      (cur.m::timestamp AT TIME ZONE 'America/Panama')                            AS ini_utc,
      ((cur.m + interval '1 month')::timestamp AT TIME ZONE 'America/Panama')     AS fin_utc,
      (cur.m + interval '1 month')::date                                          AS fin_date
    FROM cur
    WHERE EXTRACT(YEAR FROM cur.m)::int = p_anio
  ),
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
  -- Costo neto del mes en curso. Misma fórmula que switch_costo_unificado_v2:
  -- artículo diario firmado por tipo (sin el código 'ND') + ND de utilidad.
  costo_cur AS (
    SELECT empresa_key, SUM(costo_total)::numeric AS costo_total
    FROM (
      SELECT
        a.empresa_key,
        SUM(CASE WHEN a.tipo = 'NC' THEN -a.costo_total ELSE a.costo_total END) AS costo_total
      FROM switch_articulo_diario a
      WHERE a.tipo <> 'ND'
        AND a.fecha >= (SELECT w.m        FROM win w)
        AND a.fecha <  (SELECT w.fin_date FROM win w)
      GROUP BY a.empresa_key
      UNION ALL
      SELECT
        u.empresa_key,
        SUM(u.costo) AS costo_total
      FROM switch_factura_utilidad u
      WHERE u.tipo_comprobante = 'Nota de Débito'
        AND u.fecha >= (SELECT w.m        FROM win w)
        AND u.fecha <  (SELECT w.fin_date FROM win w)
      GROUP BY u.empresa_key
    ) x
    GROUP BY empresa_key
  )
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

GRANT EXECUTE ON FUNCTION ventas_dashboard_summary_v2(int) TO service_role;

COMMENT ON FUNCTION ventas_dashboard_summary_v2(int) IS
  'Resumen mensual de /ventas por empresa. Meses cerrados desde ventas_rollup_mensual_mv (sobre switch_costo_unificado_v2); mes en curso en vivo sobre switch_facturas + switch_articulo_diario (sin ND) + las Notas de Debito de switch_factura_utilidad. Reemplaza a ventas_dashboard_summary, cuyo costo del mes en curso excluia las ND.';

-- ── 4. El «vs año anterior», versión 4 ──────────────────────────────────────
-- Clon de `_v3` (20260910120000) con UN cambio: el CTE `dia_costo` ya no lee
-- `switch_costo_diario` ni `ventas_raw`; lee `switch_articulo_diario` (sin el
-- código 'ND') + las ND de `switch_factura_utilidad`, por día de Panamá (las
-- dos tablas guardan `fecha` como DATE local). La rama ELSE (años cerrados,
-- desde la MV) queda BYTE-IDÉNTICA a la de `_v3`.
CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period_v4(p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_hoy               date;
  v_cur_year_now      int;
  v_prev_year         int;
  v_es_parcial        boolean;
  v_cur_mes           int;
  v_cur_inicio        date;
  v_cur_fin_full      date;
  v_prev_mes_inicio   date;
  v_prev_mes_fin_full date;
  v_fecha_corte       date;
  v_dia_corte_prev    date;
  v_mes_actual        int;
  v_rows_json         jsonb;
  v_w_prev_lo         timestamptz;
  v_w_prev_hi         timestamptz;
  v_w_cur_lo          timestamptz;
  v_w_cur_hi          timestamptz;
  -- Ventana del costo del año previo, en fechas locales (las tablas de costo
  -- guardan DATE de Panamá, no timestamptz).
  v_c_prev_lo         date;
  v_c_prev_hi         date;
BEGIN
  v_hoy          := multifashion_hoy_panama();
  v_cur_year_now := EXTRACT(YEAR FROM v_hoy)::int;
  v_prev_year    := p_year - 1;

  SELECT COALESCE(MAX(EXTRACT(MONTH FROM v.mes)::int), 12)
  INTO v_mes_actual
  FROM switch_ventas_unificado_vw v
  WHERE EXTRACT(YEAR FROM v.mes)::int = p_year;

  IF p_year = v_cur_year_now THEN
    v_cur_mes           := EXTRACT(MONTH FROM v_hoy)::int;
    v_cur_inicio        := date_trunc('month', v_hoy::timestamp)::date;
    v_cur_fin_full      := (v_cur_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_mes_inicio   := make_date(v_prev_year, v_cur_mes, 1);
    v_prev_mes_fin_full := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT LEAST(MAX(mf_panama_date(fecha)), v_hoy) INTO v_fecha_corte
    FROM switch_facturas
    WHERE fecha >= (v_cur_inicio::timestamp AT TIME ZONE 'America/Panama')
      AND fecha <  ((v_cur_fin_full + 1)::timestamp AT TIME ZONE 'America/Panama');

    v_es_parcial := (v_fecha_corte IS NOT NULL);

    IF v_es_parcial THEN
      v_dia_corte_prev := LEAST(
        v_prev_mes_inicio + (v_fecha_corte - v_cur_inicio),
        v_prev_mes_fin_full
      );
    END IF;

    v_w_prev_lo := (make_date(v_prev_year, 1, 1) - INTERVAL '1 day')::timestamptz;
    v_w_prev_hi := (v_prev_mes_fin_full + INTERVAL '2 day')::timestamptz;
    v_w_cur_lo  := (v_cur_inicio - INTERVAL '1 day')::timestamptz;
    v_w_cur_hi  := (v_cur_fin_full + INTERVAL '2 day')::timestamptz;

    v_c_prev_lo := make_date(v_prev_year, 1, 1);
    v_c_prev_hi := v_prev_mes_fin_full + 1;   -- exclusivo
  ELSE
    v_es_parcial     := false;
    v_cur_mes        := NULL;
    v_fecha_corte    := NULL;
    v_dia_corte_prev := NULL;
  END IF;

  IF v_es_parcial THEN
    WITH dia_ventas AS (
      SELECT
        empresa_key,
        mf_panama_date(fecha) AS d,
        CASE
          WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
          WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
          ELSE 0
        END AS venta
      FROM switch_facturas
      WHERE fecha >= DATE '2025-05-01'
        AND ( (fecha >= v_w_prev_lo AND fecha < v_w_prev_hi)
           OR (fecha >= v_w_cur_lo  AND fecha < v_w_cur_hi) )
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        subtotal
      FROM ventas_raw
      WHERE fecha < DATE '2025-05-01'
        AND fecha >= (make_date(v_prev_year, 1, 1) - INTERVAL '1 day')
    ),
    dia_costo AS (
      -- 🔴 La MISMA fuente que la MV y que el mes en curso: artículo diario
      -- firmado por tipo (sin el código 'ND') + las ND de utilidad. Nunca
      -- `switch_costo_diario`: su último día de cada mes vale $0 para siempre.
      SELECT empresa_key, fecha AS d,
             CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END AS costo
      FROM switch_articulo_diario
      WHERE tipo <> 'ND'
        AND fecha >= v_c_prev_lo
        AND fecha <  v_c_prev_hi
      UNION ALL
      SELECT empresa_key, fecha AS d, costo
      FROM switch_factura_utilidad
      WHERE tipo_comprobante = 'Nota de Débito'
        AND fecha >= v_c_prev_lo
        AND fecha <  v_c_prev_hi
    ),
    empresa_cuts AS (
      SELECT empresa_key, LEAST(MAX(d), v_hoy) AS e_cur_max
      FROM dia_ventas
      WHERE d BETWEEN v_cur_inicio AND v_cur_fin_full
      GROUP BY empresa_key
    ),
    v_closed AS (
      SELECT empresa_key, EXTRACT(MONTH FROM d)::int AS mes, SUM(venta)::numeric AS venta
      FROM dia_ventas
      WHERE EXTRACT(YEAR FROM d)::int = v_prev_year AND EXTRACT(MONTH FROM d)::int < v_cur_mes
      GROUP BY empresa_key, EXTRACT(MONTH FROM d)::int
    ),
    c_closed AS (
      SELECT empresa_key, EXTRACT(MONTH FROM d)::int AS mes, SUM(costo)::numeric AS costo
      FROM dia_costo
      WHERE EXTRACT(YEAR FROM d)::int = v_prev_year AND EXTRACT(MONTH FROM d)::int < v_cur_mes
      GROUP BY empresa_key, EXTRACT(MONTH FROM d)::int
    ),
    v_current AS (
      SELECT dv.empresa_key, v_cur_mes AS mes, SUM(dv.venta)::numeric AS venta
      FROM dia_ventas dv
      LEFT JOIN empresa_cuts ec ON ec.empresa_key = dv.empresa_key
      WHERE dv.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (COALESCE(ec.e_cur_max, v_fecha_corte) - v_cur_inicio), v_prev_mes_fin_full)
      GROUP BY dv.empresa_key
    ),
    c_current AS (
      SELECT dc.empresa_key, v_cur_mes AS mes, SUM(dc.costo)::numeric AS costo
      FROM dia_costo dc
      LEFT JOIN empresa_cuts ec ON ec.empresa_key = dc.empresa_key
      WHERE dc.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (COALESCE(ec.e_cur_max, v_fecha_corte) - v_cur_inicio), v_prev_mes_fin_full)
      GROUP BY dc.empresa_key
    ),
    merged_v AS (
      SELECT empresa_key, mes, venta FROM v_closed
      UNION ALL SELECT empresa_key, mes, venta FROM v_current
    ),
    merged_c AS (
      SELECT empresa_key, mes, costo FROM c_closed
      UNION ALL SELECT empresa_key, mes, costo FROM c_current
    ),
    final AS (
      SELECT mv.empresa_key, mv.mes, mv.venta, COALESCE(mc.costo, 0) AS costo
      FROM merged_v mv
      LEFT JOIN merged_c mc ON mc.empresa_key = mv.empresa_key AND mc.mes = mv.mes
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'empresa', empresa_key, 'mes', mes,
        'total_subtotal', venta, 'total_costo', costo,
        'total_utilidad', venta - costo, 'total_facturado', venta, 'filas', 0
      ) ORDER BY empresa_key, mes
    ), '[]'::jsonb)
    INTO v_rows_json FROM final;

  ELSE
    -- Ano previo (CERRADO) desde la MV, capado same-period a mes <= v_mes_actual.
    -- (Rama idéntica a la versión vigente — ya es rápida.)
    WITH final AS (
      SELECT
        r.empresa_key,
        r.mes_num AS mes,
        r.ventas_netas AS venta,
        r.costo_total AS costo
      FROM ventas_rollup_mensual_mv r
      WHERE r.anio = v_prev_year
        AND r.mes_num <= v_mes_actual
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'empresa', empresa_key, 'mes', mes,
        'total_subtotal', venta, 'total_costo', costo,
        'total_utilidad', venta - costo, 'total_facturado', venta, 'filas', 0
      ) ORDER BY empresa_key, mes
    ), '[]'::jsonb)
    INTO v_rows_json FROM final;
  END IF;

  RETURN jsonb_build_object(
    'rows',                    v_rows_json,
    'es_periodo_parcial',      v_es_parcial,
    'fecha_corte',             to_char(v_fecha_corte,    'YYYY-MM-DD'),
    'dia_corte_anio_anterior', to_char(v_dia_corte_prev, 'YYYY-MM-DD')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_prev_same_period_v4(int) TO service_role;

-- ── 5. El cuadre: switch_costo_diario contra la fuente del Resumen ──────────
-- Por (empresa, mes) dentro de [p_desde, p_hasta), suma SOLO los días
-- comparables, que son los que cumplen las tres:
--   · NO es el último día del mes: en `switch_costo_diario` vale $0 siempre.
--   · `switch_costo_diario` tiene fila para ese día (un día que el guard de
--     montos rechazó no está, y no tiene con qué compararse).
--   · Esa fila se escribió DESPUÉS de que el día terminara en Panamá
--     (`synced_at >= (fecha + 1) 00:00 Panamá`). Un día leído a media mañana
--     es una foto parcial, no un costo (Boston 30-jul-2026: $40 contra
--     $1.649,64; Switch mandó ese día corrupto al día siguiente y el guard
--     conservó la foto de las 09:01).
-- Devuelve además cuántos días quedaron fuera por cada motivo, para que el
-- aviso pueda decirlo.
CREATE OR REPLACE FUNCTION cuadre_costo_mensual_v1(p_desde date, p_hasta date)
RETURNS TABLE (
  empresa_key text,
  mes date,
  dias_comparados int,
  dias_sin_fila int,
  dias_foto_parcial int,
  costo_diario numeric,
  costo_resumen numeric
)
LANGUAGE sql STABLE AS $$
  WITH dias AS (
    SELECT
      s.empresa_key,
      s.fecha,
      date_trunc('month', s.fecha)::date AS mes,
      s.costo_total,
      -- ¿Se leyó después de que el día terminara en Panamá?
      (s.synced_at >= ((s.fecha + 1)::timestamp AT TIME ZONE 'America/Panama')) AS completo
    FROM switch_costo_diario s
    WHERE s.fecha >= p_desde
      AND s.fecha <  p_hasta
      -- El último día del mes queda fuera SIEMPRE.
      AND s.fecha <> (date_trunc('month', s.fecha) + INTERVAL '1 month - 1 day')::date
  ),
  resumen_dia AS (
    -- La fuente del Resumen, por día: la misma fórmula de switch_costo_unificado_v2.
    SELECT empresa_key, fecha, SUM(costo) AS costo
    FROM (
      SELECT a.empresa_key, a.fecha,
             CASE WHEN a.tipo = 'NC' THEN -a.costo_total ELSE a.costo_total END AS costo
      FROM switch_articulo_diario a
      WHERE a.tipo <> 'ND'
        AND a.fecha >= p_desde AND a.fecha < p_hasta
      UNION ALL
      SELECT u.empresa_key, u.fecha, u.costo
      FROM switch_factura_utilidad u
      WHERE u.tipo_comprobante = 'Nota de Débito'
        AND u.fecha >= p_desde AND u.fecha < p_hasta
    ) x
    GROUP BY empresa_key, fecha
  ),
  -- Días con costo en el Resumen que NO tienen fila en switch_costo_diario
  -- (rechazados por el guard, o el sync de ese día falló). Se cuentan, no se suman.
  sin_fila AS (
    SELECT r.empresa_key, date_trunc('month', r.fecha)::date AS mes, COUNT(*)::int AS n
    FROM resumen_dia r
    LEFT JOIN switch_costo_diario s ON s.empresa_key = r.empresa_key AND s.fecha = r.fecha
    WHERE s.id IS NULL
      AND r.fecha <> (date_trunc('month', r.fecha) + INTERVAL '1 month - 1 day')::date
    GROUP BY 1, 2
  )
  SELECT
    d.empresa_key,
    d.mes,
    COUNT(*) FILTER (WHERE d.completo)::int                                   AS dias_comparados,
    COALESCE(MAX(sf.n), 0)                                                    AS dias_sin_fila,
    COUNT(*) FILTER (WHERE NOT d.completo)::int                               AS dias_foto_parcial,
    COALESCE(SUM(d.costo_total)   FILTER (WHERE d.completo), 0)::numeric      AS costo_diario,
    COALESCE(SUM(r.costo)         FILTER (WHERE d.completo), 0)::numeric      AS costo_resumen
  FROM dias d
  LEFT JOIN resumen_dia r ON r.empresa_key = d.empresa_key AND r.fecha = d.fecha
  LEFT JOIN sin_fila sf   ON sf.empresa_key = d.empresa_key AND sf.mes = d.mes
  GROUP BY d.empresa_key, d.mes
  ORDER BY d.empresa_key, d.mes
$$;

GRANT EXECUTE ON FUNCTION cuadre_costo_mensual_v1(date, date) TO service_role;

COMMENT ON FUNCTION cuadre_costo_mensual_v1(date, date) IS
  'Cuadre mensual de costo: switch_costo_diario (totalventas tipo=03, trae ND) contra la fuente del Resumen (switch_articulo_diario sin ND + ND de switch_factura_utilidad), sumando solo los dias comparables (no el ultimo del mes, con fila, leida despues de cerrar el dia). La decision de avisar (>2 %) vive en src/lib/alertas/cuadre-costo.ts.';

NOTIFY pgrst, 'reload schema';
