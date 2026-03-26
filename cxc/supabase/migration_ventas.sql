-- TABLE: ventas_mensuales (summary per company/month)
CREATE TABLE IF NOT EXISTS ventas_mensuales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  año integer NOT NULL,
  mes integer NOT NULL CHECK (mes >= 1 AND mes <= 12),
  ventas_brutas numeric(14,2) NOT NULL DEFAULT 0,
  notas_credito numeric(14,2) NOT NULL DEFAULT 0,
  notas_debito numeric(14,2) NOT NULL DEFAULT 0,
  costo_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(empresa, año, mes)
);

-- TABLE: ventas_clientes (top clients per company/month)
CREATE TABLE IF NOT EXISTS ventas_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  año integer NOT NULL,
  mes integer NOT NULL,
  cliente text NOT NULL,
  ventas numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE(empresa, año, mes, cliente)
);

-- TABLE: ventas_metas (monthly targets per company)
CREATE TABLE IF NOT EXISTS ventas_metas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  año integer NOT NULL,
  mes integer NOT NULL,
  meta numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE(empresa, año, mes)
);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_año ON ventas_mensuales(empresa, año);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_año_mes ON ventas_clientes(empresa, año, mes);
