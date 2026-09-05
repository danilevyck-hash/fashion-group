-- ─────────────────────────────────────────────────────────────────────────────
-- El `sync_type` 'clientes' — para que el directorio de Boston deje rastro.
--
-- POR QUE: `switch_clientes` de confecciones_boston llevaba 37 dias congelado
-- (todas sus 4.915 filas con synced_at = 2026-07-30 06:31:07) porque el unico
-- escritor del directorio vivia dentro del sync de estado de cuenta por API, y
-- ese camino para Boston esta vetado: 4.912 llamadas HTTP, 54 min medidos
-- contra un techo de funcion de 800 s. El cron nuevo
-- `/api/cron/sync-clientes-boston` (semanal) lo trae por su cuenta.
--
-- `switch_sync_log.sync_type` tiene un CHECK y el logger de corridas es
-- DEGRADABLE: un tipo que el CHECK no lista hace que la corrida NO deje NINGUNA
-- fila -- ni 'running', ni 'success', ni 'error'. Corra bien o corra mal, es
-- invisible. Ya paso dos veces (catalogo_tommy, articulo_marca) y las dos
-- corrieron meses sin rastro. Por eso el CHECK va en la MISMA migracion que
-- estrena el tipo.
--
-- LA APP FUNCIONA ANTES DE CORRER ESTO: sin el CHECK, `createSwitchSyncLog`
-- devuelve logId null, `finishSwitchSyncLog` es un no-op y el cron **escribe
-- igual** el directorio y registra su heartbeat. Lo unico que falta hasta que
-- esto corra es la fila del log -- o sea, la alerta A ("un sync trajo cero
-- donde siempre trae cientos") no tiene con que medir. La alerta B (la tabla
-- dejo de recibir escrituras) NO depende de esto y funciona desde el minuto uno.
--
-- Migracion ADITIVA: reescribe un CHECK agregandole un valor. NO toca una sola
-- fila de datos. Un CHECK no se extiende: se reescribe entero, asi que la lista
-- de abajo es la vigente COMPLETA (espejo de SYNC_LOG_TYPES en
-- src/lib/switch-api/sync-log-tipos.ts; `sync-log-tipos-check.test.ts` compara
-- las dos y pone el build rojo si se apartan).
--
-- Aplicar: npm run migrar supabase/migrations/20260923120000_sync_log_clientes.sql
-- Evitar las ventanas de cron: 23:50-00:20 y 05:50-06:10 UTC.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'clientes',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'egresos_varios',
    'cuentas_contables',
    'factura_lineas',
    'ingresos_mercancia',
    'ventas_tipos',
    'mayor'
  ));

NOTIFY pgrst, 'reload schema';

-- ── Verificacion (correr despues de la primera corrida del cron) ────────────
--   -- 1. El directorio de Boston dejo de estar congelado:
--   SELECT empresa_key, COUNT(*) AS filas, MAX(synced_at) AS ultima
--   FROM switch_clientes
--   WHERE empresa_key = 'confecciones_boston'
--   GROUP BY empresa_key;
--
--   -- 2. La corrida deja rastro:
--   SELECT empresa_key, status, started_at, records_inserted
--   FROM switch_sync_log
--   WHERE sync_type = 'clientes'
--   ORDER BY started_at DESC
--   LIMIT 10;
--
--   -- 3. 🔴 Y clientes_master NO creció (sigue siendo SOLO del grupo):
--   SELECT COUNT(*) FILTER (WHERE deleted IS NOT TRUE) AS vivos FROM clientes_master;
