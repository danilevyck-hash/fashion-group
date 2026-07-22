import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";
import { MARCA_CATALOGO, marcaKey } from "@/lib/depurador/logic";

export const dynamic = "force-dynamic";

// Aprobar descripciones nuevas: admin y secretaria.
const ALLOWED = ["admin", "secretaria"];

const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: no se pueden aprobar descripciones." },
  { status: 503 }
);

/**
 * Aprueba una descripción nueva y la agrega al catálogo (depurador_descripciones)
 * con origen = 'aprobada' + auditoría de quién y cuándo.
 *
 * Body: { marca, descripcion }. La marca se valida contra MARCA_CATALOGO (y se
 * guarda con su forma canónica); la descripción se normaliza en espacios (NFKC,
 * colapsa múltiples, trim) pero conserva su caja original — la unicidad la da
 * el índice lower(marca), lower(descripcion). Idempotente: si ya existe,
 * responde ok sin error.
 */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const marcaRaw = String(body.marca ?? "").trim();
  // Misma normalización de espacios que marcaKey, pero conservando la caja.
  const descripcion = String(body.descripcion ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

  if (!marcaRaw) return NextResponse.json({ error: "La marca es obligatoria." }, { status: 400 });
  if (!descripcion) return NextResponse.json({ error: "La descripción es obligatoria." }, { status: 400 });

  // Solo marcas del catálogo fijo (CK/TH/KL) — se guarda la forma canónica.
  const canon = MARCA_CATALOGO.find((c) => marcaKey(c.marca) === marcaKey(marcaRaw));
  if (!canon) {
    return NextResponse.json({ error: `La marca "${marcaRaw}" no está en el catálogo de marcas.` }, { status: 400 });
  }

  const { error } = await supabaseServer.from("depurador_descripciones").insert({
    marca: canon.marca,
    descripcion,
    activa: true,
    origen: "aprobada",
    aprobada_por: session.userName || session.role || null,
    aprobada_at: new Date().toISOString(),
  });

  if (error) {
    // 23505 = ya existe (índice único lower/lower) → idempotente, ok sin error.
    if (error.code === "23505") return NextResponse.json({ ok: true, yaExistia: true });
    return NextResponse.json({ error: "No se pudo aprobar la descripción. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
