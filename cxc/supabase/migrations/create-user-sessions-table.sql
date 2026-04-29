-- Migración versionada de user_sessions.
-- La tabla ya existe en producción; este archivo deja el schema documentado en repo
-- para que un restore desde cero la cree con las mismas columnas y constraints.
--
-- Columnas usadas por el código (referencias):
--   src/app/api/auth/route.ts        — INSERT al login, UPDATE revoked al logout
--                                      y al relogueo del mismo user.
--   src/app/api/admin/sessions/route.ts — SELECT y UPDATE revoked.
--   src/middleware.ts                — SELECT por session_token (revoked=false),
--                                      PATCH last_seen.

create table if not exists user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_name       text not null,
  user_role       text not null,
  session_token   text not null unique,
  ip_address      text,
  last_seen       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  revoked         boolean not null default false
);

-- Lookup principal del middleware: por session_token donde revoked=false.
-- El UNIQUE en session_token ya cubre el equality lookup, pero un índice parcial
-- sobre (session_token) where revoked=false ayuda a las queries de validación.
create index if not exists user_sessions_token_active_idx
  on user_sessions (session_token)
  where revoked = false;

-- Lookup admin: filas activas por usuario (revocar todas, listar activas).
create index if not exists user_sessions_user_active_idx
  on user_sessions (user_name)
  where revoked = false;

-- Listado por last_seen desc (sessions/route.ts top 100).
create index if not exists user_sessions_last_seen_idx
  on user_sessions (last_seen desc);

-- RLS — patrón consistente con resto de tablas del proyecto (schema.sql).
-- Todas las consultas a esta tabla las hace el server con service_role,
-- así que abrimos políticas FOR ALL (anon/auth) — el control real lo hace
-- requireAuth() en cada API route.
alter table user_sessions enable row level security;

drop policy if exists "Allow all for anon" on user_sessions;
create policy "Allow all for anon" on user_sessions for all using (true) with check (true);
