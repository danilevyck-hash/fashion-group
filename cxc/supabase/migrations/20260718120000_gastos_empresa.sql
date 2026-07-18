-- =============================================================================
-- Gastos de Empresa — gastos operativos mensuales por empresa + saldos bancarios
-- =============================================================================
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- Aditiva e idempotente. DATA INTACTA — CERO DELETE/DROP de objetos existentes.
--
-- 3 tablas nuevas:
--   1. gastos_categorias        — catálogo de categorías (seed 6 + custom),
--                                 es_fijo alimenta el punto de equilibrio.
--   2. empresa_gastos_mensuales — gasto por empresa x mes x categoría.
--                                 empresa_key acepta 'grupo': gastos compartidos
--                                 que se prorratean query-time por % de ventas
--                                 del mes (ventas_rollup_mensual_mv). Sin FK a
--                                 empresas: no existe tabla empresas, keys TEXT
--                                 alineadas con src/lib/empresa-mapping.ts.
--   3. bancos_saldos            — historial de saldos Banco General, 1 cuenta
--                                 por empresa; el KPI Disponibilidad lee el
--                                 último registro por empresa.
--
-- Además: agrega 'gastos-empresa' a role_permissions de contabilidad
-- (la fila DB prevalece sobre roles[] de modules.ts para visibilidad del home).
-- =============================================================================

-- 1. Catálogo de categorías -------------------------------------------------

CREATE TABLE IF NOT EXISTS gastos_categorias (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  orden      int NOT NULL DEFAULT 100,
  -- Fijo vs variable: solo las fijas entran al punto de equilibrio.
  -- Editable por la contable desde la UI.
  es_fijo    boolean NOT NULL DEFAULT true,
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed según el estado de resultados real de la contable (confirmado por Daniel
-- 18-jul-2026). Comisiones de tarjeta es la única variable del seed.
INSERT INTO gastos_categorias (nombre, orden, es_fijo) VALUES
  ('Salarios y planilla',       10, true),
  ('Honorarios profesionales',  20, true),
  ('Gastos generales',          30, true),
  ('Comisiones de tarjeta',     40, false),
  ('Gastos financieros',        50, true),
  ('Otros',                     60, true)
ON CONFLICT (nombre) DO NOTHING;

-- 2. Gastos mensuales por empresa --------------------------------------------

CREATE TABLE IF NOT EXISTS empresa_gastos_mensuales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Las 8 empresas + 'grupo' (gastos compartidos, prorrateo query-time).
  empresa_key    text NOT NULL CHECK (empresa_key IN (
                   'vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes',
                   'active_wear', 'joystep', 'confecciones_boston',
                   'american_classic', 'grupo'
                 )),
  -- Siempre día 1 del mes (bucket mensual).
  mes            date NOT NULL CHECK (mes = date_trunc('month', mes)::date),
  categoria_id   uuid NOT NULL REFERENCES gastos_categorias(id),
  monto          numeric(12,2) NOT NULL CHECK (monto >= 0),
  notas          text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Soft delete estilo mk_facturas.
  anulado_en     timestamptz,
  anulado_motivo text
);

-- Un monto vivo por empresa x mes x categoría (los anulados no bloquean).
-- OJO: índice parcial → la API NO puede usar upsert on_conflict de PostgREST
-- sobre estas columnas; debe hacer select + update/insert por id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_gastos_mensuales_vivo
  ON empresa_gastos_mensuales (empresa_key, mes, categoria_id)
  WHERE anulado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_empresa_gastos_mensuales_mes
  ON empresa_gastos_mensuales (mes);

-- 3. Saldos bancarios (historial) --------------------------------------------

CREATE TABLE IF NOT EXISTS bancos_saldos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Solo las 8 empresas reales (no 'grupo'): 1 cuenta Banco General c/u.
  empresa_key text NOT NULL CHECK (empresa_key IN (
                'vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes',
                'active_wear', 'joystep', 'confecciones_boston',
                'american_classic'
              )),
  saldo       numeric(12,2) NOT NULL,
  -- Fecha a la que corresponde el dato (no la fecha de captura).
  fecha_dato  date NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Constraint completo (no parcial) → la API puede upsert con
  -- on_conflict=empresa_key,fecha_dato para corregir el saldo del mismo día.
  CONSTRAINT uq_bancos_saldos_empresa_fecha UNIQUE (empresa_key, fecha_dato)
);

CREATE INDEX IF NOT EXISTS idx_bancos_saldos_empresa_fecha
  ON bancos_saldos (empresa_key, fecha_dato DESC);

-- 4. RLS: patrón estándar service_role only ----------------------------------

ALTER TABLE gastos_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON gastos_categorias;
CREATE POLICY service_role_all ON gastos_categorias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE empresa_gastos_mensuales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON empresa_gastos_mensuales;
CREATE POLICY service_role_all ON empresa_gastos_mensuales
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE bancos_saldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON bancos_saldos;
CREATE POLICY service_role_all ON bancos_saldos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Permisos: card visible para contabilidad --------------------------------
-- role_permissions.modulos (DB) prevalece sobre roles[] de modules.ts; sin esta
-- fila actualizada la card no aparece en el home de contabilidad.

UPDATE role_permissions
SET modulos = array_append(modulos, 'gastos-empresa')
WHERE role = 'contabilidad'
  AND NOT ('gastos-empresa' = ANY (COALESCE(modulos, '{}')));

-- Refrescar schema cache de PostgREST.
NOTIFY pgrst, 'reload schema';
