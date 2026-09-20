-- ─────────────────────────────────────────────────────────────────────────────
-- DESHACER LA ÚLTIMA MARCA — DOS MINUTOS (14-sep-2026). ✅ APLICADA (verificado contra producción el 19-sep-2026: las columnas existen)
--
-- Daniel probó el reloj del teléfono desde su iPhone y marcó la SALIDA cinco
-- minutos después de la entrada, por error de dedo. Arreglar eso pedía
-- escribirle a la contadora para que entrara a corregir. Ahora la persona
-- puede deshacer su última marca, y solo dentro de los DOS MINUTOS — él eligió
-- 2 sobre 10 y sobre «hasta la siguiente marca», por esta razón: con una
-- ventana larga alguien podría borrar su entrada a media tarde y volver a
-- marcarla a otra hora, y eso ya no es deshacer un error, es cambiar su hora
-- de llegada.
--
-- ── 🔴 DESHACER NO ES BORRAR ────────────────────────────────────────────────
-- `asistencia_marcaciones` sigue siendo append-only: esta migración NO la toca.
-- La marca deja de contar por una CORRECCIÓN ENCIMA, que es el mecanismo que ya
-- existe desde el 13-ago-2026 (motivo obligatorio, firma de quien la hizo,
-- `anulada_en` para deshacer el deshacer). Lo único que nace es una TERCERA
-- FORMA de corrección, al lado de las dos de siempre:
--
--   1. PISAR la hora de una marcación (hoy).
--   2. AGREGAR la que el reloj nunca registró (hoy).
--   3. QUITAR una marcación: no vale ninguna hora, esa marca no cuenta.
--
-- ── ADITIVA, Y EL CHECK ES MÁS ANCHO, NO MÁS ANGOSTO ────────────────────────
-- `hora` deja de ser NOT NULL: ninguna fila existente deja de ser válida (las
-- 8 correcciones de hoy tienen hora y `quita = false`). El CHECK nuevo ata las
-- dos columnas para que no pueda haber una corrección a medias: o quita una
-- marcación que existe y no trae hora, o trae hora.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_correcciones
  ADD COLUMN IF NOT EXISTS quita boolean NOT NULL DEFAULT false;

ALTER TABLE asistencia_correcciones
  ALTER COLUMN hora DROP NOT NULL;

-- 🔴 Una corrección que QUITA exige `marcacion_id`: no se puede quitar una
-- marcación que el reloj nunca registró. Y no puede traer hora — si la trajera,
-- la mitad del sistema no sabría cuál de las dos cosas manda.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asistencia_correcciones_quita_sin_hora'
  ) THEN
    ALTER TABLE asistencia_correcciones
      ADD CONSTRAINT asistencia_correcciones_quita_sin_hora CHECK (
        (quita IS TRUE  AND hora IS NULL     AND marcacion_id IS NOT NULL)
        OR
        (quita IS FALSE AND hora IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN asistencia_correcciones.quita IS
  'true = esa marcación deja de contar (la persona la deshizo desde su teléfono dentro de los 2 minutos, o la contadora la quitó). La fila de asistencia_marcaciones NO se toca: sigue siendo la prueba de lo que dijo el reloj. Con quita, `hora` va NULL.';
COMMENT ON COLUMN asistencia_correcciones.hora IS
  'La hora que MANDA para el cálculo. NULL solo cuando quita = true: ahí no vale ninguna hora, porque esa marcación no cuenta.';
