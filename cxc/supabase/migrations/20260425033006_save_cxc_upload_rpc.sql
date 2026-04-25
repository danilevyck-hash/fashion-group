-- Migration: CxC upload server-side atómico
--
-- 1. Cleanup pre-existente: XEXI BOUTIQUE tiene 2 filas con misma normalización
--    pero códigos y saldos distintos (167:$6846.93 + 61:$1386.72). Decisión de
--    Daniel: sumar en una sola fila (total $8,233.65). El UPDATE es idempotente
--    vía EXISTS check de la fila a eliminar.
-- 2. UNIQUE constraint en (upload_id, nombre_normalized) para prevenir
--    proliferación futura de duplicados normalizados.
-- 3. RPC save_cxc_upload() atómica: INSERT header → INSERT rows desde jsonb →
--    DELETE uploads viejos (CASCADE borra sus rows). Reemplaza el flow no-atómico
--    del browser que tenía 3 puntos de fallo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cleanup XEXI BOUTIQUE
-- ─────────────────────────────────────────────────────────────────────────────
-- KEPT:    7b1f29cd-eae5-42a0-aa8e-22ded1222cb8  ('XEXI  BOUTIQUE', codigo=61, d0_30=1386.72)
-- REMOVED: f6609a00-370b-41a1-b06e-8a6b3ddbaa57  ('Xexi  Boutique', codigo=167, d31_60=6846.93)

UPDATE cxc_rows
SET d31_60 = d31_60 + 6846.93,
    total  = total  + 6846.93
WHERE id = '7b1f29cd-eae5-42a0-aa8e-22ded1222cb8'
  AND EXISTS (SELECT 1 FROM cxc_rows WHERE id = 'f6609a00-370b-41a1-b06e-8a6b3ddbaa57');

DELETE FROM cxc_rows WHERE id = 'f6609a00-370b-41a1-b06e-8a6b3ddbaa57';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIQUE constraint
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE cxc_rows
  ADD CONSTRAINT cxc_rows_unique_upload_normalized
  UNIQUE (upload_id, nombre_normalized);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC save_cxc_upload — atómica via plpgsql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_cxc_upload(
  p_company_key text,
  p_filename    text,
  p_rows        jsonb
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  new_upload_id uuid;
  inserted_count int;
BEGIN
  -- 1. INSERT header
  INSERT INTO cxc_uploads (company_key, filename, row_count)
  VALUES (p_company_key, p_filename, jsonb_array_length(p_rows))
  RETURNING id INTO new_upload_id;

  -- 2. INSERT rows desde jsonb array
  INSERT INTO cxc_rows (
    upload_id, company_key,
    codigo, nombre, nombre_normalized,
    correo, telefono, celular, contacto,
    pais, provincia, distrito, corregimiento,
    limite_credito, limite_morosidad,
    d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365,
    total
  )
  SELECT
    new_upload_id,
    p_company_key,
    row->>'codigo',
    row->>'nombre',
    row->>'nombre_normalized',
    row->>'correo',
    row->>'telefono',
    row->>'celular',
    row->>'contacto',
    row->>'pais',
    row->>'provincia',
    row->>'distrito',
    row->>'corregimiento',
    COALESCE((row->>'limite_credito')::numeric,   0),
    COALESCE((row->>'limite_morosidad')::numeric, 0),
    COALESCE((row->>'d0_30')::numeric,    0),
    COALESCE((row->>'d31_60')::numeric,   0),
    COALESCE((row->>'d61_90')::numeric,   0),
    COALESCE((row->>'d91_120')::numeric,  0),
    COALESCE((row->>'d121_180')::numeric, 0),
    COALESCE((row->>'d181_270')::numeric, 0),
    COALESCE((row->>'d271_365')::numeric, 0),
    COALESCE((row->>'mas_365')::numeric,  0),
    COALESCE((row->>'total')::numeric,    0)
  FROM jsonb_array_elements(p_rows) AS row;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- 3. Borrar uploads viejos de la misma empresa (CASCADE elimina sus rows)
  DELETE FROM cxc_uploads
  WHERE company_key = p_company_key
    AND id != new_upload_id;

  RETURN jsonb_build_object('upload_id', new_upload_id, 'count', inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION save_cxc_upload(text, text, jsonb) TO service_role;
