-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: poda de switch_sync_log + autovacuum agresivo en las 3 tablas que
--            acumulan filas muertas
--
-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — switch_sync_log: crece sin techo
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- 3.247 filas desde el 29-may-2026, y NADA las borra: cero .delete() sobre esta
-- tabla en todo src/, cero DELETE en las migraciones, y los crons cleanup-*
-- ni la miran. Con 54 entradas de cron escribiendo ~200-400 filas/día, son
-- ~20 K filas/año (~7 MB/año contando índices) que crecen para siempre.
--
-- ── POR QUÉ NO SE PUEDE PODAR SOLO POR FECHA ────────────────────────────────
-- Se revisaron los 7 lectores. Cuatro filtran por tiempo y ninguno mira más
-- atrás de 30 horas:
--   src/lib/cron-telemetry.ts:1100          SLOT_LOG_LOOKBACK_HOURS = 30
--   src/lib/switch-api/outage-resumen.ts:343 OUTAGE_LOOKBACK_HOURS = 24
--   src/app/api/cron/switch-reconciliacion/route.ts:182  el día Panamá en curso
--   src/lib/acs-resumen-diario.ts:113        el día evaluado
--
-- Pero los otros TRES no filtran por tiempo: piden "las últimas N filas de este
-- par (empresa_key, sync_type)".
--   src/lib/switch-api/alert-policy.ts:121   .limit(10) por par
--   src/app/api/sync-status/route.ts:61      .limit(1)  por par  <- alimenta el
--                                            banner "actualizado hace X" del panel
--   src/app/api/admin/sync-now/route.ts:91   .limit(10) / .limit(1)
--
-- Un `DELETE WHERE started_at < now() - 90 days` a secas le borraría la última
-- fila a cualquier par que dejó de correr (un sync_type retirado, una empresa
-- desactivada) y el panel pasaría a decir "nunca sincronizó". Por eso la poda
-- CONSERVA SIEMPRE las 10 más recientes de cada par, por viejas que sean.
--
-- Tercera salvaguarda: nunca toca filas en status='running'. Esas sostienen el
-- índice único parcial switch_sync_log_running_lock (20260723150000), que es el
-- mutex real de las corridas de sync.
--
-- ── QUÉ HACE ────────────────────────────────────────────────────────────────
-- Crea la función podar_switch_sync_log(p_dias) y la corre una vez.
-- El PR cablea la llamada al cron cleanup-sessions (02:30 UTC) como paso extra
-- NO FATAL: si la poda falla, el cron sigue devolviendo lo mismo que siempre y
-- no cambia su heartbeat. No se tocó vercel.json.
--
-- ── ESPACIO QUE LIBERA HOY: CERO ────────────────────────────────────────────
-- Sin vueltas: la tabla tiene 2 meses de vida, así que con retención de 90 días
-- la primera corrida borra 0 filas. Esto no libera nada hoy — PONE EL TECHO
-- antes de que haga falta. En régimen la tabla se estabiliza en ~7 K filas
-- (~2,5 MB) en vez de crecer 20 K filas/año para siempre.
--
-- ── CÓMO VERIFICAR ──────────────────────────────────────────────────────────
--   SELECT count(*) FROM switch_sync_log;                    -- 3.247 hoy
--   SELECT podar_switch_sync_log(90);                        -- 0 hoy
--   SELECT podar_switch_sync_log(1);                         -- ensayo: cuántas
--                                                            -- borraría con 1 día.
--                                                            -- ¡NO correr en serio!
-- Que el panel siga sabiendo la última corrida de cada par (esto NO debe
-- cambiar ni antes ni después de podar):
--   SELECT empresa_key, sync_type, max(finished_at)
--   FROM switch_sync_log WHERE status = 'success'
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — autovacuum en las 3 tablas con filas muertas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── EL PROBLEMA, MEDIDO (26-jul-2026) ───────────────────────────────────────
--   switch_recibos         6.824 muertas / 37.255 vivas = 18,3 %
--   multifashion_tickets   2.799 muertas / 15.819 vivas = 17,7 %
--   switch_facturas        1.265 muertas / 52.269 vivas =  2,4 %
--
-- ── POR QUÉ SE ACUMULAN (esta es la respuesta de verdad) ────────────────────
-- NO es que el autovacuum "no llegue". Es que el sync genera MUCHÍSIMO churn y
-- el umbral por defecto de autovacuum (20 % + 50 filas) lo deja pasar hasta el
-- último momento. Los tres casos, con el código en la mano:
--
--   1) switch_recibos — DELETE + INSERT, no upsert.
--      src/lib/switch-api/sync-recibos.ts:269-285 borra e inserta un MES ENTERO
--      por vez. La ventana son 3 meses (RECIBOS_VENTANA_MESES = 3, sync-recibos.ts:47) x 6 empresas,
--      y el cron corre 4 VECES AL DÍA (07:50, 15:15, 19:15, 23:15 UTC), sin
--      guard no-op. Estimado: ~16 K filas reescritas x 4 = ~64 K tuplas
--      muertas/día sobre una tabla de 37 K. El umbral por defecto (≈7.500) se
--      cruza ~8 veces al día: el 18,3 % medido es el diente de sierra, no
--      acumulación monotónica.
--      Y no es un descuido: la tabla NO TIENE llave natural (el endpoint de
--      Switch no devuelve id de recibo — lo documenta 20260603040000:4-8), así
--      que hoy un upsert es imposible sin inventar una llave sintética.
--
--   2) multifashion_tickets — UPDATE ciego de todo lo preexistente.
--      src/lib/switch-api/sync.ts:255-279 hace UPDATE fila por fila de TODAS las
--      filas de la ventana de 8 días, sin comparar si algo cambió, y encima
--      setea updated_at = now(), lo que garantiza que la fila siempre difiera.
--      Ventana chica (8 días, 1 corrida/día) -> ~310 tuplas muertas/día evitables.
--
--   3) switch_facturas — UPSERT correcto, pero no selectivo.
--      src/lib/switch-api/sync-empresa.ts:337-348 hace upsert por
--      (empresa_key, switch_factura_id) con updated_at = now() en el payload, o
--      sea que ON CONFLICT DO UPDATE reescribe físicamente hasta las filas
--      idénticas. Ventana de 8 días x 5 corridas/día (9 para american_classic):
--      cada factura se reescribe ~40 veces (~72 en ACS) antes de salir de la
--      ventana. Como la ventana es chica contra 52 K filas de historia, el ratio
--      queda en 2,4 %, pero el churn absoluto es real.
--
-- ── QUÉ HACE ESTA MIGRACIÓN AL RESPECTO ─────────────────────────────────────
-- Baja el umbral de autovacuum de 20 % a 5 % en las tres tablas (y de 10 % a
-- 2 % el de ANALYZE). Con eso el autovacuum pasa ~4 veces más seguido y el
-- espacio muerto se REUSA en vez de acumularse: el pico de bloat baja de ~18 %
-- a ~5 %, y las estadísticas del planner dejan de quedarse viejas entre syncs.
--
-- ALTER TABLE ... SET (autovacuum_*) toma SHARE UPDATE EXCLUSIVE, es instantáneo
-- y NO bloquea lecturas ni escrituras. Es lo único que se puede arreglar hoy sin
-- tocar el código de sync.
--
-- ── LO QUE ESTO **NO** ARREGLA (reportado, no implementado) ─────────────────
-- El autovacuum es el paliativo, no la cura. La cura es no generar el churn:
--   · switch_facturas y multifashion_tickets: ampliar el SELECT previo que YA
--     hacen (sync-empresa.ts:322-326 y sync.ts:219-222) para traer los campos
--     mutables y saltear las filas idénticas. Cortaría ~90 % del churn sin
--     tocar el esquema. Precedente del propio repo:
--     20260725120000_acs_intercompania_no_retail.sql:57 usa
--     `AND is_wholesale IS DISTINCT FROM ...` para exactamente esto.
--   · switch_recibos: o se le agrega una llave natural sintética para poder
--     hacer upsert, o se baja la ventana de 3 meses a 1 en 3 de las 4 corridas
--     diarias.
-- No lo toco en este PR: es cambio de lógica de sync, no limpieza, y hay otro
-- agente trabajando el rendimiento del sync de saldos. Queda para decisión tuya.
--
-- ── ESPACIO QUE LIBERA: CERO INMEDIATO ──────────────────────────────────────
-- Bajar el umbral hace que el espacio muerto se REUSE, no que el archivo se
-- achique. Para devolverle MB al disco hace falta VACUUM FULL, que va en la
-- migración siguiente (20260726210300) porque no puede correr en transacción.
--
-- ── CÓMO VERIFICAR ──────────────────────────────────────────────────────────
--   SELECT relname, reloptions FROM pg_class
--   WHERE relname IN ('switch_recibos','multifashion_tickets','switch_facturas');
--
-- Y el bloat, dentro de unos días (debería estabilizarse cerca del 5 %):
--   SELECT relname, n_live_tup, n_dead_tup,
--          round(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 1) AS pct_muertas,
--          last_autovacuum
--   FROM pg_stat_user_tables
--   WHERE relname IN ('switch_recibos','multifashion_tickets','switch_facturas');
--
-- ── CÓMO APLICAR ────────────────────────────────────────────────────────────
-- TRANSACCIONAL: pegar el archivo COMPLETO de una sola vez en el SQL Editor.
-- No hay CONCURRENTLY ni VACUUM acá.
-- Fuera de 23:50-00:20 y 05:50-06:10 UTC.
-- ─────────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';


