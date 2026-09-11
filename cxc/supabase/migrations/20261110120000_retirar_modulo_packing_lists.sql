-- ============================================================================
-- Retiro del módulo `packing-lists` (Packing Lists)
-- ============================================================================
-- Daniel, textual (10-sep-2026): «packing list no se usa, eliminar».
--
-- MEDIDO CONTRA PRODUCCIÓN ESE MISMO DÍA, antes de tocar nada:
--   · `packing_lists`: 0 filas.  `pl_items`: 0 filas.
--     Vacías desde el 14-may-2026, cuando el cron viejo —que borraba de VERDAD
--     a los 7 días de creadas— se llevó las 28 que había, sin copia.
--   · `activity_logs`: 34 rastros en toda la historia del módulo.
--       7 × packing_list_batch_create  (rol admin, 18 al 22-abr-2026)
--       3 × packing_list_delete        (rol admin)
--      24 × packing_lists_cleanup      (rol cron)
--     Ni bodega ni ninguna secretaria subió, borró ni abrió un lote NUNCA,
--     aunque las dos tenían la ficha en su menú.
--   · `packing_list_purge_snapshot`: la tabla no existe (el "snapshot" del cron
--     se escribía como una fila de `activity_logs`, no en tabla propia).
--   · Buckets de Storage: NINGUNO era de este módulo (el PDF del proveedor se
--     leía en el navegador y nunca se subía).
--
-- 🔴 QUÉ NO HACE ESTE ARCHIVO, y no es una omisión:
--   · NO dropea `packing_lists` ni `pl_items`. Es el patrón de la casa
--     (`mayor_lineas`, `cxc_favorites`, `directorio_clientes`): el código se va,
--     la tabla se queda. Quedan clasificadas `retirada` en
--     `src/lib/backup/tablas.ts` —o sea, fuera del respaldo: no hay una sola
--     fila que proteger— y `packing-lists-retirado.test.ts` pone el build ROJO
--     si una migración futura intenta borrarlas.
--   · NO toca `activity_logs`. Los 34 rastros son historia y se quedan.
--   · NO toca la función `save_packing_list` ni sus índices. Sin ruta que la
--     llame, quedan inertes.
--
-- LO QUE SÍ HACE: sacar la key retirada del menú guardado (por rol y por
-- usuario) y barrer la fila de heartbeat del cron que se retiró con el módulo.
--
-- ⚠️ ORDEN: va DESPUÉS de que el PR que retira el módulo esté desplegado.
-- Corrida antes, le apagaría la ficha a quien todavía pudiera abrirla.
-- ⚠️ NO ES BLOQUEANTE PARA EL DEPLOY: la ficha ya no existe en `modules.ts`, así
-- que la key guardada en la base no pinta nada aunque esta migración no corra.
-- ============================================================================

BEGIN;

-- 1. El menú por ROL. Medido el 10-sep-2026: la key vive en `admin`,
--    `secretaria` y `bodega`. `array_remove` es quirúrgico — saca esa key y no
--    toca ninguna otra.
UPDATE role_permissions
SET modulos = array_remove(modulos, 'packing-lists'),
    updated_at = now()
WHERE 'packing-lists' = ANY (COALESCE(modulos, '{}'));

-- 2. El menú por USUARIO. Medido: lo traen DOS overrides, `Angela` y `andrea`
--    (las dos secretarias). Nadie más tiene `modulos_override`.
UPDATE fg_users
SET modulos_override = array_remove(modulos_override, 'packing-lists')
WHERE modulos_override IS NOT NULL
  AND 'packing-lists' = ANY (modulos_override);

-- 3. El heartbeat huérfano del cron `cleanup-packing-lists`, que se retiró con
--    el módulo (salió de vercel.json y de CRONS_FAIL_CLOSED).
--    Es exactamente el camino de `sync-mayor` (20260914120000): una fila que
--    nadie lee y que envejece para siempre, denunciada por
--    `cron-registro.test.ts` (sección D) y por la integración
--    `cron-heartbeats-huerfanos.test.ts`.
--    Borra UNA fila, por nombre EXACTO. Sin LIKE, sin rango.
DELETE FROM cron_heartbeats
 WHERE cron_name = 'cleanup-packing-lists';

COMMIT;

-- Verificación post-aplicación (no escribe):
--   SELECT role, modulos FROM role_permissions ORDER BY role;
--     -- ningún array debe traer 'packing-lists'
--   SELECT name, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
--     -- tampoco
--   SELECT cron_name FROM cron_heartbeats WHERE cron_name = 'cleanup-packing-lists';
--     -- esperado: 0 filas
--   SELECT count(*) FROM packing_lists;  -- 0, y la TABLA sigue existiendo
--   SELECT count(*) FROM pl_items;       -- 0, y la TABLA sigue existiendo
