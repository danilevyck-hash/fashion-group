-- Envíos de pedidos Joybees al ERP Switch (instancia joystep) — clon del
-- patrón pilotado de reebok_switch_envios (20260704100000): registro del
-- intento ANTES del POST + índice parcial que garantiza at-most-once (solo un
-- envío no-fallido por pedido). Estados: pendiente → enviado → verificado |
-- error (solo error libera el candado y permite reintentar).
create table if not exists joybees_switch_envios (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references joybees_orders(id) on delete restrict,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'verificado', 'error')),
  payload jsonb not null,
  pedido_switch_id bigint,
  numero_interno text,
  error_detalle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists joybees_switch_envios_order_activo
  on joybees_switch_envios (order_id)
  where estado <> 'error';

alter table joybees_switch_envios enable row level security;
-- Sin policies: solo service_role.
