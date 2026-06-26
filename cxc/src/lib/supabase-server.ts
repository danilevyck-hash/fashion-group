import { createClient } from "@supabase/supabase-js";

/** true si la service role key está presente en este entorno. Las tablas con
 *  RLS `to service_role` (ej. marca_formulas, carga_history) SOLO se leen/escriben
 *  con esta clave; sin ella, la lectura cae al rol anon y RLS devuelve [] EN
 *  SILENCIO. Los routes lo usan para fallar ruidosamente en vez de mostrar vacío. */
export const HAS_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lecturas server-side siempre vivas: evita que el Data Cache de Next.js devuelva
// resultados viejos (ej. [] cacheado antes de poblar la tabla) sin tocar la DB.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const supabaseServer = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
);
