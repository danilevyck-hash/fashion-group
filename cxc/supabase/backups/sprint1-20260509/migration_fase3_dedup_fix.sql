-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION FIX — Sprint 1 Fase 3: ventas_raw dedup key  (2026-05-09)
--
-- Switch reusa N.INTERNO entre comprobantes de años distintos. La UNIQUE
-- constraint actual sobre (n_sistema, empresa) descarta filas legítimas.
-- Cambiamos a (empresa, tipo, n_sistema, fecha).
--
-- ORDEN:
--   PASO 1: ver qué constraint existe hoy.
--   PASO 2: limpiar Vistana (rollback) antes de cambiar la constraint —
--           reduce el risk de que datos viejos rompan la creación.
--   PASO 3: drop constraint vieja + create constraint nueva.
--   PASO 4: re-upload via /upload?tab=ventas.
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 1 — Inspeccionar constraints actuales                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'ventas_raw'::regclass
  AND contype IN ('u', 'p')
ORDER BY contype, conname;
-- Esperado: ver la UNIQUE actual (probable nombre: ventas_raw_n_sistema_empresa_key
-- o similar). Anotar el nombre exacto antes de seguir.


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 2 — Rollback de Vistana                                              ║
-- ║ Borra solo Vistana. Las demás empresas conservan lo que ya cargaste.      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DELETE FROM ventas_raw WHERE empresa = 'vistana';

-- Verificar:
SELECT empresa, COUNT(*) AS filas FROM ventas_raw GROUP BY empresa ORDER BY empresa;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 3 — Cambiar la UNIQUE constraint                                     ║
-- ║ Drop la vieja (cualquiera sea su nombre) + crear la nueva.                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  cn text;
BEGIN
  -- Detectar y dropear cualquier UNIQUE existente sobre (n_sistema, empresa)
  FOR cn IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ventas_raw'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(n_sistema, empresa)%'
  LOOP
    EXECUTE format('ALTER TABLE ventas_raw DROP CONSTRAINT %I', cn);
    RAISE NOTICE 'Drop constraint: %', cn;
  END LOOP;
END $$;

-- Por si el unique vivía como índice y no como constraint nombrado
DROP INDEX IF EXISTS ventas_raw_n_sistema_empresa_key;
DROP INDEX IF EXISTS ventas_raw_empresa_n_sistema_key;
DROP INDEX IF EXISTS ventas_raw_n_sistema_empresa_idx;

-- Crear la nueva constraint
ALTER TABLE ventas_raw
  ADD CONSTRAINT ventas_raw_dedup_key
  UNIQUE (empresa, tipo, n_sistema, fecha);

-- Verificar:
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'ventas_raw'::regclass
  AND contype = 'u'
ORDER BY conname;
-- Esperado: ver SOLO ventas_raw_dedup_key UNIQUE (empresa, tipo, n_sistema, fecha)


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 4 — Re-upload de Vistana                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--   1. Esperar el deploy de Vercel del fix de dedup en route.ts
--   2. Ir a /upload?tab=ventas
--   3. Subir listacomprobantes_vistana.csv
--   4. Validar:
--        count       = 4652
--        total_neto  = $6,032,827.43
--        Vistana NC  = 778 (consultar con: SELECT COUNT(*) FROM ventas_raw
--                            WHERE empresa='vistana' AND tipo='Nota de Crédito')
