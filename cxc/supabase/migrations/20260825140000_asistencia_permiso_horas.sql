-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — LA JUSTIFICACION DE UNAS HORAS (el permiso del que llega tarde)
--
-- Daniel, 25-ago-2026: la justificacion *"gana rango de HORAS (de X a X),
-- ademas del rango de dias. Es para el que llega tarde con permiso
-- justificado."*
--
-- Hasta hoy una justificacion solo sabia decir "este DIA entero esta
-- justificado". Quien tenia turno en el doctor de 8 a 10 y venia a las 10:15
-- no tenia como registrarlo: o se le justificaba el dia completo -y se le
-- perdonaba una jornada que si trabajo- o se le cobraban los 135 minutos.
--
-- ── 🔴 LAS DOS REGLAS, Y ESTAN EN `permiso-horas.ts` ─────────────────────────
--
-- 1. UN PERMISO DE HORAS NO JUSTIFICA EL DIA ENTERO. Perdona la tardanza que
--    cae DENTRO de su ventana y nada mas. Quien tiene permiso de 8 a 10 y NO
--    VINO en todo el dia sigue siendo una ausencia de dia completo: dos horas
--    de permiso no explican no haber venido.
--    🩸 Sin esta regla, cargar "de 8 a 9" borraria el descuento del dia entero
--    -ocho horas de sueldo- y nadie lo veria hasta el dia de pago.
--
-- 2. SOLO CUENTA LO QUE SE SOLAPA CON EL ATRASO DE VERDAD. Un permiso de 2 a 4
--    de la tarde no perdona haber llegado a las 8:45.
--
-- ── ⚠️ LAS DOS HORAS VIAJAN JUNTAS ──────────────────────────────────────────
--
-- Con una sola no hay ventana que cruzar. El CHECK obliga a que esten las dos o
-- ninguna: media ventana seria una regla a medias sobre un pago, y el codigo
-- tendria que inventar la otra mitad.
--
-- Y `hora_hasta > hora_desde`: una ventana al reves -o de duracion cero- no
-- perdona nada. Sin el CHECK, una hora tecleada al reves se guarda y despues
-- hay que adivinar que quiso decir.
--
-- ── ⚠️ NO SE MUEVE UN CENTAVO AL CORRER ESTO ────────────────────────────────
--
-- Las dos columnas nacen en NULL, y las 5 justificaciones vivas de produccion
-- -3 de Incapacidad (48, 7, 43), 1 de trabajo fuera (13) y 1 de Vacaciones
-- (29)- se quedan sin horas, o sea "el dia entero", que es exactamente como se
-- comportan hoy. La regla nueva solo empieza a valer para la primera
-- justificacion que alguien cargue CON horas.
--
-- Aditiva e idempotente: no toca una sola fila existente.
-- ⚠️ La app FUNCIONA SIN ESTA MIGRACION: el GET relee sin las columnas, la
-- pantalla no ofrece las horas y lo dice, y el POST no guarda a medias.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_justificaciones
  ADD COLUMN IF NOT EXISTS hora_desde time,
  ADD COLUMN IF NOT EXISTS hora_hasta time;

COMMENT ON COLUMN asistencia_justificaciones.hora_desde IS
  'Inicio del permiso, dentro de cada dia del rango. NULL = el dia entero esta justificado (lo de siempre). VIAJA JUNTO A hora_hasta.';
COMMENT ON COLUMN asistencia_justificaciones.hora_hasta IS
  'Fin del permiso. Con las dos horas la justificacion NO justifica el dia entero: solo perdona los minutos de tardanza que caen dentro de la ventana, y un dia SIN NINGUNA MARCA sigue siendo ausencia de dia completo.';

DO $ddl$
BEGIN
  -- Las dos, o ninguna. Media ventana no se puede calcular.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_just_horas_completas'
  ) THEN
    ALTER TABLE asistencia_justificaciones
      ADD CONSTRAINT asistencia_just_horas_completas
      CHECK ((hora_desde IS NULL) = (hora_hasta IS NULL));
  END IF;

  -- Una ventana al reves o de duracion cero no perdona nada, y guardarla seria
  -- guardar una regla que despues hay que adivinar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_just_horas_en_orden'
  ) THEN
    ALTER TABLE asistencia_justificaciones
      ADD CONSTRAINT asistencia_just_horas_en_orden
      CHECK (hora_desde IS NULL OR hora_hasta > hora_desde);
  END IF;
END
$ddl$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO le pone horas a ninguna justificacion existente. Las 5 vivas siguen
--      siendo de dia entero, que es lo que son.
--   2. NO toca el motivo de ninguna fila. En particular, la de RODRIGO MIRANDA
--      (codigo 13) sigue diciendo "Trabajo fuera de la oficina" aunque la
--      pantalla ahora ofrezca "Trabajo de vendedor": el codigo reconoce los DOS
--      nombres para siempre (`esTrabajoDeVendedor`), asi que renombrar la fila
--      no compra nada y perderla cuesta una quincena.
--   3. NO agrega un CHECK sobre `motivo`. Sigue siendo texto libre a proposito:
--      los motivos RETIRADOS -Vacaciones, Permiso, Luto, Otro- estan guardados
--      en filas vivas y un CHECK con la lista nueva las volveria invalidas.
-- ─────────────────────────────────────────────────────────────────────────────
