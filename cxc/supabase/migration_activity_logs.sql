-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_role text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON activity_logs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at DESC);

-- Also create a 'backups' bucket in Supabase Storage > New Bucket (private)
