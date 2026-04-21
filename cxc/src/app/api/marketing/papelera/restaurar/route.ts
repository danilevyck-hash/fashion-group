import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  restaurarProyecto,
  restaurarFactura,
} from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

type TipoRestaurar = "proyecto" | "factura";

interface RestaurarBody {
  tipo?: unknown;
  id?: unknown;
}

function esTipoValido(t: unknown): t is TipoRestaurar {
  return t === "proyecto" || t === "factura";
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: RestaurarBody;
  try {
    body = (await req.json()) as RestaurarBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tipo = body.tipo;
  const id = body.id;
  if (!esTipoValido(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    if (tipo === "proyecto") await restaurarProyecto(id);
    else await restaurarFactura(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/papelera/restaurar:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
