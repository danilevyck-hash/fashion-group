-- CXC Favorites: persist starred clients per user
CREATE TABLE IF NOT EXISTS cxc_favorites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  nombre_normalized text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, nombre_normalized)
);

CREATE INDEX IF NOT EXISTS idx_cxc_favorites_user ON cxc_favorites(user_id);
