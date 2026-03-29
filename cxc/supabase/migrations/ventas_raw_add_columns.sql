ALTER TABLE ventas_raw ADD COLUMN IF NOT EXISTS n_fiscal text;
ALTER TABLE ventas_raw ADD COLUMN IF NOT EXISTS uploaded_by uuid;
