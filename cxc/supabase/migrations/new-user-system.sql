CREATE TABLE IF NOT EXISTS fg_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  active BOOLEAN DEFAULT true,
  associated_company TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fg_user_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES fg_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  UNIQUE(user_id, module_key)
);

CREATE TABLE IF NOT EXISTS fg_user_module_order (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES fg_users(id) ON DELETE CASCADE,
  module_order TEXT[] DEFAULT '{}',
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS fg_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES fg_users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fg_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_user_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_user_module_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all fg_users" ON fg_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all fg_user_modules" ON fg_user_modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all fg_user_module_order" ON fg_user_module_order FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all fg_audit_log" ON fg_audit_log FOR ALL USING (true) WITH CHECK (true);
