import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchAllProveedorRows } from "@/lib/proveedores/lista";
import { buildPorEmpresa } from "@/lib/proveedores/por-empresa";
import { leerAmarresProveedor } from "@/lib/proveedores/amarre-lectura";
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";

export const dynamic = "force-dynamic";

/**
 * 🔴 LA CARTERA DE CxP, POR EMPRESA (20-sep-2026). Las siete empresas con sus
 * proveedores adentro, los cuatro tramos de edad y el total al pie.
 *
 * ⚠️ Ya no acepta `?empresa=` ni `?q=`: la lista no se filtra. Manda el grupo
 * entero y la pantalla despliega la empresa que se toque — Daniel: *«¿por qué
 * buscar proveedor si ya está todo en la lista? solo es desplegar»*. Un enlace
 * viejo con esos parámetros sigue contestando 200 con la cartera completa.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // En paralelo: el aviso es una consulta acotada y no puede sumarle latencia
    // en serie a la lista. Falla al silencio, así que no puede tumbar la ruta.
    const [rows, amarres, avisoMontos] = await Promise.all([
      fetchAllProveedorRows(),
      // Quién es quién. Falla abierto: sin amarres la lista queda como antes.
      leerAmarresProveedor(),
      lineaDeRechazos({ familias: ["proveedor"] }),
    ]);
    return NextResponse.json({
      // `synced_at` viaja adentro: es la última corrida que dejó algo escrito, y
      // la pantalla lo dice arriba («Actualizado: …»).
      ...buildPorEmpresa(rows, amarres),
      avisoMontos,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
