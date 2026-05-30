-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_estadocuenta_aging VIEW (Sprint CXC migración fase 1)
--
-- Reemplaza la fuente del aging del panel CXC: de cxc_aging (que agrega
-- cxc_rows poblado por upload manual de CSV detallessaldos_*.csv) a
-- switch_estadocuenta (snapshot diario del API Switch Soft, validado 6/6
-- contra panel oficial al centavo en commit 126bc44).
--
-- Esta migration SOLO crea la VIEW nueva. NO toca cxc_aging — los 8
-- lectores siguen apuntando a la vieja. La migración de lectores y el
-- decommission de cxc_aging son sprints posteriores.
--
-- ─── DECISIONES SEMÁNTICAS (Opción B — bucketing por edad) ───────────────
--
-- Bucketing: usa el campo `dias` que viene crudo del API
-- (/apicliente/estadocuenta?clienteId=X → element.dias). Switch lo
-- reporta como días desde fecha_creacion, NO como días vencidos del
-- due-date. Esto preserva la semántica de cxc_aging actual al pie de la
-- letra: un d0_30 hoy incluye facturas vigentes con edad <30d aunque
-- todavía no estén vencidas según su plazo de crédito.
--
-- La opción A (días vencidos post-due) queda pendiente para un sprint
-- futuro cuando los plazos por cliente estén disponibles en Switch.
--
-- Saldo neto por cliente (saldo_signed):
--   Factura, Nota de Débito, Saldo Anterior, Transacción, Tiquete →  +saldo
--   Nota de Crédito, Recibo, Recibo Saldo Anterior                 →  -saldo
-- El API ya da `saldo` siempre positivo (magnitud). El signo se aplica
-- por tipo de comprobante. Replica exactamente el net contable usado en
-- la validación 6/6 vs panel (pos − neg).
--
-- JOIN cliente: switch_estadocuenta.cliente_codigo → clientes_master.codigo.
-- Post-seed de huérfanos (D-101, D-199), 116/116 codigos reconcilian (100%).
-- clientes_master no tiene codigos duplicados (verificado), así que el JOIN
-- no rompe el GROUP BY.
--
-- Empresas: switch_estadocuenta solo contiene B2B (vistana, fashion_wear,
-- fashion_shoes, active_shoes, active_wear, joystep — verificado).
-- Retail (Boston, Multifashion) no aplica para CXC y no aparece en la VIEW.
--
-- ─── SHAPE (idéntico a cxc_aging actual) ─────────────────────────────────
--
-- Para que la migración futura de los 8 lectores sea un cambio de 1 línea
-- (.from("cxc_aging") → .from("switch_estadocuenta_aging")), la VIEW
-- expone exactamente las mismas columnas con los mismos tipos.
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
    -- Signo del net por tipo. El API entrega `saldo` como magnitud positiva
    -- siempre; el signo del impacto contable se decide acá.
    CASE
      WHEN s.tipo_comprobante IN ('Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior')
        THEN -COALESCE(s.saldo, 0)
      ELSE COALESCE(s.saldo, 0)
    END AS saldo_signed
  FROM switch_estadocuenta s
  WHERE COALESCE(s.saldo, 0) <> 0
)
SELECT
  -- ID sintético estable (mismo patrón que cxc_aging para React keys)
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

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación (correr cada query manual en SQL Editor):
--
--   -- 1. View existe
--   SELECT 1 FROM information_schema.views WHERE table_name = 'switch_estadocuenta_aging';
--
--   -- 2. Conteo de clientes con saldo abierto por empresa
--   SELECT company_key, COUNT(*) AS clientes, ROUND(SUM(total)::numeric, 2) AS total_neto
--   FROM switch_estadocuenta_aging
--   GROUP BY company_key
--   ORDER BY company_key;
--
--   -- 3. Comparar contra paneles oficiales (commit 126bc44 validó 6/6):
--   --      vistana       $1,090,119
--   --      fashion_wear  $1,720,524
--   --      fashion_shoes $1,004,798
--   --      active_shoes, active_wear, joystep — panel pendiente
-- ─────────────────────────────────────────────────────────────────────────────
