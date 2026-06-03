-- ═════════════════════════════════════════════════════════════════════════════
-- Comisiones B2B (mayoreo) sobre venta — esquema + RPC
-- ═════════════════════════════════════════════════════════════════════════════
-- Empresas B2B: vistana, fashion_wear, fashion_shoes, active_shoes, active_wear.
-- NO toca Multifashion (american_classic) ni cobros (eso es Sprint 2 / tasa_cobro).
--
-- Regla de la BASE (validada al centavo contra el Excel oficial de abril 2026):
--   • Solo Facturas + Notas de Crédito.
--   • Facturas comisionan SOLO si porcentajeUtilidad > 20. Las NC NO se filtran
--     por utilidad (todas restan).
--   • Se EXCLUYEN clientes intercompañía/genéricos internos:
--       "Multi Fashion Holding", "VENTAS", "CONTADO".
--   • DEFAULT se reporta como vendedor propio (NO se fusiona con nadie).
--   • base = Σ Facturas(pct>20) − Σ NC, ya excluidos esos clientes.
--   • comisión = base × tasa_venta (de comision_tasas). Vendedor sin tasa →
--     comisión NULL (NO asumir 1%).
--   Validado: FS/Reinaldo abr = 65,051.50 ; FW total abr = 217,793.00
--   (Reinaldo 205,591.00 + DEFAULT 12,202.00, filas separadas).
--
-- Fuente de los datos: tabla cache switch_factura_utilidad, poblada por el sync
-- del reporte web de Switch /reportesventa/facturas (otro scope).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tasas por vendedor + empresa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_tasas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key   text NOT NULL,
  vendedor_nombre text NOT NULL,          -- nombre TAL COMO viene en el reporte web (ej "EDWIN")
  tasa_venta    numeric(6,4) NOT NULL DEFAULT 0,
  tasa_cobro    numeric(6,4) NOT NULL DEFAULT 0,   -- reservado para Sprint 2 (comisión sobre cobro)
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_key, vendedor_nombre)
);

-- Seed: Edwin/vistana 0.5%; resto de vendedores B2B 1% (tasa_cobro = igual).
-- Se siembran SOLO los vendedores cuyo nombre-en-reporte ya conocemos. Los
-- demás se agregan tras el primer sync (o cuando Daniel pase la lista). Un
-- vendedor sin fila acá → comisión NULL en el RPC (no se asume 1%).
INSERT INTO comision_tasas (empresa_key, vendedor_nombre, tasa_venta, tasa_cobro) VALUES
  ('vistana',       'EDWIN',             0.0050, 0.0050),
  ('fashion_wear',  'REINALDO ESPINOSA', 0.0100, 0.0100),
  ('fashion_shoes', 'REINALDO ESPINOSA', 0.0100, 0.0100)
ON CONFLICT (empresa_key, vendedor_nombre) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON comision_tasas TO service_role;

-- ─── 2) Cache de utilidad por documento (poblada por el sync web) ─────────────
CREATE TABLE IF NOT EXISTS switch_factura_utilidad (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key            text NOT NULL,
  secuencial             text NOT NULL,
  fecha                  date,
  tipo_comprobante       text NOT NULL,         -- 'Factura' | 'Nota de Crédito'
  vendedor               text,                  -- nombre tal como viene del reporte (incl. 'DEFAULT')
  cliente                text,
  subtotal_con_descuento numeric(14,4) NOT NULL DEFAULT 0,  -- Facturas +, NC − (sign normalizado por el sync)
  costo                  numeric(14,4) NOT NULL DEFAULT 0,
  utilidad               numeric(14,4) NOT NULL DEFAULT 0,
  pct_utilidad           numeric(8,4),
  synced_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_key, secuencial)
);

CREATE INDEX IF NOT EXISTS idx_sfu_empresa_fecha ON switch_factura_utilidad (empresa_key, fecha);
CREATE INDEX IF NOT EXISTS idx_sfu_empresa_vendedor ON switch_factura_utilidad (empresa_key, vendedor);

GRANT SELECT, INSERT, UPDATE, DELETE ON switch_factura_utilidad TO service_role;

-- ─── 3) RPC: comisión B2B por empresa + período (mes/año) ─────────────────────
-- Devuelve por vendedor: base, tasa aplicada y comisión. Encapsula la regla.
CREATE OR REPLACE FUNCTION comision_b2b(p_empresa_key text, p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_rows   jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH base AS (
    SELECT
      f.vendedor,
      SUM(
        CASE
          -- NC: siempre restan (sin filtro de utilidad). ABS por si el sign varía.
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
          -- Facturas: solo si margen > 20%.
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
      -- Excluir intercompañía + clientes genéricos internos.
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY f.vendedor
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor', b.vendedor,
      'base', ROUND(b.base, 2),
      'tasa', t.tasa_venta,
      'comision', CASE WHEN t.tasa_venta IS NOT NULL THEN ROUND(b.base * t.tasa_venta, 2) ELSE NULL END,
      'tiene_tasa', (t.tasa_venta IS NOT NULL),
      'facturas_comisionables', b.facturas_comisionables,
      'notas_credito', b.notas_credito
    ) ORDER BY b.base DESC
  )
  INTO v_rows
  FROM base b
  LEFT JOIN comision_tasas t
    ON t.empresa_key = p_empresa_key
   AND t.vendedor_nombre = b.vendedor
   AND t.activo = true;

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key,
    'year', p_year,
    'mes', p_mes,
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b(text, int, int) TO service_role;
