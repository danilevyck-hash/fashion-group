-- ─────────────────────────────────────────────────────────────────────────────
-- CATÁLOGOS — SE BORRAN LOS CINCO PEDIDOS QUE NUNCA SALIERON A SWITCH
-- (22-sep-2026). Borrado SUAVE, por LISTA DE IDS.
--
-- Daniel: «cuando fueron? si ya pasaron 30 dias borralos» → «a) Los cinco,
-- como dijiste».
--
-- 🩸 CÓMO APARECIERON. La auditoría de Catálogos del 22-sep-2026 encontró
-- cinco pedidos VIVOS, en estado `borrador`, sin un solo envío a Switch, por
-- **$32.208 en total**. El más viejo llevaba **61 días** parado. En pantalla
-- salían como «Borradores» mezclados con todo lo demás, y el chip «Sin mandar»
-- NO decía desde cuándo — por eso nadie los vio. Ese chip se arregla aparte
-- (cambio aprobado el mismo día); esto es la limpieza de lo que ya pasó.
--
--   PED-019 · Contado                 · $2.760  · 22-jul-2026 · 61 días
--   TOM-005 · Contado                 · $16.920 · 12-ago-2026 · 40 días
--   TOM-006 · Contado                 · $7.254  · 12-ago-2026 · 40 días
--   CKP-007 · ACTIVE SHOES, S.A.      · $1.704  · 12-ago-2026 · 41 días
--   TOM-023 · Wolf Mall Center Int    · $3.570  · 20-ago-2026 · 32 días
--
-- ⚠️ CORRECCIÓN, mismo día: los días de arriba están contados en PANAMÁ.
-- La primera medición los contó en UTC y dio uno menos en cada uno
-- (61/40/40/40/32). CKP-007 nació 02:35 UTC del 13-ago, que en Panamá es el
-- 12-ago: 41 días, no 40. Es exactamente la trampa que el sistema arrastra
-- —Vercel corre en UTC y Panamá es UTC−5 fijo— y por eso «hoy» siempre se
-- pregunta con `hoyPanama()`. El borrado no cambia: los cinco pasan de 30
-- días contados como se cuenten.
--
-- ⚠️ Se le advirtió a Daniel que tres dicen «Contado» —el nombre que sale en
-- las pruebas— pero que DOS tienen cliente real con nombre, y que ésos parecen
-- pedidos armados y olvidados, no basura. Decidió borrar los cinco igual.
--
-- 🔴 POR LISTA DE IDS, NUNCA POR PARECIDO. Misma regla que `20260924120000`
-- (borrar pedidos de prueba): un `LIKE` sobre el nombre del cliente habría
-- barrido todos los «Contado» de la historia, que son ventas de mostrador
-- buenas. Cinco ids escritos a mano, y ninguna fila más puede caer.
--
-- 🔴 BORRADO SUAVE. `deleted = true` + `deleted_at`, nunca un DELETE: la fila
-- se queda y se puede devolver poniendo `deleted = false`. Los renglones de
-- cada pedido (`*_order_items`) NO se tocan — cuelgan del pedido y vuelven
-- con él.
--
-- 🔴 SOLO LO QUE SIGUE VIVO Y SIN ENVÍO. Cada UPDATE exige `deleted = false`,
-- así que correr esto dos veces no hace nada la segunda vez, y exige
-- `status = 'borrador'`: si alguno se mandó a Switch entre la medición y la
-- corrida, se salva solo y no se borra.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tommy_orders
   SET deleted = true, deleted_at = now()
 WHERE id IN (
         'c68f1479-adb0-4863-b74e-1177df23cac2',  -- TOM-005 · Contado · $16.920
         'a835de77-1655-45b6-83a4-255661d6b043',  -- TOM-006 · Contado · $7.254
         'b07638e3-c91a-4c5d-999e-89c92f1b5b58'   -- TOM-023 · Wolf Mall Center Int · $3.570
       )
   AND deleted = false
   AND status = 'borrador';

UPDATE reebok_orders
   SET deleted = true, deleted_at = now()
 WHERE id = '31ec47ee-2268-46f4-a756-a7d564469485'  -- PED-019 · Contado · $2.760
   AND deleted = false
   AND status = 'borrador';

UPDATE calvin_orders
   SET deleted = true, deleted_at = now()
 WHERE id = '4b79cdac-e161-43d0-9dcc-6134bb89a25d'  -- CKP-007 · ACTIVE SHOES, S.A. · $1.704
   AND deleted = false
   AND status = 'borrador';
