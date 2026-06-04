-- ═════════════════════════════════════════════════════════════════════════════
-- Comisiones B2B v2 — tasa GLOBAL por vendedor + universo de vendedores activos
-- ═════════════════════════════════════════════════════════════════════════════
-- Cambios respecto a 20260603010000_comision_b2b_schema.sql:
--   • La tasa deja de ser por empresa y pasa a ser GLOBAL por vendedor
--     (comision_vendedor_tasa). Default 0.50%. Reinaldo (Rey) = 1.00%.
--   • Se muestra a TODOS los vendedores activos de la empresa aunque base=$0
--     (tabla vendedores, sincronizada desde Switch /apivendedor/lista).
--   • Desaparece el estado "sin tasa": todo vendedor activo tiene tasa (default 0.5%).
--   • RPC NUEVO comision_b2b_v2 (nombre nuevo a propósito — Vercel cachea bodies
--     de funciones; nunca CREATE OR REPLACE sobre el mismo nombre).
--
-- NO se dropea comision_tasas todavía: se deprecará tras validar v2 en producción.
-- Joystep NO comisiona — se filtra en el front del tab, no acá.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Maestro de vendedores por empresa (sync desde Switch /apivendedor/lista) ─
CREATE TABLE IF NOT EXISTS vendedores (
  empresa_key text NOT NULL,
  switch_id   bigint,
  nombre      text NOT NULL,
  codigo      text,
  activo      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, nombre)
);

CREATE INDEX IF NOT EXISTS idx_vendedores_nombre ON vendedores (nombre);

GRANT SELECT, INSERT, UPDATE, DELETE ON vendedores TO service_role;

-- ─── 2) Tasa GLOBAL por vendedor ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_vendedor_tasa (
  vendedor_nombre text PRIMARY KEY,          -- nombre TAL COMO viene en el reporte/maestro
  tasa_venta      numeric(6,4) NOT NULL DEFAULT 0.0050,
  tasa_cobro      numeric(6,4) NOT NULL DEFAULT 0,      -- reservado Sprint 2 (comisión sobre cobro)
  activo          boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON comision_vendedor_tasa TO service_role;

-- ─── 3) Seed: migrar nombres existentes de comision_tasas (per-empresa) a global ─
-- Reinaldo → 1.00%; resto → 0.50% (el default). Un mismo nombre en varias empresas
-- colapsa a una sola fila global. NO pisa filas ya existentes.
INSERT INTO comision_vendedor_tasa (vendedor_nombre, tasa_venta, tasa_cobro)
SELECT DISTINCT
  ct.vendedor_nombre,
  CASE WHEN ct.vendedor_nombre ILIKE '%reinaldo%' THEN 0.0100 ELSE 0.0050 END,
  0
FROM comision_tasas ct
WHERE ct.vendedor_nombre IS NOT NULL
  AND TRIM(ct.vendedor_nombre) <> ''
  AND UPPER(TRIM(ct.vendedor_nombre)) <> 'DEFAULT'
ON CONFLICT (vendedor_nombre) DO NOTHING;

-- ─── 4) RPC v2: comisión B2B con universo de vendedores activos + tasa global ──
-- Universo = vendedores activos de la empresa (vendedores.activo ∧ tasa.activo)
--            ∪ cualquier vendedor con ventas en el período (safety: nadie con
--            ventas desaparece del reporte aunque no esté en el maestro).
-- Base: misma regla que comision_b2b (facturas pct_utilidad>20 − todas las NC,
--       exclusiones de clientes internos intactas).
-- Sin NULLs: base=COALESCE(.,0); tasa=COALESCE(.,0.0050); comision=ROUND(base*tasa,2).
CREATE OR REPLACE FUNCTION comision_b2b_v2(p_empresa_key text, p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_rows   jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH ventas AS (
    SELECT
      f.vendedor,
      SUM(
        CASE
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base,
      COUNT(*) FILTER (WHERE f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20) AS facturas_comisionables,
      COUNT(*) FILTER (WHERE f.tipo_comprobante = 'Nota de Crédito') AS notas_credito
    FROM switch_factura_utilidad f
    WHERE f.empresa_key = p_empresa_key
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND f.vendedor IS NOT NULL AND TRIM(f.vendedor) <> ''
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY f.vendedor
  ),
  universo AS (
    -- vendedores activos del maestro de la empresa, con tasa activa
    SELECT v.nombre AS vendedor
    FROM vendedores v
    JOIN comision_vendedor_tasa t
      ON t.vendedor_nombre = v.nombre AND t.activo = true
    WHERE v.empresa_key = p_empresa_key AND v.activo = true
    UNION
    -- safety: cualquiera con ventas en el período (no debe desaparecer del reporte)
    SELECT vt.vendedor FROM ventas vt
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor', u.vendedor,
      'base', ROUND(COALESCE(vt.base, 0), 2),
      'tasa', COALESCE(t.tasa_venta, 0.0050),
      'comision', ROUND(COALESCE(vt.base, 0) * COALESCE(t.tasa_venta, 0.0050), 2),
      'tiene_tasa', true,
      'facturas_comisionables', COALESCE(vt.facturas_comisionables, 0),
      'notas_credito', COALESCE(vt.notas_credito, 0)
    )
    ORDER BY COALESCE(vt.base, 0) DESC, u.vendedor ASC
  )
  INTO v_rows
  FROM universo u
  LEFT JOIN ventas vt ON vt.vendedor = u.vendedor
  -- tasa por nombre (sin filtro activo: un vendedor re-agregado por ventas muestra
  -- su tasa real configurada; si no tiene fila → default 0.5%).
  LEFT JOIN comision_vendedor_tasa t ON t.vendedor_nombre = u.vendedor;

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key,
    'year', p_year,
    'mes', p_mes,
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v2(text, int, int) TO service_role;
