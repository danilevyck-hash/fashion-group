-- ─────────────────────────────────────────────────────────────────────────────
-- SE RETIRA LA APROBACIÓN DE PRÉSTAMOS — todos entran de una.
--
-- Daniel, 27-ago-2026, textual: *«quita poder aprobar prestamos, todos deben de
-- pasar»*.
--
-- ── 🩸 EL FRENO NO PROTEGÍA: ESCONDÍA ────────────────────────────────────────
--
-- Un Préstamo (o una Responsabilidad por daño) de $500 o más nacía en
-- `pendiente_aprobacion`. Y el saldo de una persona SOLO suma los movimientos
-- aprobados — así que un préstamo esperando aprobación es un préstamo que la
-- pantalla muestra en CERO y que nadie le está descontando.
--
-- Medido contra producción el 27-ago-2026: LUIS ADRIAN ARROYO tenía los $700
-- del 5-ago atrapados ahí. Su saldo decía $0, su deducción no corría, y se supo
-- 22 días después porque la contadora lo mencionó de pasada.
--
-- 🔴 POR ESO ESTA MIGRACIÓN NO ES OPCIONAL. El código deja de escribir
-- `pendiente_aprobacion`, pero las filas que YA están ahí no se aprueban solas:
-- sin este UPDATE quedarían invisibles PARA SIEMPRE, porque la pantalla que
-- servía para aprobarlas se retiró en el mismo cambio.
--
-- ⚠️ La columna `estado` NO se retira y `rechazado` NO se toca: un movimiento
-- rechazado es una decisión que alguien tomó, y volverlo aprobado sería
-- inventar una deuda. Solo se mueve lo que estaba esperando.
--
-- Aditiva sobre datos, idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE prestamos_movimientos
   SET estado = 'aprobado'
 WHERE estado = 'pendiente_aprobacion';
