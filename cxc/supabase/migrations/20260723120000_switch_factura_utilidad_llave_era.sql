-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_factura_utilidad — llave a prueba de ERAS de secuenciales
-- (audit de sincronizacion jul-2026).
--
-- PROBLEMA: la tabla upserta por UNIQUE (empresa_key, secuencial), pero Switch
-- REINICIO numeraciones: hay 40 secuenciales duplicados cross-era en
-- switch_facturas (ej. Boston serie 11 doble, fashion_wear 13-000000001 en
-- 2023 y 2026). Un futuro backfill del reporte de utilidad pre-2026
-- COLISIONARIA: el doc viejo pisaria al doc nuevo del mismo secuencial.
--
-- SOLUCION:
--   1) Columna switch_id (id real de la factura en Switch, via join a
--      switch_facturas.switch_factura_id) — identidad estable para joins y
--      auditoria. Poblada aqui via backfill era-aware y por el sync en
--      adelante. Puede quedar null si la factura aun no esta en
--      switch_facturas (timing) — por eso NO es la llave del upsert.
--   2) La llave del upsert pasa a (empresa_key, secuencial, fecha): la fecha
--      del doc separa las eras (verificado 23-jul: 0 pares ambiguos en 1,499
--      docs). Indice unico nuevo + drop del unique viejo.
--
-- El codigo (sync-utilidad.ts) ya esta deployado y es TOLERANTE: intenta la
-- llave nueva y si no existe (42P10/PGRST204) cae a la legacy
-- (empresa_key, secuencial) sin switch_id. Correr esta DDL cuando se pueda;
-- OBLIGATORIA antes de cualquier backfill pre-2026.
--
-- NOTA: el join usa la fecha en zona America/Panama (switch_facturas.fecha es
-- timestamptz UTC; el reporte web da la fecha local — los docs nocturnos
-- difieren un dia en UTC).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Columna del id real de Switch
ALTER TABLE switch_factura_utilidad
  ADD COLUMN IF NOT EXISTS switch_id bigint;

COMMENT ON COLUMN switch_factura_utilidad.switch_id IS
  'Id real de la factura en Switch (switch_facturas.switch_factura_id), resuelto por (empresa, secuencial, fecha Panama). Null si la factura no estaba sincronizada al momento del sync.';

CREATE INDEX IF NOT EXISTS idx_sfu_empresa_switch_id
  ON switch_factura_utilidad (empresa_key, switch_id);

-- 2) Backfill era-aware de switch_id (solo matches inequivocos: n = 1)
WITH candidatos AS (
  SELECT
    f.empresa_key,
    f.secuencial,
    (f.fecha AT TIME ZONE 'America/Panama')::date AS fecha_panama,
    MIN(f.switch_factura_id) AS switch_factura_id,
    COUNT(DISTINCT f.switch_factura_id) AS n
  FROM switch_facturas f
  GROUP BY 1, 2, 3
)
UPDATE switch_factura_utilidad u
SET switch_id = c.switch_factura_id
FROM candidatos c
WHERE u.switch_id IS NULL
  AND c.n = 1
  AND c.empresa_key = u.empresa_key
  AND c.secuencial = u.secuencial
  AND c.fecha_panama = u.fecha;

-- 3) Llave nueva (empresa_key, secuencial, fecha) — separa eras por fecha.
--    Indice unico (PostgREST lo infiere igual que un constraint en el
--    ON CONFLICT del upsert). La data actual ya es unica por (empresa_key,
--    secuencial) → el indice mas fino no puede fallar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sfu_empresa_secuencial_fecha
  ON switch_factura_utilidad (empresa_key, secuencial, fecha);

-- 4) Drop del unique viejo (empresa_key, secuencial) — busca el nombre real
--    del constraint por sus columnas (no asume el nombre por defecto).
DO $do$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.switch_factura_utilidad'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['empresa_key', 'secuencial']
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE switch_factura_utilidad DROP CONSTRAINT %I', v_name);
  END IF;
END
$do$;
