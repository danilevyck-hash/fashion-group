import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchAllProveedorRows, buildList } from "@/lib/proveedores";
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";

export const dynamic = "force-dynamic";

// Lista de proveedores agrupada (CxP). ?empresa= filtra; ?q= busca por nombre.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    // En paralelo: el aviso es una consulta acotada y no puede sumarle latencia
    // en serie a la lista. Falla al silencio, así que no puede tumbar la ruta.
    const [rows, avisoMontos] = await Promise.all([
      fetchAllProveedorRows(),
      lineaDeRechazos({ familias: ["proveedor"] }),
    ]);
    return NextResponse.json({
      ...buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q") }),
      avisoMontos,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
