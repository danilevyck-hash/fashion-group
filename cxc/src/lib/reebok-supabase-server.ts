import { createClient } from "@supabase/supabase-js";

// Lecturas server-side siempre vivas (mismo patrón que supabase-server.ts): sin
// esto, el Data Cache de Next.js sirve snapshots viejos del catálogo — p.ej. un
// producto ocultado (active=false) seguía saliendo en /api/catalogo/reebok/public.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const reebokServer = createClient(
  process.env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.REEBOK_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
);
