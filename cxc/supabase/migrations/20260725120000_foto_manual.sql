-- ─────────────────────────────────────────────────────────────────────────────
-- foto_manual — "esta foto la elegí yo, no la toques" (decisión Daniel 25-jul-2026).
--
-- Patrón IDÉNTICO a nombre_manual / oculto_manual, que ya existen:
--   · false (default) = la foto la puede poner/reemplazar el proceso automático
--     (subida del ZIP del banco B2B, que elige la mejor vista por producto).
--   · true = la eligió una persona desde el admin ("Cambiar foto" → clic en una
--     variante). Ningún proceso automático vuelve a pisar image_url:
--       - el motor de sync (sync-catalogo.ts) ya OMITE image_url del UPDATE
--         siempre, para cualquier producto (nunca pisa fotos);
--       - la subida del ZIP del B2B SÍ asigna fotos en masa, y este flag es el
--         que la frena producto por producto (guarda las variantes nuevas, pero
--         deja la elección manual intacta).
--
-- Pre-migración el código hace fallback (lee sin la columna y la trata como
-- false) igual que oculto_manual, así que correr esta DDL activa el candado sin
-- romper nada antes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table products
  add column if not exists foto_manual boolean not null default false;

alter table joybees_products
  add column if not exists foto_manual boolean not null default false;

alter table tommy_products
  add column if not exists foto_manual boolean not null default false;

comment on column products.foto_manual is
  'Foto elegida a mano desde el admin: true = ningun proceso automatico vuelve a pisar image_url (la subida masiva del ZIP del B2B la respeta). Patron nombre_manual / oculto_manual.';

comment on column joybees_products.foto_manual is
  'Foto elegida a mano desde el admin: true = ningun proceso automatico vuelve a pisar image_url (la subida masiva del ZIP del B2B la respeta). Patron nombre_manual / oculto_manual.';

comment on column tommy_products.foto_manual is
  'Foto elegida a mano desde el admin: true = ningun proceso automatico vuelve a pisar image_url (la subida masiva del ZIP del B2B la respeta). Patron nombre_manual / oculto_manual.';
