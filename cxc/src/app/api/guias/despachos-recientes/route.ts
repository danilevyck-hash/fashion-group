// GET /api/guias/despachos-recientes?transportista=<uuid>
//
// Los últimos juegos (recibido por + cédula + placa) usados con ESE
// transportista, para ofrecerlos de un toque en la pantalla de despacho. La
// regla —qué es un juego, cómo se ordenan y cómo se deduplican— vive en el
// módulo PURO `@/lib/guias/juegos-despacho`; acá solo está el I/O.
//
// ⚠️ SIN TRANSPORTISTA NO HAY NADA QUE OFRECER, y eso incluye la entrega
// directa: sale en nuestro propio camión, no tiene transportista ni placa.
// Devuelve la lista vacía en vez de un error — la pantalla simplemente no
// dibuja el bloque.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { juegosRecientes, JUEGOS_VISIBLES } from "@/lib/guias/juegos-despacho";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUIAS_ROLES = ["admin", "secretaria", "bodega", "vendedor"];

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !GUIAS_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const transportista = (req.nextUrl.searchParams.get("transportista") ?? "").trim();
  if (!transportista) return NextResponse.json({ juegos: [] });
  if (!UUID_RE.test(transportista)) {
    return NextResponse.json({ error: "Transportista inválido" }, { status: 400 });
  }

  try {
    // Acotado en el servidor: solo las guías de ESE transportista y solo las
    // que ya salieron. Se piden las 60 más recientes — de ahí salen 3 juegos
    // distintos de sobra (la placa que más se repite lo hace 11 veces) y evita
    // traerse la tabla entera en cada apertura de la pantalla de despacho.
    const { data, error } = await supabaseServer
      .from("guia_transporte")
      .select("estado, fecha, numero, deleted, receptor_nombre, cedula, placa")
      .eq("transportista_id", transportista)
      .eq("deleted", false)
      .in("estado", ["Completada", "Rechazada"])
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    return NextResponse.json({ juegos: juegosRecientes(data ?? [], JUEGOS_VISIBLES) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[api/guias/despachos-recientes] GET:", message);
    // Falla ABIERTA: sin sugerencias la pantalla funciona igual que siempre —
    // los tres campos se escriben a mano. Devolver 500 pintaría un error por
    // una comodidad.
    return NextResponse.json({ juegos: [] });
  }
}
