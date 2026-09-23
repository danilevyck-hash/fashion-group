import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { VISTA_TIENDA } from "@/lib/marketing/vista-tienda";
import { leerDatosDeLaTienda } from "./datos";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  // Con el interruptor apagado esta puerta no existe: nada cambia.
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const codigo = String(params.codigo ?? "").trim();
  if (codigo.length === 0 || codigo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  try {
    const datos = await leerDatosDeLaTienda(codigo);
    const res = NextResponse.json(datos);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/tienda:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
