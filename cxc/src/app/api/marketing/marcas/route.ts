import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { getMarcas } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;

  try {
    const marcas = await getMarcas();
    return NextResponse.json(marcas);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al listar marcas";
    console.error("marketing/marcas GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
