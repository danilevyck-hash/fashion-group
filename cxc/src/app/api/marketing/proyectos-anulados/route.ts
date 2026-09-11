import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import {
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  indiceBloquePorMarcaId,
  type BloqueKey,
} from "@/lib/marketing/bloques";
import { bloqueDeSlug } from "@/lib/marketing/slugs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/marketing/proyectos-anulados?bloque=<código | slug | multifashion>
//
// 🩸 UN PROYECTO ELIMINADO NO SE RECUPERABA DESDE NINGUNA PANTALLA (hasta el
// 11-sep-2026). `anular` es soft delete —la fila se queda con su `anulado_en` y
// su motivo— pero `proyectos-lista` filtra `.is("anulado_en", null)` y la
// pantalla «Anulados» se retiró: la ÚNICA puerta a `papelera/restaurar` era el
// aviso «Deshacer» guardado en `useState`, o sea que bastaba recargar con F5
// para perder el proyecto para siempre. Daniel, textual: *«a) una lista
// "Eliminados" con "Restaurar", como en Guías»*.
//
// 🔑 Es el MISMO camino que las facturas anuladas
// (`proyectos/[id]/facturas-anuladas`), que existe desde el 11-ago por
// exactamente la misma razón. Va APARTE de `proyectos-lista` a propósito: todo
// lo que suma plata lee ESA otra, y un proyecto anulado no es gasto de nadie.
//
// ⚠️ NO restaura nada: solo LISTA. Restaurar sigue siendo
// `POST /api/marketing/papelera/restaurar`, la misma ruta del «Deshacer».
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const bloqueRaw = (url.searchParams.get("bloque") ?? "").trim();

  try {
    const [proyectosRes, marcasRes] = await Promise.all([
      supabaseServer
        .from("mk_proyectos")
        .select("id, nombre, tienda, tienda_codigo, created_at, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
      supabaseServer.from("mk_marcas").select("id, nombre, codigo"),
    ]);
    if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);
    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);

    const proyectos = (proyectosRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      tienda: string | null;
      tienda_codigo: string | null;
      created_at: string | null;
      anulado_en: string | null;
      anulado_motivo: string | null;
    }>;

    if (proyectos.length === 0) return NextResponse.json([]);

    const marcas = (marcasRes.data ?? []) as Array<{ id: string; nombre: string | null; codigo: string | null }>;
    const bloquePedido = bloqueRaw ? bloqueDeSlug(bloqueRaw, marcas) : null;

    // ⚠️ Las facturas de un proyecto anulado vienen anuladas por la CASCADA, así
    // que acá NO se filtra por `anulado_en`: son las que dicen de qué marca era
    // el proyecto. Sin esto, un proyecto eliminado no caería en ningún bloque.
    const ids = proyectos.map((p) => p.id);
    const [factRes, fmRes] = await Promise.all([
      supabaseServer.from("mk_facturas").select("id, proyecto_id").in("proyecto_id", ids),
      supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id"),
    ]);
    if (factRes.error) throw new Error(`facturas: ${factRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);

    const proyectoDeFactura = new Map<string, string>();
    for (const f of (factRes.data ?? []) as Array<{ id: string; proyecto_id: string | null }>) {
      if (f.proyecto_id) proyectoDeFactura.set(String(f.id), String(f.proyecto_id));
    }
    const bloquePorMarca = indiceBloquePorMarcaId(marcas);
    const bloquesDeProyecto = new Map<string, Set<BloqueKey>>();
    for (const r of (fmRes.data ?? []) as Array<{ factura_id: string; marca_id: string }>) {
      const pid = proyectoDeFactura.get(String(r.factura_id));
      if (!pid) continue;
      const bloque = bloquePorMarca.get(String(r.marca_id)) ?? SIN_BLOQUE;
      const set = bloquesDeProyecto.get(pid) ?? new Set<BloqueKey>();
      set.add(bloque);
      bloquesDeProyecto.set(pid, set);
    }

    const salida = proyectos
      .map((p) => {
        const bloques: BloqueKey[] = esMultifashion(p)
          ? [MULTIFASHION_KEY]
          : [...(bloquesDeProyecto.get(String(p.id)) ?? new Set<BloqueKey>([SIN_BLOQUE]))];
        return { ...p, bloques };
      })
      .filter((p) => !bloquePedido || p.bloques.includes(bloquePedido));

    const res = NextResponse.json(salida);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/proyectos-anulados GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
