-- Migration: cxc_uploads.parser_version
--
-- Tracking del parser usado para cada upload de detallessaldos. Permite:
--   1. Re-upload idempotente: script de reparación skipea uploads ya
--      migrados a v2 (parser robusto multi-formato).
--   2. Auditoría: distinguir entre filas insertadas con el parser viejo
--      (regex DD-MM-YYYY estricto, dejaba ~38% con fecha NULL) y las
--      del nuevo (acepta DD/MM/YYYY + fallback a n_fiscal).

ALTER TABLE cxc_uploads
  ADD COLUMN IF NOT EXISTS parser_version text NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_cxc_uploads_parser_version
  ON cxc_uploads(parser_version);
