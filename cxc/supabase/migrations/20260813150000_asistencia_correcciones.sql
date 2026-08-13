-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — CORREGIR UNA MARCACIÓN SIN TOCAR LA MARCACIÓN.
--
-- Daniel, textual (13-ago-2026): *"en asistencia- reporte, quiero poder editar
-- el registro de marcacion en caso de caso especial, se puede? o enrreda
-- mucho?"*. Y sobre quién y con qué: *"1. todos pueden corregir. 2. si"* (la
-- razón es obligatoria).
--
-- ── 🔴 LA REGLA QUE NO SE NEGOCIA ───────────────────────────────────────────
--
-- `asistencia_marcaciones` es lo que dijo el reloj, y es LA ÚNICA PRUEBA de a
-- qué hora entró una persona — y eso define un pago. Un UPDATE ahí destruye esa
-- prueba para siempre, y no hay forma de recuperarla: el reloj tiene memoria
-- limitada y los eventos viejos se le caen.
--
-- Por eso la marcación queda INTACTA y la corrección va ENCIMA, en esta tabla.
-- La corrección es la que manda para el cálculo; en pantalla se ven las dos:
--
--     Andrea Pérez · 7 ago
--     Reloj: 8:47:12
--     Corregido a 8:00 — "se le dañó el carro, avisó" — Daniel, 13 ago
--
-- Es el mismo patrón que ya usa el sistema en Guías (el texto que escribió
-- bodega se conserva; encima va el código del cliente, `guia_items.
-- cliente_codigo`) y en Marketing (`mk_proyectos.tienda` + `tienda_codigo`).
--
-- ── EL CASO MÁS COMÚN: LA MARCACIÓN QUE NO EXISTE ───────────────────────────
--
-- Quien OLVIDÓ marcar no tiene registro que corregir. Medido en producción el
-- 13-ago-2026 sobre las 3.894 marcaciones cargadas (1-jul → 13-ago): **231 de
-- 1.020 días-persona están mal marcados (22,6%)**, de los cuales 97 tienen un
-- número IMPAR de marcas (o sea que falta una) y 12 tienen UNA SOLA marca. Y
-- hay 24 días hábiles sin NINGUNA marca y sin justificación. No es un caso
-- raro: es pan de todos los días.
--
-- Por eso `marcacion_id` es NULLABLE: con valor, la corrección PISA la hora de
-- esa marcación; sin valor, AGREGA una marcación que el reloj nunca registró.
--
-- 🔴 Y por eso la marcación agregada va ACÁ y no dentro de
-- `asistencia_marcaciones`: metida allá se mezclaría con lo que dijo el reloj y
-- se perdería la separación que es todo el punto de esta tabla.
--
-- ── DESHACER ────────────────────────────────────────────────────────────────
--
-- Una corrección se ANULA (`anulada_en` / `anulada_por`), nunca se borra. Un
-- botón que no se puede deshacer sobre un dato de pago es una trampa; y una
-- corrección que se deshace SIN dejar rastro es peor que la que nunca existió.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_correcciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qué marcación corrige. NULL = el reloj nunca la registró (olvidó marcar).
  --
  -- 🔴 ON DELETE RESTRICT, no CASCADE: la marcación NO se borra nunca, y esta
  -- llave lo vuelve imposible también desde la base. Con CASCADE, borrar la
  -- marcación se llevaría en silencio la prueba de que alguien la corrigió.
  marcacion_id      uuid REFERENCES asistencia_marcaciones(id) ON DELETE RESTRICT,

  -- Quién. Es el código del reloj (`empleado_codigo`), la misma llave que usa
  -- todo el módulo. Se guarda aunque haya `marcacion_id` porque una corrección
  -- que AGREGA no tiene marcación de dónde sacarlo.
  empleado_codigo   text NOT NULL CHECK (btrim(empleado_codigo) <> ''),

  -- El día-calendario de Panamá (UTC−5 fijo) al que aplica.
  fecha             date NOT NULL,

  -- La hora corregida, al SEGUNDO — el módulo entero mide al segundo desde el
  -- 13-ago-2026 y redondear acá devolvería el redondeo por la puerta de atrás.
  hora              time NOT NULL,

  -- 🔴 OBLIGATORIO, y el CHECK lo exige de verdad: `NOT NULL` deja pasar la
  -- cadena vacía y los espacios, que es exactamente lo que teclea quien quiere
  -- saltarse el campo. Sin razón escrita, dentro de tres meses nadie sabe por
  -- qué esa hora es distinta a la que marcó el reloj.
  motivo            text NOT NULL CHECK (btrim(motivo) <> ''),

  -- LA FIRMA. Daniel decidió que TODOS los roles de Asistencia pueden corregir;
  -- sin esto, "todos pueden" se vuelve "nadie sabe quién fue".
  creada_por        text NOT NULL CHECK (btrim(creada_por) <> ''),
  creada_en         timestamptz NOT NULL DEFAULT now(),

  -- Deshacer. Anulada = vuelve a mandar lo que dijo el reloj (o, si era una
  -- marcación agregada, esa marcación deja de existir para el cálculo).
  anulada_en        timestamptz,
  anulada_por       text,

  -- Una corrección o está entera anulada o no lo está: media anulación (fecha
  -- sin firma, o firma sin fecha) es un rastro que no sirve para nada.
  CONSTRAINT asistencia_correcciones_anulacion_completa CHECK (
    (anulada_en IS NULL AND anulada_por IS NULL)
    OR (anulada_en IS NOT NULL AND btrim(coalesce(anulada_por, '')) <> '')
  )
);

-- 🔑 UNA sola corrección VIVA por marcación. Sin esto, dos correcciones activas
-- de la misma marcación dejarían el cálculo a merced del orden de lectura — o
-- sea, un pago que cambia de un refresco a otro sin que nadie toque nada.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_correcciones_marcacion_uq
  ON asistencia_correcciones (marcacion_id)
  WHERE anulada_en IS NULL AND marcacion_id IS NOT NULL;

-- Para las que AGREGAN: no puede haber dos marcaciones agregadas idénticas
-- (misma persona, mismo día, misma hora). Dos distintas SÍ: quien olvidó marcar
-- la entrada Y la salida necesita las dos.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_correcciones_agregada_uq
  ON asistencia_correcciones (empleado_codigo, fecha, hora)
  WHERE anulada_en IS NULL AND marcacion_id IS NULL;

-- La lectura típica: "las correcciones de este rango de fechas" (reporte y
-- planilla piden exactamente eso).
CREATE INDEX IF NOT EXISTS asistencia_correcciones_fecha_idx
  ON asistencia_correcciones (fecha, empleado_codigo);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo el acceso
-- pasa por el servidor con service_role, igual que el resto del módulo.
ALTER TABLE asistencia_correcciones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_correcciones IS
  'Correcciones de marcaciones. La marcación del reloj NUNCA se edita ni se borra: la corrección va encima y es la que manda para el cálculo de planilla. marcacion_id NULL = marcación que el reloj nunca registró (olvidó marcar). Se anula, no se borra.';

COMMENT ON COLUMN asistencia_correcciones.marcacion_id IS
  'La marcación que se corrige. NULL = se agrega una que el reloj nunca registró.';
COMMENT ON COLUMN asistencia_correcciones.motivo IS
  'Obligatorio. Sin razón escrita, en tres meses nadie sabe por qué esa hora difiere del reloj.';
COMMENT ON COLUMN asistencia_correcciones.anulada_en IS
  'Deshacer deja rastro: la fila queda y el cálculo vuelve a lo que dijo el reloj.';
