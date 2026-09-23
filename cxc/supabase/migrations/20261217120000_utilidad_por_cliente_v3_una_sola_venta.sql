-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: utilidad_por_cliente_v3(p_anio int, p_empresas text[])
-- UNA SOLA VENTA — Ventas › Clientes › Utilidad da la MISMA venta que el Resumen
-- (23-sep-2026).
--
-- 🩸 POR QUÉ EXISTE. La v2 (20260824180000) saca la VENTA de
-- `switch_factura_utilidad`, el reporte de utilidad de Switch, y ese reporte
-- NO LISTA las «Transacciones» (contado). Medido el 23-sep-2026 contra
-- producción, 2026, las 6 del grupo: el hueco entre esta pestaña y el Resumen
-- ES el contado, al centavo, empresa por empresa —vistana 9.132,60 ·
-- fashion_wear 21.476,07 · fashion_shoes 27.426,75 · active_shoes 2.435,20 ·
-- active_wear 3.714,00 · joystep 1.456,23 = 65.640,85— y ninguna pantalla lo
-- decía. Daniel, textual: «Debe de dar igual».
--
-- 🔑 LA VENTA SALE DE `switch_facturas`, LA FUENTE ÚNICA, FIRMADA POR TIPO, con
-- el MISMO CASE que `switch_ventas_unificado_vw` (el Resumen). Ese CASE se
-- GENERA desde `src/lib/ventas/tipos-comprobante.ts` (`sqlVentaFirmada`) y el
-- candado `ventas-una-sola-venta.test.ts` compara el texto de esta migración
-- contra el generado: no hay una segunda definición que se pueda apartar.
--
-- EL COSTO Y LA UTILIDAD siguen saliendo del reporte de utilidad, documento por
-- documento, como en la v2: es la ÚNICA fuente con costo por cliente. Para el
-- contado no hay costo por cliente en Switch, así que:
--   · `total_subtotal`   = la venta ENTERA del cliente (todos los tipos).
--   · `ventas_con_costo` = la parte que el reporte de utilidad cubre.
--   · `total_costo` / `total_utilidad` = las del reporte; NULL si el cliente
--     no tiene ni un documento ahí (solo contado).
--   · `pct_utilidad` = utilidad ÷ ventas_con_costo (el mismo margen de antes:
--     el contado NO lo diluye, porque no se le conoce el costo).
--
-- EL AÑO ES EL DE PANAMÁ, como en el Resumen: `switch_facturas.fecha` es un
-- timestamp UTC y una factura de las 7 p.m. del 31-dic ya es «mañana» en UTC;
-- `switch_factura_utilidad.fecha` es DATE local y se filtra por calendario.
--
-- LA CLAVE DEL CLIENTE es (empresa_key, cliente_switch_id) — la identidad es el
-- CÓDIGO, nunca el nombre —, con el mismo respaldo por nombre normalizado de
-- la v2 para filas sin id (medido: 0 en 2026). Los dos lados se unen con FULL
-- JOIN para que un documento que esté en un solo lado no se pierda en silencio.
-- `codigo` sale de `switch_clientes`: la pantalla reconoce el mostrador
-- (`TCKCTA`) por él.
--
-- ⚠️ ADITIVA: `utilidad_por_cliente_v2` y `utilidad_por_cliente` no se tocan.
-- La app llama a la v3 y, mientras esta migración no corra, cae sola a la v2 y
-- le suma el contado desde `switch_facturas` en el servidor
-- (`una-sola-venta-server.ts` › `contadoDelAnio`): la pantalla da el mismo
-- número antes y después, salvo ±0,01 de redondeo por documento del reporte de
-- utilidad, que la pantalla DICE.
--
-- Aplicar: `npm run migrar supabase/migrations/20261217120000_utilidad_por_cliente_v3_una_sola_venta.sql`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION utilidad_por_cliente_v3(p_anio int, p_empresas text[])
RETURNS TABLE (
  empresa_key text,
  cliente_switch_id int,
  cliente text,
  codigo text,
  n_docs bigint,
  total_subtotal numeric,
  ventas_con_costo numeric,
  total_costo numeric,
  total_utilidad numeric,
  pct_utilidad numeric
)
LANGUAGE sql STABLE AS $fn$
  WITH win AS (
    SELECT
      (make_date(p_anio, 1, 1)::timestamp AT TIME ZONE 'America/Panama')     AS ini_utc,
      (make_date(p_anio + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama') AS fin_utc,
      make_date(p_anio, 1, 1)                                                 AS ini_dia,
      make_date(p_anio + 1, 1, 1)                                             AS fin_dia
  ),
  ventas AS (
    -- La VENTA: switch_facturas, todos los tipos, firmada. El CASE es el
    -- generado por `sqlVentaFirmada('f.subtotal_descuento', 'f.tipo_comprobante')`.
    SELECT
      f.empresa_key,
      COALESCE(f.cliente_switch_id::text, 'nombre:' || upper(btrim(f.cliente_nombre))) AS clave,
      MAX(f.cliente_switch_id) AS cliente_switch_id,
      MAX(f.cliente_nombre)    AS cliente,
      COUNT(*)                 AS n_docs,
      SUM(
        CASE
          WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN f.subtotal_descuento
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.subtotal_descuento
          ELSE 0
        END
      )::numeric AS total_subtotal
    FROM switch_facturas f
    CROSS JOIN win w
    WHERE f.fecha >= w.ini_utc
      AND f.fecha <  w.fin_utc
      AND f.empresa_key = ANY(COALESCE(p_empresas, ARRAY[]::text[]))
    GROUP BY 1, 2
  ),
  costo AS (
    -- El COSTO: el reporte de utilidad, documento por documento. Las NC van
    -- negativas y las ND positivas: SUM() plano netea, sin CASE (como la v2).
    SELECT
      u.empresa_key,
      COALESCE(u.cliente_switch_id::text, 'nombre:' || upper(btrim(u.cliente))) AS clave,
      MAX(u.cliente_switch_id)             AS cliente_switch_id,
      MAX(u.cliente)                       AS cliente,
      SUM(u.subtotal_con_descuento)::numeric AS ventas_con_costo,
      SUM(u.costo)::numeric                  AS total_costo,
      SUM(u.utilidad)::numeric               AS total_utilidad
    FROM switch_factura_utilidad u
    CROSS JOIN win w
    WHERE u.fecha >= w.ini_dia
      AND u.fecha <  w.fin_dia
      AND u.empresa_key = ANY(COALESCE(p_empresas, ARRAY[]::text[]))
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(v.empresa_key, c.empresa_key)             AS empresa_key,
    COALESCE(v.cliente_switch_id, c.cliente_switch_id) AS cliente_switch_id,
    COALESCE(v.cliente, c.cliente)                     AS cliente,
    sc.codigo                                          AS codigo,
    COALESCE(v.n_docs, 0)                              AS n_docs,
    COALESCE(v.total_subtotal, 0)                      AS total_subtotal,
    COALESCE(c.ventas_con_costo, 0)                    AS ventas_con_costo,
    c.total_costo                                      AS total_costo,
    c.total_utilidad                                   AS total_utilidad,
    CASE WHEN c.ventas_con_costo <> 0
         THEN ROUND((c.total_utilidad / c.ventas_con_costo * 100)::numeric, 2)
         ELSE NULL END                                 AS pct_utilidad
  FROM ventas v
  FULL OUTER JOIN costo c
    ON c.empresa_key = v.empresa_key AND c.clave = v.clave
  LEFT JOIN LATERAL (
    SELECT s.codigo
    FROM switch_clientes s
    WHERE s.empresa_key = COALESCE(v.empresa_key, c.empresa_key)
      AND s.cliente_switch_id = COALESCE(v.cliente_switch_id, c.cliente_switch_id)
    ORDER BY s.id::text
    LIMIT 1
  ) sc ON true
  ORDER BY c.total_utilidad DESC NULLS LAST, COALESCE(v.total_subtotal, 0) DESC
$fn$;

GRANT EXECUTE ON FUNCTION utilidad_por_cliente_v3(int, text[]) TO service_role;

COMMENT ON FUNCTION utilidad_por_cliente_v3(int, text[]) IS
  'Ventas > Clientes > Utilidad, UNA SOLA VENTA (23-sep-2026): la venta por cliente sale de switch_facturas firmada por tipo (el mismo CASE del Resumen; incluye el contado), y el costo/utilidad del reporte de utilidad (switch_factura_utilidad), que no lista las Transacciones. Anio de Panama. Aditiva: v2 y v1 siguen vivas.';

NOTIFY pgrst, 'reload schema';
