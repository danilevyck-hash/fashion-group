-- CXC — envio real de estado de cuenta multi-empresa por correo.
--
-- 1) fg_users gana nombre_completo + email: se usan para la FIRMA del correo y
--    para reply_to / cc del remitente (el usuario que envia el cobro).
-- 2) cxc_emails_enviados: bitacora de cada envio (a quien, que empresas, quien lo
--    mando, resultado). El insert es best-effort: si falla NO tumba el envio.
--
-- Nota: sin simbolo dolar en comentarios (rompe el dollar-quoting del runner).

ALTER TABLE fg_users
  ADD COLUMN IF NOT EXISTS nombre_completo text,
  ADD COLUMN IF NOT EXISTS email text;

-- Seed de los usuarios que hoy envian cobros. El username en DB es 'Angela' con
-- A mayuscula; 'andrea' y 'daniel' van en minuscula. Comparamos por lower(name)
-- para no depender de esa diferencia de mayusculas.
UPDATE fg_users SET nombre_completo = 'Angela García', email = 'angela@fashiongr.com'
  WHERE lower(name) = 'angela';
UPDATE fg_users SET nombre_completo = 'Andrea Pérez', email = 'andrea@fashiongr.com'
  WHERE lower(name) = 'andrea';
UPDATE fg_users SET nombre_completo = 'Daniel Levy', email = 'daniel@fashiongr.com'
  WHERE lower(name) = 'daniel';

CREATE TABLE IF NOT EXISTS cxc_emails_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_codigo text NOT NULL,
  empresas text[] NOT NULL,
  destinatario text NOT NULL,
  cc text,
  asunto text NOT NULL,
  enviado_por text NOT NULL,
  resultado text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxc_emails_enviados_cliente
  ON cxc_emails_enviados (cliente_codigo, created_at DESC);

ALTER TABLE cxc_emails_enviados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON cxc_emails_enviados;
CREATE POLICY service_role_all ON cxc_emails_enviados
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
