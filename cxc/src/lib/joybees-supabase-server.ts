import { createClient } from "@supabase/supabase-js";

// `joybees_products` vive en el proyecto principal. Se permite un proyecto propio
// futuro vía JOYBEES_* (mismo patrón que reebok-supabase-server), con fallback al
// principal cuando no están seteadas — que es el caso hoy.
export const joybeesServer = createClient(
  process.env.NEXT_PUBLIC_JOYBEES_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.JOYBEES_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_JOYBEES_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
