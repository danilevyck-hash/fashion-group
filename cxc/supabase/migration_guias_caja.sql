-- Run this in Supabase Dashboard > SQL Editor
-- Migration: Guía de Transporte + Caja Menuda tables

-- Guía de Transporte
create table if not exists guia_transporte (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  fecha date not null,
  transportista text not null,
  placa text,
  observaciones text,
  created_at timestamptz default now()
);
create table if not exists guia_items (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references guia_transporte(id) on delete cascade,
  orden integer not null,
  cliente text,
  direccion text,
  empresa text,
  facturas text,
  bultos integer default 0,
  numero_guia_transp text
);
alter table guia_transporte enable row level security;
alter table guia_items enable row level security;
create policy "Allow all for anon" on guia_transporte for all using (true) with check (true);
create policy "Allow all for anon" on guia_items for all using (true) with check (true);

-- Caja Menuda
create table if not exists caja_periodos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  fecha_apertura date not null,
  fecha_cierre date,
  fondo_inicial numeric default 200,
  estado text default 'abierto',
  created_at timestamptz default now()
);
create table if not exists caja_gastos (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references caja_periodos(id) on delete cascade,
  fecha date not null,
  nombre text,
  ruc text,
  dv text,
  factura text,
  subtotal numeric default 0,
  itbms numeric default 0,
  total numeric default 0,
  created_at timestamptz default now()
);
alter table caja_periodos enable row level security;
alter table caja_gastos enable row level security;
create policy "Allow all for anon" on caja_periodos for all using (true) with check (true);
create policy "Allow all for anon" on caja_gastos for all using (true) with check (true);
