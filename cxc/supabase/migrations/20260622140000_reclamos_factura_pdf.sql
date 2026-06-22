-- ─────────────────────────────────────────────────────────────────────────────
-- Reclamos: subida de factura PDF (1 PDF por reclamo) con autocompletado por IA.
--
-- 1. Columna aditiva reclamos.factura_pdf_path (path interno del PDF, 1:1).
-- 2. Bucket de Storage PRIVADO dedicado "reclamo-facturas". Las facturas traen
--    costos → se sirven SOLO con signed URL (nunca público). Todo el acceso es
--    server-side vía service role + signed URLs, así que NO requiere policies de
--    RLS para anon/authenticated (el service role las bypassa).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- Si el INSERT en storage.buckets falla por permisos, crear el bucket a mano
-- (ver nota al pie).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS factura_pdf_path text;

-- Bucket privado para PDFs de factura de reclamos (public = false).
INSERT INTO storage.buckets (id, name, public)
VALUES ('reclamo-facturas', 'reclamo-facturas', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fallback manual (si el INSERT de arriba no corre): Dashboard → Storage →
--   New bucket → Name: "reclamo-facturas" → Public: OFF (privado) → Create.
-- No agregar policies: el acceso es 100% server-side con service role.
-- ─────────────────────────────────────────────────────────────────────────────
