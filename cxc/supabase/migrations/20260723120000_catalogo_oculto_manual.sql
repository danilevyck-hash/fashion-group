-- Toggle "Ocultar del catálogo" (Reebok + Joybees) — decisión Daniel 22-jul-2026.
-- Un producto no vendible (sin foto, precio 0, etc.) se puede ocultar del
-- catálogo público SIN tocar código y SIN que el sync lo re-active:
-- el motor de sync (sync-catalogo.ts) respeta oculto_manual = true y mantiene
-- active = false mientras el flag esté puesto. Reversible desde el admin.
--
-- Pre-migración el código hace fallback (lee sin la columna y la trata como
-- false), así que correr esta DDL activa el feature sin romper nada antes.

alter table products
  add column if not exists oculto_manual boolean not null default false;

alter table joybees_products
  add column if not exists oculto_manual boolean not null default false;

comment on column products.oculto_manual is
  'Toggle admin "Ocultar del catálogo": true = oculto siempre (el sync lo respeta y mantiene active=false). Reversible.';

comment on column joybees_products.oculto_manual is
  'Toggle admin "Ocultar del catálogo": true = oculto siempre (el sync lo respeta y mantiene active=false). Reversible.';

-- Primer caso APROBADO por Daniel (22-jul-2026): Reebok 100256591
-- ("basketball ball": activo, sin foto, precio 0, con stock — no vendible).
-- Se oculta en la misma migración para que quede permanente apenas corra la
-- DDL (mientras tanto está con active=false puesto a mano, que el cron
-- revertiría al no existir aún la columna). Reversible desde el admin.

update products
  set oculto_manual = true, active = false
  where sku = '100256591';

