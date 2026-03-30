import { createClient } from "@supabase/supabase-js";

export const reebokServer = createClient(
  process.env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.REEBOK_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
