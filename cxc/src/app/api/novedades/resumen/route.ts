// ─────────────────────────────────────────────────────────────────────────────
// GET /api/novedades/resumen — la lista de avisos y quién ya la cerró.
//
// Es la mitad del encargo que `localStorage` no podía contestar: Daniel quiere
// **ver la lista** y **saber cuántas personas ya la vieron**. Vive en Usuarios ›
// Novedades, no en un módulo nuevo.
//
// 🔴 SOLO ADMIN. Dice qué leyó cada persona; no es dato de trabajo de nadie más.
//
// ⚠️ Mientras la DDL `20261024120000` no corra, la tabla no existe: contesta la
// lista completa con `vieron: []` en cada una y lo DICE (`tablaLista: false`),
// para que la pantalla no muestre «0 personas» como si fuera un dato.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { NOVEDADES } from "@/lib/novedades/lista";
import { estaVigente } from "@/lib/novedades/seleccion";
import { ALL_MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("novedades_vistas")
    .select("novedad_id, usuario_nombre, visto_en")
    .order("visto_en", { ascending: true });

  const tablaLista = !error;
  const porNovedad = new Map<string, string[]>();
  for (const fila of data ?? []) {
    const id = fila.novedad_id as string;
    const quien = (fila.usuario_nombre as string) || "—";
    const lista = porNovedad.get(id) ?? [];
    if (!lista.includes(quien)) lista.push(quien);
    porNovedad.set(id, lista);
  }

  const hoy = hoyPanama();
  const rotulo = new Map(ALL_MODULES.map((m) => [m.key, m.label]));

  return NextResponse.json({
    tablaLista,
    hoy,
    novedades: NOVEDADES.map((n) => ({
      ...n,
      // El nombre que la persona ve en el menú, no la key.
      moduloLabel: rotulo.get(n.modulo) ?? n.modulo,
      vigente: estaVigente(n, hoy),
      vieron: porNovedad.get(n.id) ?? [],
    })),
  });
}
