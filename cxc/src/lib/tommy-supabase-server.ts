import { createClient } from "@supabase/supabase-js";

// Las tablas tommy_* viven en el proyecto principal. Se permite un proyecto
// propio futuro vía TOMMY_* (mismo patrón que reebok/joybees-supabase-server),
// con fallback al principal cuando no están seteadas — que es el caso hoy.
// Lecturas server-side siempre vivas (cache: "no-store"): evita snapshots
// viejos del Data Cache de Next.js.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const tommyServer = createClient(
  process.env.NEXT_PUBLIC_TOMMY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.TOMMY_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_TOMMY_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
);
