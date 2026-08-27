import { NextRequest, NextResponse } from "next/server";
import { requireRole, SessionPayload } from "@/lib/requireRole";
import { alternarFavorito, leerFavoritos } from "@/lib/cxc/anotaciones";
import { carteraDeBody, carteraDeQuery, respuestaSiCarteraAjena, respuestaSiCarteraNoDisponible } from "@/lib/cxc/cartera-http";
import { rolesBoston } from "@/lib/cxc/boston-roles";

/**
 * Favoritos (⭐) del CXC, por usuario **y por CARTERA**.
 *
 * La cartera es OBLIGATORIA en los dos verbos: sin ella, una estrella puesta en
 * Boston aparecería también en el grupo (ver `lib/cxc/cartera.ts`). Las
 * consultas viven en `lib/cxc/anotaciones.ts` — este route no toca la tabla.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;
  const session = auth as SessionPayload;
  const userId = session.userId || session.userName || "default";

  const cartera = carteraDeQuery(req);
  if (cartera instanceof NextResponse) return cartera;
  const ajena = respuestaSiCarteraAjena(session.role, cartera);
  if (ajena) return ajena;

  try {
    return NextResponse.json({ favorites: await leerFavoritos(cartera, userId) });
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error("cxc_favorites GET error:", e);
    return NextResponse.json({ error: "Error al cargar favoritos" }, { status: 500 });
  }
}

/** Toggle. Body: `{ clientName: string, cartera: "grupo" | "boston" }`. */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;
  const session = auth as SessionPayload;
  const userId = session.userId || session.userName || "default";

  let body: { clientName?: string; cartera?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const cartera = carteraDeBody(body);
  if (cartera instanceof NextResponse) return cartera;
  const ajena = respuestaSiCarteraAjena(session.role, cartera);
  if (ajena) return ajena;

  const clientName = body.clientName?.trim();
  if (!clientName) {
    return NextResponse.json({ error: "clientName requerido" }, { status: 400 });
  }

  try {
    const action = await alternarFavorito(cartera, userId, clientName);
    return NextResponse.json({ action, clientName });
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error("cxc_favorites POST error:", e);
    return NextResponse.json({ error: "Error al guardar favorito" }, { status: 500 });
  }
}
