-- ============================================================================
-- Marketing module — gastos compartidos a marcas (Tommy, Calvin, Reebok)
-- ============================================================================
-- Sin RLS: acceso protegido vía API routes con requireRole() + service role key
-- Empresas: TEXT codes alineados con src/lib/companies.ts (no hay tabla empresas)
-- Soft delete: columna anulado_en (timestamp) + anulado_motivo (text)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. mk_marcas — catálogo de marcas (Tommy Hilfiger, Calvin Klein, Reebok)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  empresa_codigo TEXT NOT NULL CHECK (empresa_codigo IN (
    'vistana','fashion_shoes','fashion_wear','active_shoes','active_wear',
    'confecciones_boston','joystep'
  )),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. mk_proyectos — una tienda específica / remodelación
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT,
  tienda TEXT NOT NULL,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre DATE,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','listo_cobrar','cobrado')),
  notas TEXT,
  anulado_en TIMESTAMPTZ,
  anulado_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. mk_proyecto_marcas — N:M con % de reparto (suma debe dar 100)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_proyecto_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES mk_proyectos(id) ON DELETE CASCADE,
  marca_id UUID NOT NULL REFERENCES mk_marcas(id),
  porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  UNIQUE (proyecto_id, marca_id)
);

-- ----------------------------------------------------------------------------
-- 4. mk_facturas — factura de proveedor asociada a un proyecto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES mk_proyectos(id) ON DELETE CASCADE,
  numero_factura TEXT NOT NULL,
  fecha_factura DATE NOT NULL,
  proveedor TEXT NOT NULL,
  concepto TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  itbms NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (itbms >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  anulado_en TIMESTAMPTZ,
  anulado_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. mk_adjuntos — PDFs y fotos (Storage URLs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID REFERENCES mk_proyectos(id) ON DELETE CASCADE,
  factura_id UUID REFERENCES mk_facturas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('pdf_factura','foto_proyecto','foto_factura','otro')),
  url TEXT NOT NULL,
  nombre_original TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (tipo = 'pdf_factura'   AND factura_id IS NOT NULL) OR
    (tipo = 'foto_factura'  AND factura_id IS NOT NULL) OR
    (tipo = 'foto_proyecto' AND proyecto_id IS NOT NULL AND factura_id IS NULL) OR
    (tipo = 'otro')
  )
);

-- ----------------------------------------------------------------------------
-- 6. mk_cobranzas — reclamo de reembolso a la marca
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_cobranzas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  proyecto_id UUID NOT NULL REFERENCES mk_proyectos(id),
  marca_id UUID NOT NULL REFERENCES mk_marcas(id),
  fecha_envio DATE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  email_destino TEXT,
  asunto TEXT,
  cuerpo TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviada','pagada_parcial','pagada','disputada')),
  notas TEXT,
  anulado_en TIMESTAMPTZ,
  anulado_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. mk_pagos — pagos recibidos contra una cobranza
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranza_id UUID NOT NULL REFERENCES mk_cobranzas(id) ON DELETE CASCADE,
  fecha_pago DATE NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  referencia TEXT,
  comprobante_url TEXT,
  notas TEXT,
  anulado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mk_facturas_proyecto
  ON mk_facturas(proyecto_id) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_mk_proyectos_estado
  ON mk_proyectos(estado) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_mk_cobranzas_proyecto
  ON mk_cobranzas(proyecto_id) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_mk_cobranzas_marca
  ON mk_cobranzas(marca_id) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_mk_pagos_cobranza
  ON mk_pagos(cobranza_id) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_mk_adjuntos_proyecto
  ON mk_adjuntos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_mk_adjuntos_factura
  ON mk_adjuntos(factura_id);
CREATE INDEX IF NOT EXISTS idx_mk_proyecto_marcas_marca
  ON mk_proyecto_marcas(marca_id);

