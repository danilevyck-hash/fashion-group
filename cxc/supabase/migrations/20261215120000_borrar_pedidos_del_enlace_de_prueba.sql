-- ─────────────────────────────────────────────────────────────────────────────
-- CATÁLOGOS — SE BORRAN LOS CINCO PEDIDOS DE PRUEBA DEL ENLACE PÚBLICO
-- (22-sep-2026). Borrado SUAVE, por LISTA DE IDS.
--
-- Daniel: «3. Si» (son pruebas mías) → «si borralos».
--
-- 🩸 CÓMO APARECIERON. La auditoría de Catálogos del 22-sep encontró cinco
-- pedidos del enlace público de Reebok vivos y parados entre 71 y 77 días,
-- por **$28.358** en total. Cuatro dicen «Daniel» y uno «Daniel jesus Angulo
-- range»: son pruebas suyas de cuando se estrenó la página, en julio.
--
--   id 11 · 7-jul-2026  · Daniel
--   id 12 · 7-jul-2026  · Daniel
--   id 13 · 8-jul-2026  · Daniel
--   id 14 · 13-jul-2026 · Daniel jesus Angulo range
--   id 15 · 13-jul-2026 · Daniel jesus Angulo range
--
-- 🔴 EL id 18 NO SE TOCA. Es «Nathalie», del 26-jul: el ÚNICO pedido que un
-- cliente de verdad confirmó por el enlace en toda la historia, y sí se
-- convirtió y salió a Switch. Por eso la lista es de ids escritos a mano y no
-- un `WHERE convertida = false`: esa condición hoy da los cinco, pero mañana
-- podría agarrar el carrito de un cliente real a medio llenar.
--
-- 🔑 LO QUE ESTO NO ES. No es «limpiar lo que no salió a Switch». Un pedido del
-- enlace sin confirmar es un CARRITO ABANDONADO, no una venta trabada —
-- medido: los 2 que un cliente sí confirmó (Nathalie y el de Calvin) se
-- convirtieron y salieron los 2. Por eso tampoco se les puso aviso.
--
-- 🔴 BORRADO SUAVE y idempotente: `deleted = true` + `deleted_at`, nunca un
-- DELETE. Exige `deleted = false` (correrlo dos veces no hace nada) y
-- `convertida = false` (si alguno se convirtiera entre la medición y la
-- corrida, se salva solo).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE reebok_pedidos_publicos
   SET deleted = true, deleted_at = now()
 WHERE id IN (11, 12, 13, 14, 15)
   AND deleted = false
   AND convertida = false;
