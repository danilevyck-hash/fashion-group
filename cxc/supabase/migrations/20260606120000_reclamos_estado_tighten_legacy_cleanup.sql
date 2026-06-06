-- ─────────────────────────────────────────────────────────────────────────────
-- Migration A (Sprint B grupo 3): reclamos.estado → apretar a 3 estados + default
--
-- Contexto: el pipeline vigente de Reclamos es lineal de 3 estados
-- (Borrador -> Enviado -> Pagado), definido en
-- src/app/reclamos/components/constants.ts (ESTADOS) y VALID_TRANSITIONS.
-- La migracion 20260601001500 dejo el CHECK constraint con 4 estados legacy
-- (Confirmado, Aplicado, Aplicada, Rechazado) "por compatibilidad", y el
-- DEFAULT de la columna quedo en 'Enviado'. Ningun codigo vivo escribe los
-- legacy ni depende del default 'Enviado' (el API POST pasa 'Borrador'
-- explicito).
--
-- Gate de seguridad ejecutado 6 jun 2026 (solo lectura) sobre las 18 filas
-- de reclamos (incluye soft-deleted):
--   Borrador 11 | Enviado 7 | Pagado 0 | Confirmado/Aplicado/Aplicada/Rechazado 0 | NULL 0
-- Cero filas en estados legacy -> apretar el CHECK no falla por filas existentes.
--
-- Cambios:
--   1. Redefinir reclamos_estado_check para aceptar SOLO los 3 estados activos.
--   2. Cambiar el DEFAULT de la columna a 'Borrador' (coincide con el API).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamos DROP CONSTRAINT IF EXISTS reclamos_estado_check;

ALTER TABLE reclamos ADD CONSTRAINT reclamos_estado_check
  CHECK (estado IN ('Borrador', 'Enviado', 'Pagado'));

ALTER TABLE reclamos ALTER COLUMN estado SET DEFAULT 'Borrador';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificacion post-aplicacion:
--
--   -- Conteo por estado (debe seguir siendo solo Borrador/Enviado/Pagado):
--   SELECT estado, count(*) FROM reclamos GROUP BY estado ORDER BY estado;
--
--   -- El default debe ser 'Borrador':
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'reclamos' AND column_name = 'estado';
-- ─────────────────────────────────────────────────────────────────────────────
