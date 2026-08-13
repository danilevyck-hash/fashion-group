import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { guardarOverride, leerOverrides } from "@/lib/cxc/anotaciones";
import { carteraDeBody, carteraDeQuery, respuestaSiCarteraNoDisponible } from "@/lib/cxc/cartera-http";

// Overrides de contacto por cliente (cxc_client_overrides), **por CARTERA**.
// Antes el dashboard los leía/escribía client-side con la anon key (fuga: anon
// podía leer datos de contacto de TODOS los clientes vía REST). Ahora pasa por
// acá con service_role tras cerrar la RLS de la tabla. Gate = mismos roles que
// acceden a CXC. La cartera es obligatoria: sin ella, el correo cargado en
// Boston aparecería también en el grupo (ver lib/cxc/cartera.ts).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const cartera = carteraDeQuery(req);
  if (cartera instanceof NextResponse) return cartera;

  try {
    return NextResponse.json(await leerOverrides(cartera));
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error(`[cxc/overrides] ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Error al leer contactos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cartera = carteraDeBody(body);
  if (cartera instanceof NextResponse) return cartera;

  const b = (body ?? {}) as Record<string, unknown>;
  const nombre = typeof b.nombre_normalized === "string" ? b.nombre_normalized.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "nombre_normalized requerido" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  try {
    await guardarOverride(cartera, {
      nombre_normalized: nombre,
      correo: str(b.correo),
      telefono: str(b.telefono),
      celular: str(b.celular),
      contacto: str(b.contacto),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error(`[cxc/overrides] upsert: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Error al guardar contacto" }, { status: 500 });
  }
}
