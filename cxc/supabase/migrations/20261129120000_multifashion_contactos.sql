-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: `multifashion_contactos` — a quién ya le escribió la tienda.
--
-- 🩸 QUÉ PASABA (medido el 16-sep-2026): NO EXISTÍA NINGUNA TABLA donde quedara
-- registrado que se contactó a un cliente de Multifashion. Dos personas de la
-- tienda podían escribirle al mismo cliente el mismo día y ninguna de las dos
-- se enteraba. El CXC del grupo sí lo tenía resuelto desde el 9-jul-2026
-- (`cxc_emails_enviados`), y de ahí se copia el patrón: una fila por envío, el
-- canal, quién lo hizo y cuándo.
--
-- 🔴 EL REGISTRO ES DEL MÓDULO, NO DEL USUARIO. Daniel, 16-sep-2026: «desde la
-- tienda, el ya se escribió debe de ser general por módulo, no por usuario ni
-- nada de eso». Se guarda QUIÉN escribió —un registro sin firma no sirve para
-- nada— pero NINGUNA lectura filtra por usuario: si alguien de la tienda
-- escribe, lo ven todos. Hay candado que lo vigila.
--
-- 🔴 LA IDENTIDAD ES EL CÓDIGO DE SWITCH, NUNCA EL NOMBRE. `cliente_switch_id`
-- es la llave del cliente en `switch_clientes` de `american_classic`. Medido el
-- mismo día: agrupar por nombre junta a TRES personas distintas bajo «JOSE
-- MORALES» y parte en dos al código 425 («rafael rodriguez» y «RAFAEL
-- RODRIGUEZ»). Por eso no hay ninguna columna de nombre acá.
--
-- ⚠️ NO LLEVA `empresa_key`, a propósito: esta tabla es de Multifashion, que ES
-- `american_classic` y es una CONSTANTE del servidor. Una columna de empresa
-- acá invita a que algún día la empresa llegue por la URL, que es justo lo que
-- el candado de acceso del módulo prohíbe.
--
-- El código ya deployado es TOLERANTE a que esta tabla no exista: la pantalla
-- simplemente no dibuja la marca «le escribieron hace N días» y el botón de
-- WhatsApp sigue funcionando. Correr esta DDL cuando se pueda, sin coordinar
-- con el deploy.
--
-- Aplicar con:
--   npm run migrar supabase/migrations/20261129120000_multifashion_contactos.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS multifashion_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El cliente en Switch (`switch_clientes.cliente_switch_id` de
  -- american_classic). Sin FK: `switch_clientes` la reescribe un sync y un
  -- cliente que Switch deje de listar no puede borrar el rastro de que se le
  -- escribió.
  cliente_switch_id integer NOT NULL,
  canal text NOT NULL DEFAULT 'whatsapp',
  -- Quién escribió. Se guarda para poder preguntar, NO para filtrar.
  contactado_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lista CERRADA de canales, igual que en el CXC. Hoy hay uno solo porque hoy
-- hay un solo botón; agregar otro es una decisión de Daniel Y otra migración.
ALTER TABLE multifashion_contactos
  DROP CONSTRAINT IF EXISTS multifashion_contactos_canal_check;

ALTER TABLE multifashion_contactos
  ADD CONSTRAINT multifashion_contactos_canal_check
  CHECK (canal IN ('whatsapp'));

COMMENT ON TABLE multifashion_contactos IS
  'Multifashion - a quien ya le escribio la tienda. Es DEL MODULO, no del usuario: ninguna lectura filtra por contactado_por. La identidad del cliente es cliente_switch_id (el codigo de Switch), nunca el nombre.';

COMMENT ON COLUMN multifashion_contactos.contactado_por IS
  'Quien apreto el boton. Se guarda para poder preguntar; NINGUNA lectura filtra por esta columna (decision de Daniel, 16-sep-2026).';

COMMENT ON COLUMN multifashion_contactos.cliente_switch_id IS
  'switch_clientes.cliente_switch_id de american_classic. Sin FK a proposito: el sync reescribe esa tabla y un cliente que Switch deje de listar no debe borrar el rastro.';

-- La pantalla pregunta «cual fue el ultimo contacto de CADA cliente» en una
-- sola lectura, de la mas nueva a la mas vieja. Sin indice eso es un seq scan
-- sobre una tabla que crece con cada mensaje.
CREATE INDEX IF NOT EXISTS multifashion_contactos_cliente_fecha_idx
  ON multifashion_contactos (cliente_switch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS multifashion_contactos_fecha_idx
  ON multifashion_contactos (created_at DESC);

ALTER TABLE multifashion_contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON multifashion_contactos;
CREATE POLICY service_role_all ON multifashion_contactos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
