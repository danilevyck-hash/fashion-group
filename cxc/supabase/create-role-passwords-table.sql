-- Role passwords table — allows admin to manage passwords from UI
-- Falls back to env vars if role not found in this table
CREATE TABLE IF NOT EXISTS role_passwords (
  role text PRIMARY KEY,
  password text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
