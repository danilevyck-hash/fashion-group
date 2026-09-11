-- ============================================================================
-- andrea deja de tener Multifashion: la tarjeta se pintaba y la página la
-- rebotaba.
-- ============================================================================
-- Daniel, textual (11-sep-2026):
--   «a Andrea quita Multifashion, porque ahora lo verá en Comisiones»
--
-- 🩸 EL DEFECTO. El editor de «permisos personalizados» de `/admin/usuarios`
-- ofrece las 20 keys del catálogo, pero hay módulos que deciden el acceso por
-- ROL **en el servidor** y se ríen del override. Multifashion es uno:
-- `src/lib/multifashion/acceso.ts` → `ROLES_MULTIFASHION` = admin +
-- `gerente_acs`, y el guard SSR de `/multifashion` manda a `/home` a
-- cualquier otro. Resultado medido en producción el 11-sep-2026: andrea
-- (secretaria) tenía `multifashion` en su `modulos_override`, así que veía la
-- ficha en el Inicio y en el sidebar, la tocaba, y la pantalla la devolvía al
-- Inicio sin decirle nada.
--
-- Lo que ve ahora es lo que necesita: Multifashion es **una empresa más** del
-- selector de `/comisiones` desde el 6-sep-2026, y `comisiones` sí está en su
-- override.
--
-- MEDIDO ANTES DE ESCRIBIR ESTO (11-sep-2026): los dos únicos overrides vivos
-- son `Angela` y `andrea`, las dos secretarias. Solo **andrea** trae
-- `multifashion`; Angela no. Con la key fuera le quedan 10 módulos, así que
-- no se queda sin ninguno.
--
-- 🔴 QUÉ NO HACE:
--   · NO toca a Angela ni a ningún otro usuario — la condición es por `name`
--     EXACTO. (La columna del usuario en `fg_users` se llama `name`, no
--     `user_name`; es el mismo campo con el que entra al login.)
--   · NO toca `role_permissions`: el rol `secretaria` nunca tuvo la key.
--   · NO toca el módulo Multifashion ni sus rutas.
--
-- Aditiva e idempotente: `array_remove` sobre una key que no está no cambia
-- nada, y correrla dos veces deja el mismo array.
--
-- ⚠️ El editor de Usuarios deja de OFRECER los módulos cuyo guard SSR rebota
-- al rol en el mismo commit que esta migración (`modulosOfrecibles`), para que
-- esta corrección no haya que repetirla el mes que viene.
-- ============================================================================

UPDATE fg_users
SET modulos_override = array_remove(modulos_override, 'multifashion')
WHERE name = 'andrea'
  AND modulos_override IS NOT NULL
  AND 'multifashion' = ANY (modulos_override);

-- Verificación (no escribe): andrea sin `multifashion` y con sus otros 10
-- módulos intactos; Angela sin cambios.
--   SELECT name, role, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
