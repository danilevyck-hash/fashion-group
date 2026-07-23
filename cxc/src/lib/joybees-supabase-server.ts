import { createClient } from "@supabase/supabase-js";

// `joybees_products` vive en el proyecto principal. Se permite un proyecto propio
// futuro vía JOYBEES_* (mismo patrón que reebok-supabase-server), con fallback al
// principal cuando no están seteadas — que es el caso hoy.
// Lecturas server-side siempre vivas (mismo patrón que supabase-server.ts /
// reebok-supabase-server.ts): evita snapshots viejos del Data Cache de Next.js.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const joybeesServer = createClient(
  process.env.NEXT_PUBLIC_JOYBEES_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.JOYBEES_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_JOYBEES_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
);
