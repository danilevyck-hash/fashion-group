-- Cliente y vendedor de Switch elegidos en el CHECKOUT, guardados en el pedido
-- para que el envío (y el Reintentar) usen los reales en vez de los hardcodes
-- del piloto (Contado id=1 + Reinaldo id=2). Pedidos viejos quedan null →
-- el envío Reebok cae a los defaults del piloto (compat).
alter table reebok_orders
  add column if not exists cliente_switch_id int,
  add column if not exists vendedor_switch_id int;

alter table joybees_orders
  add column if not exists cliente_switch_id int,
  add column if not exists vendedor_switch_id int;
