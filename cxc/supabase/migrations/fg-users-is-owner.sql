-- Owner flag: only the owner can create/delete catálogo entries
-- (starting with caja categories, extensible later).
ALTER TABLE fg_users
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

UPDATE fg_users SET is_owner = true WHERE name = 'daniel';
