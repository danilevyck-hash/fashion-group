-- ─────────────────────────────────────────────────────────────────────────────
-- ESTADOS DE CUENTA POR WHATSAPP (27-nov-2026, Daniel aprobó el mockup).
--
-- Los clientes con saldo y SIN correo: el lunes el mismo cron imprime sus PDF de
-- Switch (mismo candado al centavo) y los deja en el bucket PRIVADO
-- `estados-cuenta`; en Cuentas por cobrar la secretaria los manda uno por uno por
-- WhatsApp y queda anotado quién y cuándo.
--
--   pdfs          [{ empresa, total, path }] — los papeles de la semana (fila 'sin_correo').
--   whatsapp_por  quién lo mandó por WhatsApp (nombre de la sesión).
--   whatsapp_en   cuándo. NULL = pendiente.
--
-- Aditiva: tres columnas nuevas y un bucket privado. Ni una fila cambia.
-- Sin policies para anon/authenticated: la única puerta es /api/cxc/whatsapp.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cxc_estado_cuenta_automatico
  ADD COLUMN IF NOT EXISTS pdfs jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_por text,
  ADD COLUMN IF NOT EXISTS whatsapp_en timestamptz;

insert into storage.buckets (id, name, public)
values ('estados-cuenta', 'estados-cuenta', false)
on conflict (id) do nothing;

NOTIFY pgrst, 'reload schema';
