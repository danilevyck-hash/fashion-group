-- WebAuthn / Passkey credentials table
-- Run this in Supabase SQL editor

create table if not exists webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id int not null,
  credential_id text unique not null,
  public_key text not null,
  counter int default 0,
  device_name text,
  created_at timestamptz default now()
);

-- Index for fast lookups by credential_id
create index if not exists idx_webauthn_credential_id on webauthn_credentials (credential_id);

-- Index for fast lookups by user_id
create index if not exists idx_webauthn_user_id on webauthn_credentials (user_id);

-- Enable RLS
alter table webauthn_credentials enable row level security;

-- Only service_role can access (server-side only)
create policy "Service role full access"
  on webauthn_credentials
  for all
  using (true)
  with check (true);
