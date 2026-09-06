// GET /api/guias/despachos-frecuentes?transportista=<uuid>
//
// Los juegos (recibido por + cédula + placa) que MÁS SE USAN con ese
// transportista, para ofrecerlos de un toque en la pantalla de despacho.
//
// Daniel: *«normalmente mandamos con las mismas 3/4 compañías. Y los que varían
// a veces son los choferes. Que tenga memoria guía para mostrar los más
// frecuentes.»* — de ahí el nombre de la ruta: **frecuentes**, no recientes.
// Medido, no son lo mismo: ordenar por frecuencia da otro resultado que ordenar
// por fecha en los 6 transportistas de producción.
//
// La regla —qué es un juego, cómo se agrupan y cómo se ordenan— vive en el
// módulo PURO `@/lib/guias/juegos-despacho`; acá solo está el I/O.
//
// ⚠️ SIN TRANSPORTISTA NO HAY NADA QUE OFRECER, y eso incluye la entrega
// directa: sale en nuestro propio camión, no tiene transportista ni placa.
// Devuelve la lista vacía en vez de un error — la pantalla simplemente no
// dibuja el bloque.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { juegosMasFrecuentes, JUEGOS_VISIBLES } from "@/lib/guias/juegos-despacho";

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
    // 🔴 SE TRAE **TODA** LA HISTORIA DE ESE TRANSPORTISTA, no una ventana.
    // Contar frecuencias sobre las N más recientes daría un "más usado" que
    // depende de dónde se corte — que es la versión disimulada de ordenar por
    // fecha. El más cargado de producción tiene 47 guías, así que el volumen no
    // es problema; el `limit` alto es solo un tope de seguridad.
    const { data, error } = await supabaseServer
      .from("guia_transporte")
      .select("estado, fecha, numero, deleted, receptor_nombre, cedula, placa")
      .eq("transportista_id", transportista)
      .eq("deleted", false)
      // «Rechazada» se retiró (5-sep-2026, Daniel: *«quitarlo»*): 0 filas en toda
      // la historia y ya no hay forma de crear ese estado.
      .eq("estado", "Completada")
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    return NextResponse.json({ juegos: juegosMasFrecuentes(data ?? [], JUEGOS_VISIBLES) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[api/guias/despachos-frecuentes] GET:", message);
    // Falla ABIERTA: sin sugerencias la pantalla funciona igual que siempre —
    // los tres campos se escriben a mano. Devolver 500 pintaría un error por
    // una comodidad.
    return NextResponse.json({ juegos: [] });
  }
}
