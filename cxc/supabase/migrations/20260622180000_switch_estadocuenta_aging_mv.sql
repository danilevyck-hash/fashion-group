-- ─────────────────────────────────────────────────────────────────────────────
-- CXC aging — MATERIALIZED VIEW (Causa 1-B del audit de performance).
--
-- switch_estadocuenta_aging es una VIEW no materializada que se recalcula en CADA
-- carga de CXC (la página interna más usada): seq-scan de switch_estadocuenta
-- WHERE saldo<>0 → firma cada fila → LEFT JOIN clientes_master → 8 SUM FILTER por
-- bucket → GROUP BY. Esta MV la precalcula y la refresca el cron junto a las MVs
-- de /ventas (patrón ventas_rollup_mensual_mv).
--
-- La MV devuelve EXACTAMENTE las mismas filas/columnas que la view (definición
-- copiada verbatim de 20260530000300_switch_estadocuenta_aging_signo_defensivo)
-- + UNA columna extra de metadato: materializado_en = now() al refrescar, para
-- mostrar la frescura real (cuándo se materializó) en CXC. Es cambio de
-- performance, NO de datos: los buckets y totales son idénticos.
--
-- NO se borra la view switch_estadocuenta_aging (queda como fallback en vivo si
-- la MV aún no existe). Aditiva, no destructiva.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- CREATE ... AS la puebla de inmediato (WITH DATA por defecto) → no requiere un
-- REFRESH inicial manual; el cron la mantiene fresca a diario.
CREATE MATERIALIZED VIEW IF NOT EXISTS switch_estadocuenta_aging_mv AS
SELECT v.*, now() AS materializado_en
FROM (
  WITH sec AS (
    SELECT
      s.empresa_key,
      s.cliente_codigo,
      s.cliente_switch_id,
      s.dias,
      s.tipo_comprobante,
      CASE
        WHEN s.tipo_comprobante IN ('Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior')
          THEN -COALESCE(s.saldo, 0)
        WHEN s.tipo_comprobante IN ('Factura', 'Nota de Débito', 'Saldo Anterior', 'Transacción', 'Tiquete')
          THEN  COALESCE(s.saldo, 0)
        ELSE 0
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
  HAVING ABS(COALESCE(SUM(sec.saldo_signed), 0)) >= 0.01
) v;

-- Unique index para REFRESH ... CONCURRENTLY. `id` = md5(empresa_key|cliente_codigo)
-- es único por fila (verificado: 242/242 filas, 0 NULL codigos). Si algún día un
-- (empresa_key, cliente_codigo) se partiera en >1 cliente_switch_id, el REFRESH
-- fallaría ruidosamente (señal de anomalía) — la view actual ya tendría ids dup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_estadocuenta_aging_mv_id
  ON switch_estadocuenta_aging_mv (id);

GRANT SELECT ON switch_estadocuenta_aging_mv TO service_role;
GRANT SELECT ON switch_estadocuenta_aging_mv TO authenticated;
GRANT SELECT ON switch_estadocuenta_aging_mv TO anon;

-- Refresh CONCURRENTLY (no bloquea lecturas) vía RPC SECURITY DEFINER — mismo
-- patrón que refresh_ventas_rollup_mensual_mv. Lo llama el cron refresh-clientes-views.
CREATE OR REPLACE FUNCTION refresh_switch_estadocuenta_aging_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY switch_estadocuenta_aging_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_switch_estadocuenta_aging_mv() TO service_role;

NOTIFY pgrst, 'reload schema';
