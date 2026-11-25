-- ═════════════════════════════════════════════════════════════════════════════
-- Avisos push POR USUARIO (25-nov-2026). Interruptor `MUESTRAS_AVISO_PUSH_2026_11`.
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: «a los que ven muestras vendedores, actívales la notificación para
-- que les llegue cuando bodega las pide».
--
-- Los aparatos de Marcación viven en `marcacion_push_suscripciones`, atados a
-- un COLABORADOR (`asistencia_personas`). Rey y Edwin no marcan: no tienen
-- `empleado_codigo` (medido 25-nov-2026), así que su aparato no cabe ahí. Esta
-- tabla es lo mismo atado al USUARIO del sistema (`fg_users.name`, en minúscula).
--
-- 🔑 SOLO AGREGA: tabla nueva y vacía; no toca ninguna fila existente.
-- Una fila por aparato (`endpoint` único); si el servicio de avisos contesta
-- 404/410 la suscripción ya no existe y se borra. RLS: solo service_role.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_suscripciones_usuario (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario         text        NOT NULL CHECK (usuario = lower(btrim(usuario)) AND usuario <> ''),
  endpoint        text        NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  p256dh          text        NOT NULL,
  auth            text        NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_suscripciones_usuario_usuario
  ON push_suscripciones_usuario (usuario);

COMMENT ON TABLE push_suscripciones_usuario IS
  'Aparatos suscritos a avisos push por USUARIO del sistema (fg_users.name en minúscula). '
  'Hoy: «Muestras pedidas» de Despachos. Una fila por endpoint; 404/410 = se borra.';

ALTER TABLE push_suscripciones_usuario ENABLE ROW LEVEL SECURITY;
