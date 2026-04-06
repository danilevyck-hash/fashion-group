-- Custom motivos for reclamos (previously stored in localStorage)
CREATE TABLE IF NOT EXISTS reclamo_custom_motivos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  motivo text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
