// ─────────────────────────────────────────────────────────────────────────────
// «YA SALIÓ EN GT-xxx» — la lectura del índice, en UN solo lugar (1-oct-2026).
//
// Lo leen DOS puertas y tienen que decir lo mismo:
//   · `GET /api/guias/facturas-cliente` — el chip «Ya salió en GT-xxx» de Nueva
//     guía y la lista de facturas de Etiquetas;
//   · `crearEnvio` (`POST /api/guias/etiquetas`) — el servidor no deja etiquetar
//     una factura que ya salió en una guía (🩸 la 3097 y la 3096).
// La REGLA es `indiceYaSalio` / `yaSalioEn` (`atajos-facturas.ts`, pura): esto
// solo trae los renglones vivos de guías vivas. Paginado con orden estable —
// db-max-rows corta en 1000 EN SILENCIO—. Lanza si la base falla: cada puerta
// decide cómo fallar (las dos fallan ABIERTAS).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { indiceYaSalio, type RenglonVivo } from "@/lib/guias/atajos-facturas";

interface GuiaVivaFila {
  numero: number;
  guia_items: Array<{ empresa: string | null; facturas: string | null; deleted: boolean | null }> | null;
}

export async function leerIndiceYaSalio(): Promise<Map<string, number>> {
  const guias = await leerTodoPaginado<GuiaVivaFila>(
    "guia_transporte (ya salió en otra guía)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("guia_transporte")
        .select("numero, guia_items(empresa, facturas, deleted)", pedirCount ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const renglones: RenglonVivo[] = [];
  for (const g of guias) {
    for (const it of g.guia_items ?? []) {
      // ⚠️ guia_items tiene su PROPIO `deleted`, independiente del de la
      // cabecera: filtrar solo la guía deja pasar renglones borrados.
      if (it.deleted) continue;
      renglones.push({ empresa: it.empresa, facturas: it.facturas, guiaNumero: g.numero });
    }
  }
  return indiceYaSalio(renglones);
}
