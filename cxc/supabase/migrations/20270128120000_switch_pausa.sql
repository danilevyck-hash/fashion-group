-- «Pausar Switch» (26-nov-2026, Daniel). Aditiva: dos tablas nuevas, nada se
-- borra ni se cambia. Las escribe solo el servidor (service_role); RLS sin
-- políticas = cerrado para anon/authenticated.

-- Cada pausa: quién, desde, hasta, y si se reanudó antes (con quién).
create table if not exists public.switch_pausas (
  id bigserial primary key,
  pausado_por text not null,
  desde timestamptz not null default now(),
  hasta timestamptz not null,
  reanudada_en timestamptz,
  reanudada_por text,
  creado_en timestamptz not null default now(),
  constraint switch_pausas_hasta_despues check (hasta > desde),
  constraint switch_pausas_maximo_24h check (hasta <= desde + interval '24 hours')
);
create index if not exists switch_pausas_desde_idx on public.switch_pausas (desde desc);
alter table public.switch_pausas enable row level security;
comment on table public.switch_pausas is
  'Pausar Switch (Usuarios, solo admin): mientras desde <= now() < least(hasta, reanudada_en) ningún camino del sistema entra a Switch. Ver src/lib/switch-api/pausa.ts.';

-- Pedidos del catálogo confirmados durante una pausa: esperan aquí y salen
-- solos al terminar (por el mismo motor y el mismo candado at-most-once).
create table if not exists public.switch_pausa_pedidos (
  id bigserial primary key,
  envios_table text not null,
  order_id uuid not null,
  order_number text,
  documento text not null default 'pedido' check (documento in ('pedido', 'cotizacion')),
  auto boolean not null default false,
  encolado_en timestamptz not null default now(),
  tomado_en timestamptz,
  resultado text,
  constraint switch_pausa_pedidos_unico unique (envios_table, order_id)
);
create index if not exists switch_pausa_pedidos_espera_idx
  on public.switch_pausa_pedidos (encolado_en) where tomado_en is null;
alter table public.switch_pausa_pedidos enable row level security;
comment on table public.switch_pausa_pedidos is
  'Pedidos del catálogo que esperaron una pausa de Switch. tomado_en null = en espera. Ver src/lib/catalogo/pedidos-en-espera.ts.';
