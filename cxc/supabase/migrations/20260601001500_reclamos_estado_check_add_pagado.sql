-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: reclamos.estado CHECK constraint → permitir 'Pagado'
--
-- Reclamos migró a 3 estados lineales (Borrador → Enviado → Pagado). El código
-- ya escribe 'Pagado', PERO la tabla tiene un CHECK constraint
-- (reclamos_estado_check) que NO lo permite. Verificado empíricamente: hoy el
-- constraint acepta solo {Borrador, Enviado, Rechazado, Aplicada} y rechaza
-- {Confirmado, Aplicado, Pagado}. Sin esta migración, "Marcar como Pagado"
-- falla en producción con: new row violates check constraint "reclamos_estado_check".
--
-- Fix: redefinir el constraint para permitir los 3 estados activos
-- (Borrador, Enviado, Pagado) MÁS los legacy por compatibilidad — no se quita
-- ninguno. Cero data en estados removidos, así que el ADD no falla por filas
-- existentes.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamos DROP CONSTRAINT IF EXISTS reclamos_estado_check;

ALTER TABLE reclamos ADD CONSTRAINT reclamos_estado_check
  CHECK (estado IN (
    'Borrador', 'Enviado', 'Pagado',                 -- activos (pipeline de 3)
    'Confirmado', 'Aplicado', 'Aplicada', 'Rechazado' -- legacy, por compatibilidad
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   -- Debe pasar (devuelve 0 filas si no hay violaciones):
--   SELECT estado, count(*) FROM reclamos GROUP BY estado;
--
--   -- Debe ACEPTAR un update a 'Pagado' (probar en un reclamo de prueba y revertir).
-- ─────────────────────────────────────────────────────────────────────────────
