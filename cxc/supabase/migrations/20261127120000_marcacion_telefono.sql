-- ─────────────────────────────────────────────────────────────────────────────
-- MARCACIÓN — el reloj del teléfono (14-sep-2026). ✅ APLICADA (verificado contra producción el 19-sep-2026: las columnas existen)
--
-- Un reloj más, al lado de los físicos de Boston, Fashion Wear, Vistana y
-- Multifashion: el aparato es el teléfono de quien trabaja afuera (Ana Trejos
-- 2, Cindy De Gracia 3, Yeisibeth Muñoz 306 y Rodrigo Miranda 13). Entra, se
-- toma la selfie, envía, y esa es su marca.
--
-- 🔴 LA MARCA CAE EN LA MISMA TABLA QUE LOS RELOJES FÍSICOS. Daniel: *«el
-- sistema junta todo»*. Así la planilla, el reporte y los Excel la suman sin
-- tocar el cálculo: para el motor es una marca más, la primera del día es la
-- entrada y la última la salida, venga de donde venga. El ORIGEN es el
-- `dispositivo` de siempre (`telefono`), y el `evento_id` lo acuña el
-- teléfono (un uuid) para que un reenvío sin señal no la duplique: la misma
-- llave anti-duplicado `(dispositivo, evento_id)` que protege al reloj.
--
-- 🔴 ADITIVA Y NADA MÁS. `asistencia_marcaciones` es append-only (hay barrido
-- estático que prohíbe update/delete): esta migración AGREGA columnas con
-- default y no toca una sola fila. Las 6.081 marcaciones del reloj quedan con
-- `sin_senal = false` y todo lo demás en NULL, que es exactamente «no vino del
-- teléfono».
--
-- ── LAS DOS HORAS ────────────────────────────────────────────────────────────
-- Daniel: *«que no puedan cambiar la hora de su teléfono»*. Con señal, la hora
-- que cuenta (`ocurrio_en`) es la del SERVIDOR y la del teléfono queda de
-- testigo en `hora_telefono`. Sin señal, `ocurrio_en` es la hora de la foto
-- (la del teléfono, no hay otra) con `sin_senal = true`, y `created_at` —que
-- ya existía— dice cuándo llegó al servidor. Las DOS quedan guardadas: si
-- alguien moviera el reloj de su teléfono, se ve en Asistencia.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_marcaciones
  ADD COLUMN IF NOT EXISTS sin_senal      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_telefono  timestamptz,
  ADD COLUMN IF NOT EXISTS foto_path      text,
  ADD COLUMN IF NOT EXISTS lat            double precision,
  ADD COLUMN IF NOT EXISTS lng            double precision,
  ADD COLUMN IF NOT EXISTS precision_m    real,
  ADD COLUMN IF NOT EXISTS marcada_por    text;

COMMENT ON COLUMN asistencia_marcaciones.sin_senal IS
  'true = la marca se tomó sin internet y el teléfono la mandó después. Ahí `ocurrio_en` es la hora de la foto (la del teléfono) y `created_at` cuándo llegó al servidor. false = `ocurrio_en` es la hora del servidor.';
COMMENT ON COLUMN asistencia_marcaciones.hora_telefono IS
  'La hora que tenía el teléfono al tomar la selfie. Con señal es solo testigo (la que cuenta es la del servidor); sin señal es la que cuenta. NULL en las marcas del reloj físico.';
COMMENT ON COLUMN asistencia_marcaciones.foto_path IS
  'La selfie, en el bucket PRIVADO `asistencia-marcaciones` (<codigo>/<dia>/<evento_id>.jpg). Se firma al leer (1 h) y el ARCHIVO se borra solo a los 90 días; la fila y el path se quedan (append-only).';
COMMENT ON COLUMN asistencia_marcaciones.lat IS 'Dónde estaba el teléfono al marcar (latitud). Obligatoria en las marcas del teléfono.';
COMMENT ON COLUMN asistencia_marcaciones.lng IS 'Dónde estaba el teléfono al marcar (longitud). Obligatoria en las marcas del teléfono.';
COMMENT ON COLUMN asistencia_marcaciones.precision_m IS 'Precisión de la ubicación en metros, como la reporta el teléfono.';
COMMENT ON COLUMN asistencia_marcaciones.marcada_por IS 'El usuario del sistema que mandó la marca (fg_users.name). Auditoría: quién estaba logueado en ese teléfono.';

-- ── EL BUCKET DE LAS SELFIES ─────────────────────────────────────────────────
-- 🔴 PRIVADO, como `asistencia-cedulas` y `reclamo-fotos`: la foto de una
-- persona no se publica en una dirección eterna. Todo el acceso es del lado
-- del servidor, con service role y URL firmada de una hora. SIN policies para
-- `anon` ni `authenticated`, a propósito: la única puerta es
-- `/api/marcacion` (subir) y `/api/asistencia/reporte` (ver, con el módulo).
--
-- ⚠️ NO entra a la réplica off-site de Storage (`STORAGE_REPLICA_BUCKETS`):
-- son archivos con vencimiento de 90 días (Daniel), y la réplica es
-- incremental por manifest — copiaría fotos que acá ya se borraron. Si Daniel
-- quiere que se respalden igual, es una decisión aparte.
insert into storage.buckets (id, name, public)
values ('asistencia-marcaciones', 'asistencia-marcaciones', false)
on conflict (id) do nothing;
