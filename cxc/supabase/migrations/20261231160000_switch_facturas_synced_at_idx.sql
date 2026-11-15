-- ─────────────────────────────────────────────────────────────────────────────
-- Índice para «Datos al …» de Ventas (velocidad-2026-11). SIN APLICAR: se
-- aplica con el «sí» de Daniel (`npm run migrar`).
--
-- Qué hace: Ventas pregunta «¿cuándo entró la última factura?»
--   SELECT synced_at FROM switch_facturas ORDER BY synced_at DESC LIMIT 1
-- y hoy la base lee las ~58 mil facturas para contestar (no hay índice sobre
-- `synced_at`). Con el índice lee UNA entrada.
--
-- No cambia ningún dato ni ningún número: solo agrega un índice. Se puede quitar
-- con `DROP INDEX IF EXISTS switch_facturas_synced_at_idx;`.
--
-- ⚠️ Sin CONCURRENTLY: `npm run migrar` manda la migración y su registro en UNA
-- llamada (una transacción) y CONCURRENTLY no corre dentro de una. Con ~58 mil
-- filas el índice se arma en menos de un segundo; durante ese instante las
-- escrituras a `switch_facturas` esperan (las lecturas no). Aplicar fuera de la
-- hora de un sync de facturas (no en :50 ni en :00).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS switch_facturas_synced_at_idx
  ON public.switch_facturas (synced_at DESC);
