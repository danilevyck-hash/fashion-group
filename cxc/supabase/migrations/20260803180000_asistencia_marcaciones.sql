-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — marcaciones de los relojes Hikvision.
--
-- ── POR QUÉ ESTA TABLA EXISTE Y CÓMO SE LLENA ────────────────────────────────
--
-- Daniel quiere las marcaciones del reloj dentro de fashiongr, "en tiempo real
-- si se puede", y con datos PERFECTOS.
--
-- 🩸 EL CAMINO CORTO NO EXISTE (verificado el 3-ago-2026 contra el equipo real,
-- un DS-K1T804AEF firmware V1.4.1 build 240318). Se revisó `Report Strategy` en
-- iVMS-4200 y solo ofrece "Center Group" + "Main Channel": es el protocolo
-- PROPIO de Hikvision (ISUP/EHome), no un POST a una dirección web. O sea que
-- el reloj NO puede escribirle directo a Vercel. Descartado.
--
-- Entonces el flujo es AL REVÉS: un programa dentro de la oficina le PREGUNTA
-- al reloj por ISAPI y empuja lo que encuentra a `/api/asistencia/ingest`.
--
-- ⚠️ Y PREGUNTAR ES MEJOR QUE RECIBIR, no un premio de consuelo. Si el reloj
-- empujara eventos sería "disparar y olvidar": una caída de internet de 10
-- segundos pierde esa marcación PARA SIEMPRE y nadie se entera. Preguntando, el
-- reloj guarda los eventos en su memoria interna y se le puede pedir un RANGO
-- de fechas — así cualquier hueco se rellena solo en la corrida siguiente. Esa
-- es la única forma de que el dato sea verificable y no solo rápido.
--
-- ── LA LLAVE QUE HACE POSIBLE EL RELLENO ─────────────────────────────────────
-- UNIQUE (dispositivo, evento_id). El `evento_id` es el `serialNo` del propio
-- reloj, único por dispositivo. Con eso, volver a pedir los últimos 7 días
-- todas las noches es INOFENSIVO: lo ya guardado choca contra el índice y se
-- ignora. Sin esta llave, el repaso nocturno duplicaría marcaciones y las horas
-- trabajadas saldrían infladas — el error más caro posible acá.
--
-- ── DOS RELOJES DESDE EL DÍA UNO ─────────────────────────────────────────────
-- Hoy hay uno (Fashion Group). Va a haber un segundo en Multifashion (ACS). Por
-- eso `dispositivo` es parte de la llave y no un campo suelto: dos relojes
-- distintos pueden emitir el mismo `serialNo` sin que eso sea un duplicado.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_marcaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qué reloj la registró. Texto y no enum: agregar el de Multifashion no debe
  -- exigir una migración.
  dispositivo      text NOT NULL,

  -- `serialNo` del evento en el reloj. Es lo que hace idempotente el repaso.
  evento_id        text NOT NULL,

  -- Quién marcó. El código es el que vive en el reloj (employeeNoString); el
  -- nombre se guarda tal como lo devuelve, para no depender de otra tabla para
  -- leer la pantalla.
  empleado_codigo  text,
  empleado_nombre  text,

  -- Cuándo. El reloj manda hora local con offset; se guarda como timestamptz y
  -- se muestra en hora de Panamá (UTC-5 fijo).
  ocurrio_en       timestamptz NOT NULL,

  -- Entrada/salida u otro, según lo reporte el equipo. Puede venir vacío: hay
  -- configuraciones donde el reloj no distingue y el turno se deduce después.
  tipo             text,

  -- El evento crudo, para poder auditar de dónde salió cada fila sin volver a
  -- preguntarle al reloj (y para rescatar campos que hoy no se leen).
  raw              jsonb,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 🔑 La llave del relleno sin duplicados. Ver la nota de arriba.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_marcaciones_evento_uq
  ON asistencia_marcaciones (dispositivo, evento_id);

-- Lectura típica: "las marcaciones de este mes", y "las de este empleado".
CREATE INDEX IF NOT EXISTS asistencia_marcaciones_ocurrio_idx
  ON asistencia_marcaciones (ocurrio_en DESC);
CREATE INDEX IF NOT EXISTS asistencia_marcaciones_empleado_idx
  ON asistencia_marcaciones (empleado_codigo, ocurrio_en DESC);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo el acceso
-- pasa por el servidor con service_role, igual que el resto de las tablas de
-- este sistema.
ALTER TABLE asistencia_marcaciones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_marcaciones IS
  'Marcaciones de los relojes Hikvision. Las empuja un agente local por /api/asistencia/ingest; UNIQUE(dispositivo,evento_id) hace que el repaso nocturno no duplique.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Estado de cada reloj: hasta cuándo se leyó y cuándo se supo de él por última
-- vez. Es lo que permite (a) que el agente sepa desde dónde seguir sin depender
-- de un archivo en la PC —si alguien la formatea, no se pierde el hilo— y
-- (b) avisar si un reloj lleva horas mudo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_dispositivos (
  dispositivo      text PRIMARY KEY,
  nombre           text,
  -- Hasta qué instante se leyó con éxito. El agente arranca desde acá.
  leido_hasta      timestamptz,
  -- Último contacto del agente, haya traído filas o no. Sirve para el vigía:
  -- "trajo 0 marcaciones" y "no contestó" son cosas distintas.
  visto_en         timestamptz,
  ultimo_error     text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asistencia_dispositivos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_dispositivos IS
  'Un renglón por reloj: hasta cuándo se leyó y cuándo se supo de él. El agente lee leido_hasta para saber desde dónde seguir.';
