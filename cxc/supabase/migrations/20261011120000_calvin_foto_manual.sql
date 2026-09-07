-- ─────────────────────────────────────────────────────────────────────────────
-- foto_manual PARA CALVIN — la cuarta marca, que quedó sin el candado (6-sep-2026).
--
-- 🩸 QUÉ PASABA. La migración 20260725120000 creó `foto_manual` en las tres
-- marcas que existían ese día (Reebok `products`, Joybees y Tommy). **Calvin
-- nació el 12-ago-2026, dieciocho días después**, y nadie volvió a esa lista:
-- `calvin_products` es hoy la ÚNICA de las cuatro sin la columna. Verificado
-- contra producción el 6-sep-2026 en `information_schema.columns`.
--
-- La consecuencia NO es cosmética. El código es el mismo para las cuatro
-- (`skusConFotoManual` / `guardarFotoElegida`, en `lib/catalogos/variantes-server.ts`),
-- y sin la columna:
--   · `skusConFotoManual` devuelve el conjunto VACÍO → la subida masiva del ZIP
--     del banco B2B PISA la foto que alguien eligió a mano, sin avisar;
--   · el manifiesto la cuenta como «asignada» en vez de «respetada», así que en
--     pantalla parece que todo salió bien.
-- Medido: Tommy tiene 30 fotos protegidas así; Calvin, **0** — no porque nadie
-- haya elegido, sino porque no se puede marcar.
--
-- ADITIVA y con el MISMO default que las otras tres: `false` = la foto la puede
-- poner el proceso automático. Ninguna fila cambia de comportamiento al
-- aplicarla; lo que gana Calvin es poder decir «esta la elegí yo».
--
-- El código NO necesita esta DDL para seguir funcionando: `guardarFotoElegida`
-- reintenta sin la columna y `skusConFotoManual` devuelve vacío (patrón de
-- tolerancia de la casa). Aplicarla enciende el candado; no aplicarla deja
-- Calvin exactamente como está hoy.
-- ─────────────────────────────────────────────────────────────────────────────

alter table calvin_products
  add column if not exists foto_manual boolean not null default false;

comment on column calvin_products.foto_manual is
  'Foto elegida a mano desde el admin: true = ningun proceso automatico vuelve a pisar image_url (la subida masiva del ZIP del B2B la respeta). Patron nombre_manual / oculto_manual. Calvin quedo fuera de 20260725120000 porque la marca nacio despues.';
