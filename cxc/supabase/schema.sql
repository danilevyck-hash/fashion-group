-- CXC Dashboard Schema

create table if not exists cxc_uploads (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  filename text not null,
  row_count integer not null default 0,
  uploaded_at timestamptz not null default now()
);

create index idx_cxc_uploads_company on cxc_uploads(company_key);
create index idx_cxc_uploads_date on cxc_uploads(uploaded_at desc);

create table if not exists cxc_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references cxc_uploads(id) on delete cascade,
  company_key text not null,
  codigo text,
  nombre text,
  nombre_normalized text not null,
  correo text,
  telefono text,
  celular text,
  contacto text,
  pais text,
  provincia text,
  distrito text,
  corregimiento text,
  limite_credito numeric default 0,
  limite_morosidad numeric default 0,
  d0_30 numeric default 0,
  d31_60 numeric default 0,
  d61_90 numeric default 0,
  d91_120 numeric default 0,
  d121_180 numeric default 0,
  d181_270 numeric default 0,
  d271_365 numeric default 0,
  mas_365 numeric default 0,
  total numeric default 0
);

create index idx_cxc_rows_upload on cxc_rows(upload_id);
create index idx_cxc_rows_normalized on cxc_rows(nombre_normalized);
create index idx_cxc_rows_company on cxc_rows(company_key);

create table if not exists cxc_client_overrides (
  id uuid primary key default gen_random_uuid(),
  nombre_normalized text unique not null,
  correo text,
  telefono text,
  celular text,
  contacto text,
  updated_at timestamptz not null default now()
);

create index idx_cxc_overrides_name on cxc_client_overrides(nombre_normalized);

-- RLS policies (adjust as needed)
alter table cxc_uploads enable row level security;
alter table cxc_rows enable row level security;
alter table cxc_client_overrides enable row level security;

create policy "Allow all for anon" on cxc_uploads for all using (true) with check (true);
create policy "Allow all for anon" on cxc_rows for all using (true) with check (true);
create policy "Allow all for anon" on cxc_client_overrides for all using (true) with check (true);

-- Vendor assignments
create table if not exists vendor_assignments (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  client_name text not null,
  vendor_name text not null,
  updated_at timestamptz not null default now(),
  unique(company_key, client_name)
);

create index idx_vendor_assignments_company on vendor_assignments(company_key);

alter table vendor_assignments enable row level security;
create policy "Allow all for anon" on vendor_assignments for all using (true) with check (true);
