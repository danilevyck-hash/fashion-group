-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_estadocuenta_aging — signo defensivo (auditoría 🔴-4)
--
-- La versión previa (20260530000000) clasificaba el signo con:
--   WHEN tipo IN ('Nota de Crédito','Recibo','Recibo Saldo Anterior') THEN -saldo
--   ELSE +saldo
-- El ELSE+ es una bomba latente: cualquier tipo_comprobante NUEVO (ej. 'Recibo
-- Electrónico', 'Anticipo') o NULL que aparezca se SUMA como deuda e infla el CXC
-- en silencio.
--
-- Diagnóstico read-only (2026-05-30, 1156 filas): los 8 tipos reales netean
-- $4,519,076.50 = total validado 6/6 al centavo. Signos CORRECTOS hoy; 0 NULLs,
-- 0 tipos inesperados. Este cambio NO altera el total actual — es defensa a futuro.
--
-- ─── DECISIÓN (auditoría): NEUTRAL + ALERTA ──────────────────────────────────
-- 1. Whitelist de CRÉDITO explícita  → -saldo
-- 2. Whitelist de DÉBITO explícita    → +saldo
-- 3. Desconocido o NULL               → 0 (NEUTRAL). Nunca infla CXC con deuda
--    falsa. Si fuera un débito real lo subcuenta, pero (3) se VIGILA:
-- 4. Vista switch_estadocuenta_tipos_sin_clasificar lista los tipos fuera de las
--    whitelists; el check de integridad 'aging_tipos_sin_clasificar' la lee a
--    diario y alerta (critical si tienen saldo<>0) para clasificarlos en <1 día.
--
-- Resto de la vista (JOIN clientes_master, buckets por `dias`, id sintético,
-- HAVING) IDÉNTICO a 20260530000000. Solo cambia el CASE de saldo_signed.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_estadocuenta_aging AS
WITH sec AS (
  SELECT
    s.empresa_key,
    s.cliente_codigo,
    s.cliente_switch_id,
    s.dias,
    s.tipo_comprobante,
    -- Signo defensivo. El API entrega `saldo` como magnitud positiva siempre.
    CASE
      WHEN s.tipo_comprobante IN ('Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior')
        THEN -COALESCE(s.saldo, 0)                              -- crédito (resta)
      WHEN s.tipo_comprobante IN ('Factura', 'Nota de Débito', 'Saldo Anterior', 'Transacción', 'Tiquete')
        THEN  COALESCE(s.saldo, 0)                              -- débito (suma)
      ELSE 0  -- desconocido o NULL: NEUTRAL. Vigilado en switch_estadocuenta_tipos_sin_clasificar.
    END AS saldo_signed
  FROM switch_estadocuenta s
  WHERE COALESCE(s.saldo, 0) <> 0
)
SELECT
  md5(sec.empresa_key || '|' || COALESCE(sec.cliente_codigo, ''))::uuid AS id,
  NULL::uuid                                AS upload_id,
  sec.empresa_key                           AS company_key,
  sec.cliente_codigo                        AS codigo,
  m.id                                      AS cliente_id,
  COALESCE(m.nombre, sec.cliente_codigo)    AS nombre,
  COALESCE(m.nombre_normalized,
           upper(regexp_replace(regexp_replace(COALESCE(sec.cliente_codigo, ''), '[.,]', '', 'g'), '\s+', ' ', 'g')))
                                            AS nombre_normalized,
  COALESCE(m.email, '')                     AS correo,
  COALESCE(m.telefono, '')                  AS telefono,
  COALESCE(m.celular, '')                   AS celular,
  ''::text                                  AS contacto,
  'Panamá'::text                            AS pais,
  COALESCE(m.provincia, '')                 AS provincia,
  ''::text                                  AS distrito,
  ''::text                                  AS corregimiento,
  0::numeric                                AS limite_credito,
  0::numeric                                AS limite_morosidad,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN   0 AND  30), 0) AS d0_30,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  31 AND  60), 0) AS d31_60,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  61 AND  90), 0) AS d61_90,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  91 AND 120), 0) AS d91_120,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 121 AND 180), 0) AS d121_180,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 181 AND 270), 0) AS d181_270,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 271 AND 365), 0) AS d271_365,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias > 365), 0)               AS mas_365,
  COALESCE(SUM(sec.saldo_signed), 0)                                             AS total
FROM sec
LEFT JOIN clientes_master m
  ON m.codigo = sec.cliente_codigo
 AND m.deleted = false
GROUP BY
  sec.empresa_key,
  sec.cliente_codigo,
  sec.cliente_switch_id,
  m.id, m.nombre, m.nombre_normalized,
  m.email, m.telefono, m.celular, m.provincia
HAVING ABS(COALESCE(SUM(sec.saldo_signed), 0)) >= 0.01;

GRANT SELECT ON switch_estadocuenta_aging TO service_role;
GRANT SELECT ON switch_estadocuenta_aging TO authenticated;
GRANT SELECT ON switch_estadocuenta_aging TO anon;

-- ─── Vista de vigilancia: tipos fuera de las whitelists (incl. NULL) ─────────
-- El check de integridad 'aging_tipos_sin_clasificar' la lee a diario. Si
-- aparece algo con saldo<>0, alerta critical (está distorsionando CXC).
CREATE OR REPLACE VIEW switch_estadocuenta_tipos_sin_clasificar AS
SELECT
  empresa_key,
  tipo_comprobante,
  COUNT(*)                                              AS filas,
  COUNT(*) FILTER (WHERE COALESCE(saldo, 0) <> 0)       AS filas_con_saldo,
  COALESCE(SUM(saldo), 0)                               AS suma_saldo
FROM switch_estadocuenta
WHERE tipo_comprobante IS NULL
   OR tipo_comprobante NOT IN (
        'Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior',
        'Factura', 'Nota de Débito', 'Saldo Anterior', 'Transacción', 'Tiquete'
      )
GROUP BY empresa_key, tipo_comprobante;

GRANT SELECT ON switch_estadocuenta_tipos_sin_clasificar TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   -- 1. Total intacto (debe seguir = $4,519,076.50):
--   SELECT ROUND(SUM(total)::numeric, 2) FROM switch_estadocuenta_aging;
--
--   -- 2. Vigilancia vacía hoy (0 filas esperadas):
--   SELECT * FROM switch_estadocuenta_tipos_sin_clasificar;
-- ─────────────────────────────────────────────────────────────────────────────
