-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_sync_log admite 'articulo_marca'
--
-- ── EL PROBLEMA (medido, no supuesto — 7-ago-2026) ──────────────────────────
-- Es EL MISMO caso de 'catalogo_tommy' (migracion 20260725230000), repetido dos
-- semanas despues. `sync-articulo-marca.ts` se estreno el 6-ago y declara
-- `syncType: "articulo_marca"`, pero su migracion (20260806120000) creo la TABLA
-- `switch_articulo_marca` y NO toco el CHECK de `switch_sync_log.sync_type`.
--
-- El logger es DEGRADABLE: el INSERT viola el CHECK, se traga el error con un
-- console.error y devuelve `logId = null`. Desde ahi `finishSwitchSyncLog` es un
-- no-op. Resultado medido:
--   SELECT count(*) FROM switch_sync_log WHERE sync_type = 'articulo_marca'
--   -> 0 filas en toda la historia.
-- La corrida del 7-ago 08:45 escribio 2.000 filas, se cayo a mitad de camino y
-- no dejo NI UNA fila de log: ni 'running', ni 'success', ni 'error'.
--
-- ── POR QUE IMPORTA ─────────────────────────────────────────────────────────
-- 1. SIN RASTRO: una corrida que corre bien y una que se rompe se ven igual
--    (o sea, no se ven). Fue lo que dejo el diccionario con el 8,7% de los
--    codigos vendidos durante un dia sin que nadie se enterara.
-- 2. SIN RACHA: la regla de "2 fallos seguidos" (alert-policy.ts) se calcula
--    leyendo esta tabla. Sin filas, el par (american_classic, articulo_marca)
--    cae siempre en `sin-historia` -> fail-open, avisa al primer chispazo.
-- 3. SIN LOCK ANTI-SOLAPE: el candado de corridas concurrentes ES la fila en
--    estado 'running'. Sin fila no hay candado, y Switch admite UNA sesion por
--    empresa (un 2do login mata el token del 1ro, code 0006).
--
-- ── QUE HACE ────────────────────────────────────────────────────────────────
-- Reemplaza el CHECK agregando 'articulo_marca'. Los 11 valores existentes se
-- repiten literales — un CHECK no se puede "extender", hay que reescribirlo.
-- No toca ninguna fila: solo cambia la restriccion. Es reversible (volver a
-- correr 20260725230000 restaura el CHECK anterior).
--
-- La lista tiene que quedar IDENTICA a `SYNC_LOG_TYPES` de
-- src/lib/switch-api/sync-log.ts. El candado
-- src/__tests__/lib/sync-log-tipos-check.test.ts compara las dos y pone el build
-- ROJO si divergen — para que la tercera vez no exista.
--
-- Seguro de correr en caliente: ALTER TABLE ... ADD CONSTRAINT toma un lock
-- ACCESS EXCLUSIVE brevisimo sobre switch_sync_log (tabla chica) y valida las
-- existentes, que ya cumplen. Aun asi conviene evitar las ventanas de sync:
-- fuera de 05:30-07:35 y de 23:50-00:20 UTC.
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
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy'
  ));

-- ── Verificacion (correr despues; debe listar articulo_marca) ───────────────
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'switch_sync_log_sync_type_check';