-- ----------------------------------------------------------------------------
-- Trigger: validar suma de % de marcas por proyecto (tope 100)
-- El form valida "exactamente 100"; el trigger bloquea >100 para evitar overflow
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mk_validar_porcentajes_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  total_pct NUMERIC;
BEGIN
  SELECT COALESCE(SUM(porcentaje), 0) INTO total_pct
  FROM mk_proyecto_marcas
  WHERE proyecto_id = COALESCE(NEW.proyecto_id, OLD.proyecto_id);

  IF total_pct > 100 THEN
    RAISE EXCEPTION 'La suma de porcentajes de marcas excede 100%% (actual: %)', total_pct;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mk_validar_porcentajes ON mk_proyecto_marcas;
CREATE TRIGGER trg_mk_validar_porcentajes
AFTER INSERT OR UPDATE ON mk_proyecto_marcas
FOR EACH ROW EXECUTE FUNCTION mk_validar_porcentajes_proyecto();

-- ----------------------------------------------------------------------------
-- Trigger: auto-estado de cobranza según suma de pagos vigentes
--   total_pagado >= monto  → 'pagada'
--   0 < total_pagado < monto → 'pagada_parcial'
--   total_pagado = 0 y estaba en pagada/pagada_parcial → 'enviada'
-- No toca 'borrador' ni 'disputada' (estados manuales).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mk_actualizar_estado_cobranza()
RETURNS TRIGGER AS $$
DECLARE
  total_pagado   NUMERIC;
  monto_cobranza NUMERIC;
  estado_actual  TEXT;
  cb_id          UUID;
BEGIN
  cb_id := COALESCE(NEW.cobranza_id, OLD.cobranza_id);

  SELECT COALESCE(SUM(monto), 0) INTO total_pagado
  FROM mk_pagos
  WHERE cobranza_id = cb_id AND anulado_en IS NULL;

  SELECT monto, estado INTO monto_cobranza, estado_actual
  FROM mk_cobranzas WHERE id = cb_id;

  -- No tocar estados manuales
  IF estado_actual IN ('borrador','disputada') THEN
    RETURN NEW;
  END IF;

  IF total_pagado >= monto_cobranza AND monto_cobranza > 0 THEN
    UPDATE mk_cobranzas SET estado = 'pagada', updated_at = NOW() WHERE id = cb_id;
  ELSIF total_pagado > 0 THEN
    UPDATE mk_cobranzas SET estado = 'pagada_parcial', updated_at = NOW() WHERE id = cb_id;
  ELSE
    UPDATE mk_cobranzas SET estado = 'enviada', updated_at = NOW() WHERE id = cb_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mk_actualizar_estado_cobranza ON mk_pagos;
CREATE TRIGGER trg_mk_actualizar_estado_cobranza
AFTER INSERT OR UPDATE OR DELETE ON mk_pagos
FOR EACH ROW EXECUTE FUNCTION mk_actualizar_estado_cobranza();

-- ----------------------------------------------------------------------------
-- Trigger: updated_at en proyectos, facturas, cobranzas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mk_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mk_touch_proyectos ON mk_proyectos;
CREATE TRIGGER trg_mk_touch_proyectos BEFORE UPDATE ON mk_proyectos
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mk_touch_facturas ON mk_facturas;
CREATE TRIGGER trg_mk_touch_facturas BEFORE UPDATE ON mk_facturas
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mk_touch_cobranzas ON mk_cobranzas;
CREATE TRIGGER trg_mk_touch_cobranzas BEFORE UPDATE ON mk_cobranzas
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

-- ============================================================================
-- Seed de marcas iniciales
-- ============================================================================
INSERT INTO mk_marcas (nombre, codigo, empresa_codigo) VALUES
  ('Tommy Hilfiger', 'TH',  'fashion_wear'),
  ('Calvin Klein',   'CK',  'vistana'),
  ('Reebok',         'RBK', 'active_shoes')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================================
-- Storage bucket 'marketing' (privado)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing', 'marketing', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Nota: no se crean policies de Storage porque el repo usa service role key
-- desde el backend para leer/escribir (ver src/lib/supabase-server.ts).
-- El bucket privado bloquea acceso anónimo por default.
