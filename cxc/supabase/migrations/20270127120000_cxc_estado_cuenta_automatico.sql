-- ─────────────────────────────────────────────────────────────────────────────
-- ENVÍO AUTOMÁTICO DEL ESTADO DE CUENTA, CADA LUNES (26-nov-2026, Daniel).
--
-- Una fila por (cliente, semana). La llave ÚNICA es el «a lo sumo una vez»: el
-- cron reserva la fila ANTES de mandar el correo, así que si corre dos veces el
-- mismo lunes la segunda no puede reservar y no manda nada.
--
--   semana     el lunes de esa semana, fecha de Panamá.
--   estado     'enviando' (reservado) · 'enviado' · 'error' (Resend dijo que no:
--              el correo NO salió y la próxima corrida de la misma semana lo
--              reintenta) · 'sin_correo' (no tiene dirección: se deja registro).
--   resend_id  el id que devuelve Resend: el rastro de que el correo salió.
--
-- Aditiva: tabla nueva, sin tocar ninguna otra. RLS solo service_role.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cxc_estado_cuenta_automatico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_codigo text NOT NULL,
  semana        date NOT NULL,
  estado        text NOT NULL CHECK (estado IN ('enviando', 'enviado', 'error', 'sin_correo')),
  cliente_nombre text,
  destinatario  text,
  empresas      text[] NOT NULL DEFAULT '{}',
  saldo         numeric(14, 2),
  resend_id     text,
  detalle       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cxc_estado_cuenta_automatico_una_vez UNIQUE (cliente_codigo, semana)
);

CREATE INDEX IF NOT EXISTS idx_cxc_estado_cuenta_automatico_semana
  ON cxc_estado_cuenta_automatico (semana DESC);

ALTER TABLE cxc_estado_cuenta_automatico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON cxc_estado_cuenta_automatico;
CREATE POLICY service_role_all ON cxc_estado_cuenta_automatico
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
