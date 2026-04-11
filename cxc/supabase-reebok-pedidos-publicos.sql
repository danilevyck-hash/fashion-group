create table if not exists reebok_pedidos_publicos (
  id serial primary key,
  short_id text unique not null,
  items jsonb not null,
  total numeric not null default 0,
  created_at timestamptz default now()
);
alter table reebok_pedidos_publicos enable row level security;
create policy "public_read" on reebok_pedidos_publicos for select using (true);
create policy "public_insert" on reebok_pedidos_publicos for insert with check (true);
