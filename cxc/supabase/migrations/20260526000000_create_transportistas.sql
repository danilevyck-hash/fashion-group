-- Sprint 1 Guías: tabla canónica de transportistas
-- Reemplaza el texto libre del campo guia_transporte.transportista por una FK.
-- La columna transportista TEXT en guia_transporte se conserva como respaldo
-- hasta Sprint 3.

CREATE TABLE IF NOT EXISTS public.transportistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transportistas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.transportistas;
CREATE POLICY service_role_all
  ON public.transportistas
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