-- ═══════════════════════ PARTE 1: poda de switch_sync_log ═══════════════════

CREATE OR REPLACE FUNCTION podar_switch_sync_log(p_dias int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_borradas int;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 THEN
    RAISE EXCEPTION 'podar_switch_sync_log: p_dias debe ser >= 1 (recibí %)', p_dias;
  END IF;

  WITH ranked AS (
    SELECT id,
           started_at,
           status,
           row_number() OVER (
             PARTITION BY empresa_key, sync_type
             ORDER BY started_at DESC
           ) AS rn
    FROM switch_sync_log
  )
  DELETE FROM switch_sync_log s
  USING ranked r
  WHERE s.id = r.id
    -- 1. más vieja que la retención
    AND r.started_at < now() - make_interval(days => p_dias)
    -- 2. pero NUNCA las 10 últimas de su par (empresa_key, sync_type): son las
    --    que leen alert-policy, sync-status y sync-now, que no filtran por fecha
    AND r.rn > 10
    -- 3. y NUNCA una corrida en curso: sostiene switch_sync_log_running_lock
    AND r.status <> 'running';

  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION podar_switch_sync_log(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION podar_switch_sync_log(int) TO service_role;

COMMENT ON FUNCTION podar_switch_sync_log(int) IS
  'Borra filas de switch_sync_log de más de p_dias días, conservando siempre las 10 más recientes de cada (empresa_key, sync_type) y nunca las que están en status=running. La llama el cron cleanup-sessions (02:30 UTC) como paso no fatal. Devuelve cuántas borró.';

-- Primera corrida. Con 2 meses de historia y retención de 90 días esto devuelve
-- 0 — es lo esperado, y confirma que la función no rompe nada.
SELECT podar_switch_sync_log(90) AS filas_borradas_en_la_primera_corrida;


-- ═══════════════════ PARTE 2: autovacuum de las 3 tablas ════════════════════

-- switch_recibos — la peor (18,3 %): DELETE+INSERT de 3 meses, 4 veces al día.
ALTER TABLE switch_recibos SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- multifashion_tickets (17,7 %): UPDATE ciego de la ventana de 8 días.
ALTER TABLE multifashion_tickets SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- switch_facturas (2,4 % de ratio, pero mucho churn absoluto): upsert no
-- selectivo, 5-9 corridas/día sobre una ventana de 8 días. Es además la tabla
-- que más se lee de la base, así que estadísticas frescas le importan doble.
ALTER TABLE switch_facturas SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS podar_switch_sync_log(int);
--
--   ALTER TABLE switch_recibos       RESET (autovacuum_vacuum_scale_factor,
--                                          autovacuum_analyze_scale_factor);
--   ALTER TABLE multifashion_tickets RESET (autovacuum_vacuum_scale_factor,
--                                          autovacuum_analyze_scale_factor);
--   ALTER TABLE switch_facturas      RESET (autovacuum_vacuum_scale_factor,
--                                          autovacuum_analyze_scale_factor);
--
-- Las filas que la poda haya borrado NO se recuperan: switch_sync_log NO está en
-- DATASETS del cron de backup, o sea que no se respalda. Es un log operativo, no
-- dato de negocio, y la poda conserva 90 días + las 10 últimas de cada par. De
-- todos modos la primera corrida borra 0 filas.
-- ─────────────────────────────────────────────────────────────────────────────
