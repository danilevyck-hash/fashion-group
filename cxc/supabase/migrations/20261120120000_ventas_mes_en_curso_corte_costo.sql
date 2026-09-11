-- ─────────────────────────────────────────────────────────────────────────────
-- EL MARGEN DEL MES EN CURSO DEJA DE MEZCLAR LA VENTA DE HOY CON EL COSTO DE
-- AYER (11-sep-2026)
--
-- 🩸 `ventas_dashboard_summary_v2` arma el mes en curso con la venta de
-- `switch_facturas` hasta el instante y el costo de `switch_articulo_diario`,
-- que el cron carga a las 3:40 a.m. y llega hasta AYER. Medido el 11-sep-2026 al
-- mediodía: Vistana $60.956,10 de venta hasta hoy contra $43.548,58 de costo
-- hasta el 10 → margen 28,6 % en pantalla; con el mismo corte en los dos
-- ($56.418,00 hasta el 10) es 22,8 %. El día 1 de cada mes, sin un dólar de
-- costo cargado, el Resumen mostraba margen 100 %.
--
-- Esta RPC devuelve, por empresa, HASTA QUÉ DÍA hay costo cargado en el mes en
-- curso y CUÁNTO se vendió hasta ese día (misma fórmula firmada que la RPC del
-- resumen: FA/TQ/Transacción/ND suman, NC resta). Con eso la app calcula la
-- utilidad y el margen del mes en curso con el mismo corte en los dos lados
-- (`src/lib/ventas/margen-mes-en-curso.ts`) y lo dice en pantalla.
--
-- 🔴 NO TOCA NINGUNA RPC EXISTENTE ni mueve un total de venta: la venta del mes
-- sigue saliendo de `ventas_dashboard_summary_v2` tal cual. Es ADITIVA. Si no
-- corre, la app se comporta exactamente como hoy (la llamada falla y se ignora).
--
-- Un año cerrado (p_anio distinto del año en curso de Panamá) devuelve cero
-- filas: no tiene mes en curso.
--
-- Aplicar: `npm run migrar supabase/migrations/20261120120000_ventas_mes_en_curso_corte_costo.sql`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_mes_en_curso_corte_costo(p_anio int)
RETURNS TABLE (
  empresa text,
  costo_hasta date,
  subtotal_hasta_costo numeric
)
LANGUAGE sql STABLE AS $$
  WITH cur AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Panama'))::date AS m
  ),
  win AS (
    SELECT cur.m AS m, (cur.m + interval '1 month')::date AS fin_date
    FROM cur
    WHERE EXTRACT(YEAR FROM cur.m)::int = p_anio
  ),
  -- Hasta qué día llegó el costo de cada empresa en el mes en curso.
  corte AS (
    SELECT a.empresa_key, MAX(a.fecha) AS costo_hasta
    FROM switch_articulo_diario a, win w
    WHERE a.fecha >= w.m AND a.fecha < w.fin_date
    GROUP BY a.empresa_key
  ),
  -- La venta neta hasta ese día, en día de PANAMÁ (misma fórmula que el resumen).
  hasta AS (
    SELECT f.empresa_key,
           SUM(
             CASE
               WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN f.subtotal_descuento
               WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.subtotal_descuento
               ELSE 0
             END
           )::numeric AS subtotal
    FROM switch_facturas f
    JOIN corte c ON c.empresa_key = f.empresa_key
    CROSS JOIN win w
    WHERE f.fecha >= (w.m::timestamp AT TIME ZONE 'America/Panama')
      AND f.fecha <  ((c.costo_hasta + 1)::timestamp AT TIME ZONE 'America/Panama')
    GROUP BY f.empresa_key
  )
  SELECT c.empresa_key AS empresa,
         c.costo_hasta,
         COALESCE(h.subtotal, 0)::numeric AS subtotal_hasta_costo
  FROM corte c
  LEFT JOIN hasta h ON h.empresa_key = c.empresa_key
  ORDER BY 1
$$;

GRANT EXECUTE ON FUNCTION ventas_mes_en_curso_corte_costo(int) TO service_role;

COMMENT ON FUNCTION ventas_mes_en_curso_corte_costo(int) IS
  'Por empresa, hasta que dia hay costo cargado en el mes en curso (MAX(fecha) de switch_articulo_diario) y la venta neta de switch_facturas hasta ese dia (dia de Panama). La app lo usa para que la utilidad y el margen del mes en curso no mezclen la venta de hoy con el costo de ayer. Aditiva: no toca ninguna RPC existente.';
