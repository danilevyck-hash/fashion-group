-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION DESIGN — Sprint 1 Fase 4A: cxc_rows per-invoice + cxc_aging VIEW
-- (2026-05-09)
--
-- Cambia cxc_rows de "una fila por cliente con buckets pre-agregados" a
-- "una fila por documento (factura/NC/ND/saldo anterior/...)".
-- Los buckets de aging (d0_30..mas_365) ahora se calculan en runtime via
-- la VIEW cxc_aging, que mantiene el shape viejo para minimizar cambios
-- en /admin y APIs.
--
-- La tabla está vacía (TRUNCATE en Fase 1), así que DROP/ADD de columnas
-- es trivial. Después de esta migración la tabla queda lista para
-- recibir uploads de detallessaldos_*.csv.
--
-- ORDEN DE EJECUCIÓN (en Supabase Dashboard SQL Editor):
--   PASO 1: drop constraint + RPC viejos que referencian columnas removidas.
--   PASO 2: ALTER schema (drop columnas viejas, rename codigo, add nuevas).
--   PASO 3: CREATE VIEW cxc_aging.
--   PASO 4: actualizar home_dashboard_summary RPC para leer de cxc_aging.
--   PASO 5: verificar.
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 1 — Drop dependencias del schema viejo                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- UNIQUE constraint sobre nombre_normalized — la columna se va, la constraint también.
ALTER TABLE cxc_rows
  DROP CONSTRAINT IF EXISTS cxc_rows_unique_upload_normalized;

-- RPC vieja: el upload nuevo NO la usa (parsea server-side e inserta inline).
DROP FUNCTION IF EXISTS save_cxc_upload(text, text, jsonb);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 2 — ALTER schema                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE cxc_rows
  DROP COLUMN IF EXISTS nombre,
  DROP COLUMN IF EXISTS nombre_normalized,
  DROP COLUMN IF EXISTS correo,
  DROP COLUMN IF EXISTS telefono,
  DROP COLUMN IF EXISTS celular,
  DROP COLUMN IF EXISTS contacto,
  DROP COLUMN IF EXISTS pais,
  DROP COLUMN IF EXISTS provincia,
  DROP COLUMN IF EXISTS distrito,
  DROP COLUMN IF EXISTS corregimiento,
  DROP COLUMN IF EXISTS limite_credito,
  DROP COLUMN IF EXISTS limite_morosidad,
  DROP COLUMN IF EXISTS d0_30,
  DROP COLUMN IF EXISTS d31_60,
  DROP COLUMN IF EXISTS d61_90,
  DROP COLUMN IF EXISTS d91_120,
  DROP COLUMN IF EXISTS d121_180,
  DROP COLUMN IF EXISTS d181_270,
  DROP COLUMN IF EXISTS d271_365,
  DROP COLUMN IF EXISTS mas_365,
  DROP COLUMN IF EXISTS total;

-- Renombrar codigo → cliente_codigo para alinear con ventas_raw.cliente_codigo.
ALTER TABLE cxc_rows RENAME COLUMN codigo TO cliente_codigo;

-- Nuevas columnas per-invoice (todas nullable; CSV puede traer datos faltantes).
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS fecha              date;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS comprobante        text;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS n_sistema          text;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS n_fiscal           text;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS debito             numeric DEFAULT 0;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS credito            numeric DEFAULT 0;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS saldo              numeric DEFAULT 0;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS fecha_vencimiento  date;
ALTER TABLE cxc_rows ADD COLUMN IF NOT EXISTS dias_vencidos      integer;

-- Indexes (cliente_id ya tiene index de la migración de Sprint 0).
CREATE INDEX IF NOT EXISTS idx_cxc_rows_company_key     ON cxc_rows(company_key);
CREATE INDEX IF NOT EXISTS idx_cxc_rows_cliente_codigo  ON cxc_rows(cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_cxc_rows_dias_vencidos   ON cxc_rows(dias_vencidos);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 3 — CREATE VIEW cxc_aging                                            ║
-- ║ Mismo shape que tenía cxc_rows antes (id, codigo, nombre, d0_30..total)   ║
-- ║ + JOIN a clientes_master para datos del cliente. Las queries que          ║
-- ║ leían cxc_rows con select * o columnas de buckets siguen funcionando      ║
-- ║ apuntándolas a cxc_aging.                                                  ║
-- ║                                                                           ║
-- ║ Buckets (d0_30, d31_60, ...) se calculan por DIAS = today - fecha del     ║
-- ║ documento (es lo que Switch reporta en la columna DIAS de detallessaldos).║
-- ║ Net por bucket = SUM(debito - credito), así NCs ofrecen monto negativo y  ║
-- ║ pagos parciales reducen el saldo del bucket correspondiente.              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW cxc_aging AS
SELECT
  -- ID sintético estable para React keys / UI tracking
  md5(r.company_key || '|' || COALESCE(r.cliente_codigo, ''))::uuid AS id,
  NULL::uuid                          AS upload_id,
  r.company_key,
  r.cliente_codigo                    AS codigo,
  r.cliente_id,
  COALESCE(m.nombre, r.cliente_codigo) AS nombre,
  COALESCE(m.nombre_normalized,
           upper(regexp_replace(regexp_replace(r.cliente_codigo, '[.,]', '', 'g'), '\s+', ' ', 'g')))
                                       AS nombre_normalized,
  COALESCE(m.email, '')               AS correo,
  COALESCE(m.telefono, '')            AS telefono,
  COALESCE(m.celular, '')             AS celular,
  ''::text                            AS contacto,
  'Panamá'::text                      AS pais,
  COALESCE(m.provincia, '')           AS provincia,
  ''::text                            AS distrito,
  ''::text                            AS corregimiento,
  0::numeric                          AS limite_credito,
  0::numeric                          AS limite_morosidad,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN   0 AND  30), 0) AS d0_30,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN  31 AND  60), 0) AS d31_60,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN  61 AND  90), 0) AS d61_90,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN  91 AND 120), 0) AS d91_120,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN 121 AND 180), 0) AS d121_180,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN 181 AND 270), 0) AS d181_270,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos BETWEEN 271 AND 365), 0) AS d271_365,
  COALESCE(SUM(r.debito - r.credito) FILTER (WHERE r.dias_vencidos > 365), 0)               AS mas_365,
  COALESCE(SUM(r.debito - r.credito), 0)                                                    AS total
