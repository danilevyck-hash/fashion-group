import { createClient } from "@supabase/supabase-js";

export const reebokServer = createClient(
  process.env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
