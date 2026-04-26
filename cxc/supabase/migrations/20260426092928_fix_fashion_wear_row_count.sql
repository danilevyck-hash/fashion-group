-- Fix: el cleanup de XEXI BOUTIQUE en migración 20260425033006 eliminó 1 fila
-- de cxc_rows pero el header cxc_uploads.row_count quedó desactualizado.
-- Recalcula el row_count para ese upload específico.
-- Idempotente: UPDATE = SELECT COUNT(*) siempre da el mismo resultado.

UPDATE cxc_uploads
SET row_count = (
  SELECT COUNT(*) FROM cxc_rows WHERE upload_id = cxc_uploads.id
)
WHERE id = 'aa3b7a21-a504-4ebb-b879-9765da22a8c2';
