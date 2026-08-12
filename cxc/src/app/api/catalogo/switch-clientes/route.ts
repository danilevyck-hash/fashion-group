// GET /api/catalogo/switch-clientes?marca=<marca> — directorio de clientes de la
// instancia Switch de la marca, desde la tabla switch_clientes (sincronizada a
// diario por el sync de estado de cuenta — NO toca la API de Switch). Lo usa el
// selector de cliente del checkout; Contado (id 1) es una opción más.
//
// 🩸 LA EMPRESA SE DERIVA DE `MARCAS_CONFIG`, NO SE ESCRIBE A MANO (12-ago-2026).
// El mapa era un literal con reebok/joybees/tommy y cuando entró Calvin nadie lo
// tocó: `?marca=calvin` respondía 400, la lista salía VACÍA y —como el checkout
// sigue igual sin poder elegir— TODO pedido de Calvin se iba a Contado sin forma
// de cambiarlo. Es el mismo modo de fallo que ya había pasado con el vendedor de
// Tommy. Derivado, la quinta marca aparece sola y no puede repetirlo.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { EMPRESA_POR_MARCA, MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";

export const dynamic = "force-dynamic";

/** Quien arma pedidos en CUALQUIER marca puede leer su directorio (el guard
 *  fino, por marca, lo hace /api/catalogo/[marca]/clientes-switch). */
const ROLES = clienteSwitchRoles(
  Array.from(new Set(Object.values(MARCAS_CONFIG).flatMap((m) => m.createRoles))),
);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const empresa = EMPRESA_POR_MARCA[req.nextUrl.searchParams.get("marca") || ""];
  if (!empresa) return NextResponse.json({ error: "marca inválida" }, { status: 400 });

  // ⚠️ PAGINADO (26-jul-2026): switch_clientes tiene 1.710 filas y esta lectura
  // se cortaba en 1.000 SIN error. Como venía ordenada por nombre, lo que se
  // perdía era siempre la cola del alfabeto: los clientes de la Q en adelante no
  // aparecían en el selector del checkout y no había forma de elegirlos.
  // El orden alfabético de la UI se CONSERVA tal cual (misma collation de
  // Postgres que antes) y se le agrega `cliente_switch_id` como desempate:
  // paginar necesita un orden único, pero re-ordenar en memoria cambiaría el
  // criterio de comparación y con él el orden que ve el usuario.
  type FilaCliente = { cliente_switch_id: number; codigo: string | null; nombre: string | null };
  let filas: FilaCliente[];
  try {
    filas = await leerTodoPaginado<FilaCliente>(
      `switch_clientes (${empresa})`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_clientes")
          .select("cliente_switch_id, codigo, nombre", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", empresa)
          .order("nombre", { ascending: true })
          .order("cliente_switch_id", { ascending: true })
          .range(desde, hasta),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  return NextResponse.json({
    clientes: filas.map((c) => ({ id: c.cliente_switch_id, codigo: c.codigo, nombre: c.nombre })),
  });
}
