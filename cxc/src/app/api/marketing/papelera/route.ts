import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getAnulados } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await getAnulados();
    // Devuelve array directo (el cliente también acepta { items } por retrocompat).
    return NextResponse.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/papelera:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
