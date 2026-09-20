import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchAllProveedorRows, buildList } from "@/lib/proveedores/lista";
import { leerAmarresProveedor } from "@/lib/proveedores/amarre-lectura";
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
    const [rows, amarres, avisoMontos] = await Promise.all([
      fetchAllProveedorRows(),
      // Quién es quién. Falla abierto: sin amarres la lista queda como antes.
      leerAmarresProveedor(),
      lineaDeRechazos({ familias: ["proveedor"] }),
    ]);
    return NextResponse.json({
      ...buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q"), amarres }),
      // 🔴 CUÁNDO SE TRAJO ESTO DE SWITCH. La pantalla no lo decía NUNCA, y es
      // lo primero que pregunta quien mira una cartera de $4,8 millones. Es el
      // `synced_at` más reciente de las filas leídas: la última corrida que
      // dejó algo escrito.
      synced_at: rows.map((r) => r.synced_at).filter(Boolean).sort().reverse()[0] ?? null,
      avisoMontos,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
