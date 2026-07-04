-- Mapeo fg_user → vendedor de Switch, POR EMPRESA (el mismo humano tiene
-- vendedorId distinto en cada instancia de Switch: Reebok vive en
-- active_shoes, Joybees en su propia instancia). Lo usa el checkout de
-- catálogos para setear el vendedor del pedido AUTOMÁTICAMENTE según quién
-- está logueado, en vez del hardcode del piloto (Reinaldo id=2).
-- Se administra desde Sistema → Usuarios (sección "Vendedor en Switch").
create table if not exists fg_user_switch_vendedor (
  user_id uuid not null references fg_users(id) on delete cascade,
  empresa_key text not null,
  vendedor_id int not null,
  vendedor_nombre text,
  updated_at timestamptz not null default now(),
  primary key (user_id, empresa_key)
);

alter table fg_user_switch_vendedor enable row level security;
-- Sin policies: solo service_role (mismo patrón que reebok_switch_envios).
