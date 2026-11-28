import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { leerVistaGeneralHoy } from "@/lib/vista-general/hoy-server";

export const dynamic = "force-dynamic";

/** Vista general «HOY» (27-nov-2026). Solo admin, como la de antes. Solo lee. */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await leerVistaGeneralHoy());
}
