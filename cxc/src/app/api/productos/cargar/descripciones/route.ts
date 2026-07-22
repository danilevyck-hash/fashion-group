import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// Cualquiera con acceso al módulo (admin + secretaria) puede leer el catálogo.
const ALLOWED = ["admin", "secretaria"];

// Columnas reales de depurador_descripciones (select explícito, regla del repo).
const COLS = "id, marca, descripcion, activa, origen, aprobada_por, aprobada_at, created_at";

const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: el catálogo de descripciones no se puede leer." },
  { status: 503 }
);

/**
 * Catálogo de descripciones por marca (tabla depurador_descripciones — la
 * fuente de verdad; reemplazó la constante MARCA_DESCRIPCIONES).
 *
 * - Default: { catalogo: { marca: [descripciones ACTIVAS] } } — lo consumen
 *   Depurador, Facturas Tienda, fórmulas y reglas.
 * - ?admin=1 (SOLO admin): { rows: [...] } con todas las filas (activas e
 *   inactivas) y su metadata (origen, quién aprobó, cuándo) para la vista admin.
 */
export async function GET(req: NextRequest) {
  const adminView = req.nextUrl.searchParams.get("admin") === "1";
  const authError = requireAuth(req, adminView ? ["admin"] : ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const { data, error } = await supabaseServer
    .from("depurador_descripciones")
    .select(COLS)
    .order("marca", { ascending: true })
    .order("descripcion", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "No se pudo cargar el catálogo de descripciones." }, { status: 500 });
  }

  if (adminView) return NextResponse.json({ rows: data ?? [] });

  const catalogo: Record<string, string[]> = {};
  for (const r of data ?? []) {
    if (!r.activa) continue;
    (catalogo[r.marca] ??= []).push(r.descripcion);
  }
  return NextResponse.json({ catalogo });
}
