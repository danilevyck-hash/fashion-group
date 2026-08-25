-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: sync_type 'ingresos_mercancia' para switch_sync_log.
--
-- Lo estrena el cron /api/cron/sync-ingresos-mercancia (09:05 UTC = 04:05 a.m.
-- de Panama), que trae las COMPRAS de las 6 empresas de Fashion Group al dia.
--
-- ── POR QUE VA EN LA MISMA MIGRACION QUE ESTRENA EL TIPO ────────────────────
-- Un CHECK no se extiende: se reescribe entero. Sin esto el logger es
-- degradable (se traga el error del INSERT y devuelve logId null), asi que la
-- corrida NO deja fila ni de exito ni de error. Ya paso DOS veces
-- (catalogo_tommy y articulo_marca), meses invisibles cada una.
-- La lista tiene que ser identica a SYNC_LOG_TYPES (src/lib/switch-api/
-- sync-log-tipos.ts); lo verifica sync-log-tipos-check.test.ts en las DOS
-- direcciones.
--
-- ── LA APP FUNCIONA ANTES DE CORRER ESTO ────────────────────────────────────
-- Mientras el CHECK no acepte el tipo, el cron corre igual y las compras SI se
-- escriben en switch_ingresos_mercancia: lo unico que falta es su fila en el
-- log. La respuesta del route lo dice de frente en el campo `sinLog`, y el
-- heartbeat de `cron_heartbeats` (que no tiene CHECK) sigue registrandose, asi
-- que el vigia lo ve corriendo. No hay ventana ciega.
--
-- Migracion ADITIVA: no toca ni una fila de datos. No nombra ninguna tabla de
-- negocio. Segura de correr en caliente; evitar igual las ventanas de sync
-- (05:30-07:35 y 23:50-00:20 UTC).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
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
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'egresos_varios',
    'cuentas_contables',
    'factura_lineas',
    'ingresos_mercancia',
    'mayor'
  ));

-- ── Verificacion (correr despues) ───────────────────────────────────────────
--   SELECT empresa_key, status, started_at, finished_at, records_inserted
--   FROM switch_sync_log
--   WHERE sync_type = 'ingresos_mercancia'
--   ORDER BY started_at DESC
--   LIMIT 20;
--
-- Esperado: una fila por empresa por corrida del cron (6 por dia). Si esta
-- vacia despues de una corrida, el CHECK sigue sin el tipo.
