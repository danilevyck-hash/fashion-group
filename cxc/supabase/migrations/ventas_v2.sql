CREATE TABLE IF NOT EXISTS ventas_raw (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,
  fecha date NOT NULL,
  mes integer NOT NULL,
  anio integer NOT NULL,
  quarter integer NOT NULL,
  tipo text NOT NULL,
  n_sistema text,
  n_fiscal text,
  vendedor text,
  cliente text,
  costo numeric(12,2),
  descuento numeric(12,2),
  subtotal numeric(12,2),
  itbms numeric(12,2),
  total numeric(12,2),
  utilidad numeric(12,2),
  pct_utilidad numeric(8,4),
  uploaded_by uuid,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_raw_empresa_anio ON ventas_raw(empresa, anio);
CREATE INDEX IF NOT EXISTS idx_ventas_raw_anio_mes ON ventas_raw(anio, mes);
CREATE INDEX IF NOT EXISTS idx_ventas_raw_empresa_anio_mes ON ventas_raw(empresa, anio, mes);

ALTER TABLE ventas_raw ADD CONSTRAINT ventas_raw_unique_factura UNIQUE (n_sistema, empresa);

ALTER TABLE ventas_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON ventas_raw FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ventas_metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_metas" ON ventas_metas FOR ALL USING (true) WITH CHECK (true);
