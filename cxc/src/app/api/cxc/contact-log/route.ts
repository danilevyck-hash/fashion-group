import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { leerContactLog, registrarContacto } from "@/lib/cxc/anotaciones";
import { carteraDeBody, carteraDeQuery, respuestaSiCarteraNoDisponible } from "@/lib/cxc/cartera-http";

// Bitácora de contactos de cobro (cxc_contact_log), **por CARTERA**. GET =
// últimos 2000 de esa cartera (para el "último contacto" por cliente); POST =
// registrar un contacto. La cartera es obligatoria: sin ella, una llamada
// anotada en Boston aparecería también en el grupo (ver lib/cxc/cartera.ts).
// Las consultas viven en lib/cxc/anotaciones.ts — este route no toca la tabla.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const cartera = carteraDeQuery(req);
  if (cartera instanceof NextResponse) return cartera;

  try {
    return NextResponse.json(await leerContactLog(cartera));
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error(`[cxc/contact-log] ${e instanceof Error ? e.message : String(e)}`);
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
  const method = typeof b.method === "string" ? b.method.trim() : "";
  if (!nombre || !method) {
    return NextResponse.json({ error: "nombre_normalized y method requeridos" }, { status: 400 });
  }

  try {
    await registrarContacto(cartera, nombre, method);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error(`[cxc/contact-log] insert: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Error al registrar contacto" }, { status: 500 });
  }
}