FROM cxc_rows r
LEFT JOIN clientes_master m ON m.id = r.cliente_id AND m.deleted = false
GROUP BY r.company_key, r.cliente_codigo, r.cliente_id,
         m.nombre, m.nombre_normalized, m.email, m.telefono, m.celular, m.provincia
HAVING ABS(COALESCE(SUM(r.debito - r.credito), 0)) >= 0.01;

GRANT SELECT ON cxc_aging TO service_role;
GRANT SELECT ON cxc_aging TO authenticated;
GRANT SELECT ON cxc_aging TO anon;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 4 — Actualizar home_dashboard_summary para leer de cxc_aging         ║
-- ║ Las dos sub-queries que tocaban cxc_rows (cxcTotal, cxcVencida) cambian   ║
-- ║ a cxc_aging. El resto de la función no se toca.                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION home_dashboard_summary(
  p_dias_45 date,
  p_month_start timestamptz,
  p_current_year int,
  p_current_month int,
  p_prev_year int,
  p_prev_month int
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH periodo AS (
    SELECT id, fondo_inicial
    FROM caja_periodos
    WHERE estado = 'abierto'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  caja_gastos_total AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS total
    FROM caja_gastos
    WHERE periodo_id = (SELECT id FROM periodo)
      AND deleted = false
  )
  SELECT jsonb_build_object(
    'reclamosPendientes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada')
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada')
        AND fecha_reclamo < p_dias_45
    ),
    'reclamosResueltosEsteMes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado IN ('Aplicado', 'Aplicada')
        AND updated_at >= p_month_start
    ),
    'guiasEsteMes', (
      SELECT count(*) FROM guia_transporte
      WHERE created_at >= p_month_start
    ),
    'guiasPendientes', (
      SELECT count(*) FROM guia_transporte
      WHERE estado = 'Pendiente Bodega' AND deleted = false
    ),
    'totalClientes', (
      SELECT count(*) FROM directorio_clientes
      WHERE deleted = false
    ),
    'prestamosPendientes', (
      SELECT count(*) FROM prestamos_movimientos
      WHERE estado = 'pendiente_aprobacion'
        AND (deleted IS NULL OR deleted = false)
    ),
    'lastUpload', (
      SELECT uploaded_at FROM cxc_uploads
      ORDER BY uploaded_at DESC LIMIT 1
    ),
    'cxcTotal', COALESCE(
      (SELECT SUM(total) FROM cxc_aging), 0
    )::numeric,
    'cxcVencida', COALESCE(
      (SELECT SUM(COALESCE(d121_180,0) + COALESCE(d181_270,0) + COALESCE(d271_365,0) + COALESCE(mas_365,0)) FROM cxc_aging),
      0
    )::numeric,
    'ventasMes', COALESCE(
      (SELECT SUM(subtotal) FROM ventas_raw WHERE anio = p_current_year AND mes = p_current_month),
      0
    )::numeric,
    'ventasPrev', COALESCE(
      (SELECT SUM(subtotal) FROM ventas_raw WHERE anio = p_prev_year AND mes = p_prev_month),
      0
    )::numeric,
    'cajaPeriodoId', (SELECT id FROM periodo),
    'cajaFondo', (SELECT fondo_inicial FROM periodo),
    'cajaGastosTotal', (SELECT total FROM caja_gastos_total)
  )
$$;

GRANT EXECUTE ON FUNCTION home_dashboard_summary(date, timestamptz, int, int, int, int) TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PASO 5 — Verificación                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Schema de cxc_rows
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cxc_rows'
ORDER BY ordinal_position;
-- Esperado columnas:
--   id, upload_id, company_key, cliente_codigo, cliente_id,
--   fecha, comprobante, n_sistema, n_fiscal,
--   debito, credito, saldo, fecha_vencimiento, dias_vencidos,
--   created_at (si existía)

-- View cxc_aging exists
SELECT 1 FROM information_schema.views WHERE table_name = 'cxc_aging';
-- Esperado: 1 fila

-- View devuelve 0 filas (cxc_rows está vacío)
SELECT COUNT(*) AS aging_rows FROM cxc_aging;
-- Esperado: 0

-- RPC vieja eliminada
SELECT proname FROM pg_proc WHERE proname = 'save_cxc_upload';
-- Esperado: 0 filas
