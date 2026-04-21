import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  cerrarProyecto,
  generarCobranzasBorradorAlCerrar,
} from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    await cerrarProyecto(params.id);
    const cobranzas = await generarCobranzasBorradorAlCerrar(params.id);
    return NextResponse.json({
      ok: true,
      cobranzasCreadas: cobranzas.length,
      cobranzas,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo cerrar el proyecto";
    console.error("marketing/proyectos/[id]/cerrar POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
