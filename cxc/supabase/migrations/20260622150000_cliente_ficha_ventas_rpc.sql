-- ─────────────────────────────────────────────────────────────────────────────
-- cliente_ficha_ventas — ventas YTD + última factura por empresa, SERVER-SIDE.
--
-- Reemplaza las dos queries de switch_facturas de la ficha de cliente que NO
-- tenían .limit() y se topaban con el corte silencioso de 1000 filas de Supabase
-- → YTD/última MAL en clientes con mucha historia. (Ej. el bucket "VENTAS"
-- TCKCTA: .in(cids=[1]) traía 27,720 filas → truncado → YTD $1,031 vs $35,727
-- real.) El SUM server-side mata el truncado Y baja el payload (≤6 filas).
--
-- Lógica IDÉNTICA a la ficha (page.tsx), pero scopeada por PAR exacto vía JOIN
-- (no .in(cliente_switch_id)) para no traer facturas de otros clientes que
-- comparten el id numérico por empresa:
--   • Base = total (CON ITBMS), igual que la ficha.
--   • Firma por tipo: Factura/Tiquete/Transacción/Nota de Débito = +; Nota de
--     Crédito = −; otros = 0.
--   • Bucket hora-Panamá (canónico, igual que clientes_anio y las vistas).
--   • ventas_ytd = año en curso (Panamá). ultima_factura = MAX de todas las
--     fechas (tipos de factura), sin filtro de año.
--
-- Usa el índice existente idx_switch_facturas_cliente_switch_id_fecha. Sin DDL
-- de schema/índices. Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cliente_ficha_ventas(p_codigo text)
RETURNS TABLE (
  empresa_key    text,
  ventas_ytd     numeric,
  ultima_factura date
)
LANGUAGE sql STABLE AS $$
  WITH pares AS (
    SELECT empresa_key, cliente_switch_id
    FROM switch_clientes
    WHERE codigo = p_codigo
      AND cliente_switch_id IS NOT NULL
  ),
  fac AS (
    SELECT
      sf.empresa_key,
      sf.tipo_comprobante,
      sf.total,
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
            WHEN f.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN f.total
            WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.total
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
$$;

GRANT EXECUTE ON FUNCTION cliente_ficha_ventas(text) TO service_role;

NOTIFY pgrst, 'reload schema';
