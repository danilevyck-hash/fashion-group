-- Role-based permissions table
-- Each role has a list of modules it can access
create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  modulos text[] default '{}',
  activo boolean default true,
  updated_at timestamptz default now()
);

-- Seed default permissions
insert into role_permissions (role, modulos, activo) values
  ('admin', ARRAY['cxc','guias','caja','directorio','reclamos','prestamos','ventas','upload','cheques'], true),
  ('director', ARRAY['cxc','guias','caja','directorio','reclamos','prestamos','ventas','upload','cheques'], true),
  ('contabilidad', ARRAY['prestamos'], true),
  ('david', ARRAY['cxc'], true),
  ('upload', ARRAY['upload','guias','caja','reclamos','cheques','directorio'], true)
on conflict (role) do nothing;
