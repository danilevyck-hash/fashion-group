import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { veMarketingNuevo } from "@/lib/marketing/marketing-nuevo";
import { resumenesDeCobro } from "@/lib/marketing/zip-marca";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// GET /api/marketing/cobros — lo que leen Por cobrar, Gastos e Impulsadoras del
// Marketing nuevo. SOLO LEE: una tanda de lecturas, el mismo cálculo del ZIP.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!veMarketingNuevo(auth.role)) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  try {
    return NextResponse.json(await resumenesDeCobro());
  } catch (err) {
    console.error("GET /api/marketing/cobros:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo leer lo que hay por cobrar." }, { status: 500 });
  }
}
