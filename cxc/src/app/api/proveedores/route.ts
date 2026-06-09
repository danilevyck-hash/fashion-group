import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchAllProveedorRows, buildList } from "@/lib/proveedores";

export const dynamic = "force-dynamic";

// Lista de proveedores agrupada (CxP). ?empresa= filtra; ?q= busca por nombre.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const rows = await fetchAllProveedorRows();
    return NextResponse.json(buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q") }));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
