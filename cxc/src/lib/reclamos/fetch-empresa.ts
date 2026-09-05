// ─────────────────────────────────────────────────────────────────────────────
// LA ÚNICA LECTURA DE «LOS RECLAMOS DE ESTA EMPRESA» PARA EL EXCEL, EL PDF Y EL
// CORREO AL PROVEEDOR.
//
// 🩸 Había DOS funciones con este mismo nombre —una en `excel-bulk.ts` y otra en
// `pdf-bulk.ts`— y no hacían lo mismo: la del PDF filtraba `deleted = false` y
// la del Excel NO. O sea que un reclamo borrado no salía en el PDF pero sí en el
// Excel que se le manda al proveedor. Ahora es una sola, y filtra.
//
// El `select` trae `reclamo_settlements` (lo necesita el PDF para el bloque de
// recuperación) y `proveedor_codigo`; al Excel le sobran y no le estorban.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

export interface BulkSelector {
  reclamo_ids?: string[];
  all_with_filter?: { tab?: string; search?: string };
}

const SELECT = "*, reclamo_items(*), reclamo_fotos(*), reclamo_settlements(*)";

export async function fetchReclamosForEmpresa<T>(
  empresa: string,
  sel: BulkSelector,
): Promise<T[]> {
  if (sel.reclamo_ids && sel.reclamo_ids.length > 0) {
    const { data, error } = await supabaseServer
      .from("reclamos")
      .select(SELECT)
      .eq("empresa", empresa)
      .eq("deleted", false)
      .in("id", sel.reclamo_ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Error al cargar reclamos");
    return (data as T[]) || [];
  }

  if (sel.all_with_filter) {
    const tab = sel.all_with_filter.tab || "all";
    const search = (sel.all_with_filter.search || "").trim();
    let query = supabaseServer
      .from("reclamos")
      .select(SELECT)
      .eq("empresa", empresa)
      .eq("deleted", false)
      .order("created_at", { ascending: false });
    if (tab !== "all") query = query.eq("estado", tab);
    if (search) {
      const escaped = search.replace(/[%_,]/g, "\\$&");
      query = query.or(`nro_reclamo.ilike.%${escaped}%,nro_factura.ilike.%${escaped}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error("Error al cargar reclamos");
    return (data as T[]) || [];
  }

  return [];
}
