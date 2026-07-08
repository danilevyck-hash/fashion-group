-- Migration: Add codigo_barra_id to Reebok products table
-- Correr en el Supabase principal (rspocgqhtpveytgbtler) — products vive ahi
-- (reebokServer cae de fallback al proyecto principal; no hay proyecto separado).
-- Correr ANTES del proximo cron reebok-catalogo (06:45 / 17:00 UTC) o el sync
-- fallaria por columna inexistente una vez deployado este cambio.
-- Persiste el codigoBarraId que devuelve Switch en /apiarticulos/lista
-- (ID interno del codigo de barra, distinto del EAN codigoBarra).
-- El backfill llega solo con la proxima corrida del cron reebok-catalogo.

ALTER TABLE products ADD COLUMN IF NOT EXISTS codigo_barra_id bigint;

-- Sin indice: no hay lookups por codigo_barra_id (solo se persiste desde el sync).
