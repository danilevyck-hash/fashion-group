-- Add nullable cliente_nombre column to reebok_pedidos_publicos.
-- Nullable so existing rows (which have no name captured) remain valid;
-- pedidos nuevos validan que el nombre venga no-vacio en el endpoint POST.
alter table reebok_pedidos_publicos
  add column if not exists cliente_nombre text;
