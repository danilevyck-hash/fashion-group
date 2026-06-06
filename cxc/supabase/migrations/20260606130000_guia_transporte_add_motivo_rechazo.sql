-- ─────────────────────────────────────────────────────────────────────────────
-- Migration B (Sprint B grupo 3): guia_transporte.motivo_rechazo
--
-- Contexto: al rechazar una guia, el front (useGuiasState.ts) escribia el motivo
-- en la columna 'observaciones', PISANDO las notas originales de envio. El
-- allowlist del PATCH (api/guias/[id]/route.ts) ya contempla 'motivo_rechazo',
-- pero la columna NO existe en la tabla.
--
-- Gate ejecutado 6 jun 2026 (solo lectura):
--   SELECT motivo_rechazo FROM guia_transporte -> error 42703 "column ... does not exist".
--
-- Cambio: agregar la columna motivo_rechazo (text, nullable). Idempotente.
-- El codigo del rechazo se actualiza en el mismo Sprint para escribir aqui en
-- vez de pisar observaciones. Guias ya rechazadas conservan su motivo en
-- observaciones (no se migran retroactivamente).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS motivo_rechazo text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificacion post-aplicacion:
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'guia_transporte' AND column_name = 'motivo_rechazo';
-- ─────────────────────────────────────────────────────────────────────────────
