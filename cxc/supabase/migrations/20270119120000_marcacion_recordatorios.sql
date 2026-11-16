-- ─────────────────────────────────────────────────────────────────────────────
-- RECORDATORIOS DE MARCACIÓN (16-nov-2026, aprobado por Daniel).
--
-- Tres tablas NUEVAS y vacías. No toca ninguna fila existente.
--   · marcacion_recordatorios      — los 4 interruptores de cada persona
--                                    (0 Entrada · 1 Salida a almuerzo ·
--                                    2 Regreso de almuerzo · 3 Salida).
--   · marcacion_push_suscripciones — los aparatos suscritos a los avisos
--                                    (web push, VAPID). Una fila por aparato.
--   · marcacion_avisos_enviados    — un aviso por persona, marca y día
--                                    (el anti-duplicado).
--
-- Como todas las tablas de Asistencia: RLS prendido y SIN políticas. Solo las
-- lee y escribe el servidor con `service_role`, que pasa por encima de RLS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marcacion_recordatorios (
  empleado_codigo  text        NOT NULL REFERENCES asistencia_personas(empleado_codigo),
  marca            smallint    NOT NULL CHECK (marca BETWEEN 0 AND 3),
  activo           boolean     NOT NULL DEFAULT false,
  hora             time,
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_codigo, marca),
  -- Un recordatorio encendido sin hora no podría avisar nunca.
  CONSTRAINT marcacion_recordatorios_activo_con_hora CHECK (NOT activo OR hora IS NOT NULL)
);

COMMENT ON TABLE marcacion_recordatorios IS
  'Recordatorios de Marcación: por persona y marca del día (0 entrada · 1 salida a almuerzo · '
  '2 regreso · 3 salida), apagados por defecto. Los lee /api/recordatorios-marcacion.';

CREATE TABLE IF NOT EXISTS marcacion_push_suscripciones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_codigo  text        NOT NULL REFERENCES asistencia_personas(empleado_codigo),
  endpoint         text        NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  p256dh           text        NOT NULL,
  auth             text        NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marcacion_push_suscripciones_codigo
  ON marcacion_push_suscripciones (empleado_codigo);

COMMENT ON TABLE marcacion_push_suscripciones IS
  'Aparatos suscritos a los avisos de Marcación (web push). Una fila por endpoint; '
  'si el servicio de avisos contesta 404/410 la suscripción ya no existe y se borra.';

CREATE TABLE IF NOT EXISTS marcacion_avisos_enviados (
  empleado_codigo  text        NOT NULL,
  fecha            date        NOT NULL,
  marca            smallint    NOT NULL CHECK (marca BETWEEN 0 AND 3),
  enviado_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_codigo, fecha, marca)
);

COMMENT ON TABLE marcacion_avisos_enviados IS
  'Bitácora de recordatorios de Marcación ya mandados: uno por persona, marca y día (Panamá).';

ALTER TABLE marcacion_recordatorios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcacion_push_suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcacion_avisos_enviados    ENABLE ROW LEVEL SECURITY;
