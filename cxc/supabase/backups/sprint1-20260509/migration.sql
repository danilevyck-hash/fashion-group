-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION DESIGN — Sprint 1: clientes_master rebuild  (2026-05-09)
-- ─────────────────────────────────────────────────────────────────────────────
-- DESIGN ONLY — NO EJECUTAR HASTA QUE DANIEL CONFIRME FASE 1.
--
-- Esta migración rehace clientes_master desde cero. La parte sutil es preservar
-- camisetas_pedidos.cliente_id (130 filas con FK a clientes_master.id) que no
-- está en el plan de re-poblar.
--
-- TABLAS CON FK → clientes_master.id (verificadas):
--   ventas_raw.cliente_id        ← se TRUNCATE-CASCADE (intencional, re-pobla Fase 3)
--   cxc_rows.cliente_id          ← se TRUNCATE-CASCADE (intencional, re-pobla Fase 4)
--   camisetas_pedidos.cliente_id ← 130 filas, NO se re-pobla → mitigación abajo
--
-- ORDEN DE EJECUCIÓN:
--   Fase 1 (este archivo, hasta el TRUNCATE+ALTER):  pasos 1–3
--   Fase 2 (después del seed via endpoint):          paso 4 (re-link camisetas)
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 1 — PRE-TRUNCATE: proteger camisetas_pedidos                        ║
-- ║ Correr ANTES del TRUNCATE.                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 1.a. Snapshot del codigo asociado a cada pedido (sobrevive al TRUNCATE)
ALTER TABLE camisetas_pedidos
  ADD COLUMN IF NOT EXISTS _temp_codigo text;

UPDATE camisetas_pedidos cp
SET _temp_codigo = m.codigo
FROM clientes_master m
WHERE cp.cliente_id = m.id;

-- 1.b. Verificación: cuántos pedidos quedaron sin codigo (huérfanos previos)
SELECT
  COUNT(*) FILTER (WHERE _temp_codigo IS NOT NULL) AS con_codigo,
  COUNT(*) FILTER (WHERE _temp_codigo IS NULL)     AS sin_codigo,
  COUNT(*)                                          AS total
FROM camisetas_pedidos
WHERE deleted = false;
-- Reportar este resultado antes de seguir.

-- 1.c. Soltar la FK para que TRUNCATE CASCADE NO borre camisetas_pedidos.
--      Postgres nombra la FK automáticamente como camisetas_pedidos_cliente_id_fkey.
--      Si el nombre real difiere, ajustar antes de correr.
ALTER TABLE camisetas_pedidos
  DROP CONSTRAINT IF EXISTS camisetas_pedidos_cliente_id_fkey;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 2 — TRUNCATE                                                         ║
-- ║ Borra clientes_master + (CASCADE) cxc_rows + ventas_raw.                  ║
-- ║ camisetas_pedidos NO se borra (la FK ya fue soltada).                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

TRUNCATE clientes_master CASCADE;

-- Verificación:
SELECT
  (SELECT COUNT(*) FROM clientes_master)     AS clientes_master,
  (SELECT COUNT(*) FROM cxc_rows)            AS cxc_rows,
  (SELECT COUNT(*) FROM ventas_raw)          AS ventas_raw,
  (SELECT COUNT(*) FROM camisetas_pedidos)   AS camisetas_pedidos;
-- Esperado: 0, 0, 0, 130 (camisetas intactas).


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 3 — ALTER schema sobre tabla vacía                                   ║
-- ║ Schema final (ver README.md o el chat de Daniel).                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 3.a. Drop columnas que ya no se usan
ALTER TABLE clientes_master DROP COLUMN IF EXISTS tipo_cliente;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS whatsapp;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS distrito;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS corregimiento;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS limite_credito;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS fecha_creacion;
ALTER TABLE clientes_master DROP COLUMN IF EXISTS incluir_en_ventas;

-- 3.b. Rename correo → email (alinea con el spec del sprint)
ALTER TABLE clientes_master RENAME COLUMN correo TO email;

-- 3.c. Add columnas nuevas
ALTER TABLE clientes_master ADD COLUMN IF NOT EXISTS dv             text;
ALTER TABLE clientes_master ADD COLUMN IF NOT EXISTS notas          text;
ALTER TABLE clientes_master ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- 3.d. codigo: NOT NULL + UNIQUE (la tabla está vacía → constraints triviales)
ALTER TABLE clientes_master ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE clientes_master
  ADD CONSTRAINT clientes_master_codigo_unique UNIQUE (codigo);

-- 3.e. Reemplazar el unique parcial sobre nombre_normalized por un index plano
--      (el unique key pasa a ser codigo; nombre_normalized queda como ayuda
--       para fallback de matching y búsquedas).
DROP INDEX IF EXISTS idx_clientes_master_normalized;
CREATE INDEX idx_clientes_master_normalized
  ON clientes_master(nombre_normalized);

-- 3.f. Trigger de updated_at (la función set_updated_at() ya existe en la DB,
--      creada por add-updated-at-triggers.sql).
DROP TRIGGER IF EXISTS trg_clientes_master_updated_at ON clientes_master;
CREATE TRIGGER trg_clientes_master_updated_at
  BEFORE UPDATE ON clientes_master
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.g. RLS policy ya existe (service_role_all de la migración original).
--      No se toca.

-- ─── PARAR ACÁ. Pasar a Fase 2: seed via /api/admin/seed-clientes-master ───


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 4 — POST-SEED: re-vincular camisetas_pedidos                         ║
-- ║ Correr DESPUÉS del seed de Fase 2 (cuando clientes_master = 135).         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 4.a. Re-asignar cliente_id usando el codigo guardado en el snapshot
UPDATE camisetas_pedidos cp
SET cliente_id = m.id
FROM clientes_master m
WHERE cp._temp_codigo IS NOT NULL
  AND cp._temp_codigo = m.codigo;

-- 4.b. Verificar huérfanos (codigos que ya no existen en el master nuevo)
SELECT
  COUNT(*) FILTER (WHERE _temp_codigo IS NOT NULL AND cliente_id IS NULL) AS huerfanos,
  COUNT(*) FILTER (WHERE cliente_id IS NOT NULL)                          AS revinculados,
  COUNT(*)                                                                 AS total
FROM camisetas_pedidos
WHERE deleted = false;
-- Si huerfanos > 0: investigar qué codigos antiguos no están en Switch hoy.

-- 4.c. Re-crear FK
ALTER TABLE camisetas_pedidos
  ADD CONSTRAINT camisetas_pedidos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes_master(id);

-- 4.d. Drop columna temporal
ALTER TABLE camisetas_pedidos DROP COLUMN _temp_codigo;
