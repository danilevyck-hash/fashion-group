-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: tabla maestra de clientes
--
-- Lista oficial sale del CSV de Switch Soft (~/data/listaclientes_master.csv).
-- Aplica a las 6 empresas B2B: vistana, fashion_wear, fashion_shoes,
-- active_shoes, active_wear, joystep. NO aplica a confecciones_boston ni
-- american_classic (retail, sin código D-XXX).
--
-- Convivencia: directorio_clientes (32 filas) sigue existiendo porque lo
-- usa el autocomplete de Cheques. Migración de ese módulo va en sprint aparte.
--
-- Match key entre tablas: nombre_normalized (UPPER + remove [.,] + collapse \s).
-- El codigo D-XXX se guarda como referencia, NO es la llave de join.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE clientes_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text,                           -- D-XXX (referencia, no PK)
  nombre text NOT NULL,
  nombre_normalized text NOT NULL,
  razon_social text,
  identificacion text,                   -- RUC + DV combinado con guión
  tipo_cliente text,                     -- Contribuyente | Consumidor Final
  correo text,
  telefono text,
  celular text,
  whatsapp text,
  provincia text,
  distrito text,
  corregimiento text,
  limite_credito numeric,
  fecha_creacion date,
  incluir_en_ventas boolean NOT NULL DEFAULT true,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_clientes_master_normalized
  ON clientes_master(nombre_normalized) WHERE deleted = false;

CREATE INDEX idx_clientes_master_codigo ON clientes_master(codigo);

ALTER TABLE clientes_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON clientes_master FOR ALL TO service_role
  USING (true) WITH CHECK (true);
