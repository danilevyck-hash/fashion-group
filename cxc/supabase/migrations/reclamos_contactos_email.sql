-- Libreta GLOBAL de contactos de correo para Reclamos.
--
-- Compartida por TODOS los reclamos/proveedores (no está ligada a una empresa):
-- correos frecuentes que se agregan como To/CC al enviar un reclamo al proveedor.
-- Distinta de reclamo_contactos (que es el contacto principal POR proveedor).
--
-- CRUD vía /api/reclamos/contactos-email (admin/secretaria). Sin soft-delete:
-- la libreta es chica y se administra a mano (agregar/editar/eliminar).

CREATE TABLE IF NOT EXISTS contactos_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un correo no se repite en la libreta (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS contactos_email_email_lower_idx
  ON contactos_email (lower(email));

ALTER TABLE contactos_email ENABLE ROW LEVEL SECURITY;

-- Solo service_role (las rutas API corren con service role key). El acceso de
-- usuario se controla en la capa API por rol (requireRole admin/secretaria).
DROP POLICY IF EXISTS service_role_all ON contactos_email;
CREATE POLICY service_role_all ON contactos_email
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
