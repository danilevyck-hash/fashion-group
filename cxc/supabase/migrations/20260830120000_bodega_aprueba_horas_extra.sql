-- ─────────────────────────────────────────────────────────────────────────────
-- BODEGA APRUEBA HORAS EXTRA — y NO ve la planilla.
--
-- Daniel, 26-ago-2026, textual: *«julio usa el usuario bodega, asi que ponlo
-- ahi»*. Julio Garay es quien reporta las horas extra (lo dice la contadora:
-- *«Sólo se pagan las horas extras autorizadas y las reportadas por Julio
-- Garay»*), y la cuenta con la que entra al sistema es `Bodega`.
--
-- ── 🔴 POR QUÉ ESTA MIGRACIÓN NO ES «DARLE ASISTENCIA A BODEGA» ──────────────
--
-- Agrega la KEY del módulo, que es lo que enciende la ficha en el menú. Quién
-- ve QUÉ adentro lo deciden dos listas de código que NO se tocan acá:
--
--   `ASISTENCIA_ROLES`   = admin · secretaria · contabilidad   ← NO bodega
--   `APROBACIONES_ROLES` = admin · bodega
--
-- O sea: `bodega` entra a la pantalla y ve UNA pestaña, Aprobaciones. Las otras
-- diez rutas de `/api/asistencia/*` le responden 403, y la única que sí
-- necesita —`planilla`, de donde salen las horas— le contesta RECORTADA: sin
-- `lineas`, sin `totales` y sin el monto de las extras. El recorte va en el
-- servidor porque esconderlo en la pantalla dejaría el sueldo viajando en el
-- JSON.
--
-- ⚠️ Y LO QUE HAY QUE SABER ANTES DE CORRERLA: `Bodega` es un usuario
-- COMPARTIDO (medido el 26-ago-2026 en `fg_users`: name = "Bodega", sin
-- `modulos_override`). Lo que se le abre a esa cuenta se le abre a cualquiera
-- que la use. Por eso lo que se abre es aprobar horas extra y nada más.
--
-- Aditiva e idempotente. La app funciona igual antes de correrla: sin la key,
-- la ficha no aparece en el menú de bodega y todo lo demás queda como hoy.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ `modulos` es `text[]`, NO jsonb — verificado contra producción antes de
-- escribir esto (`information_schema.columns` dice ARRAY). La primera versión
-- de este archivo usaba el operador `?` de jsonb y reventó sin escribir nada.
UPDATE role_permissions
   SET modulos = modulos || ARRAY['asistencia']
 WHERE role = 'bodega'
   AND NOT ('asistencia' = ANY(modulos));
