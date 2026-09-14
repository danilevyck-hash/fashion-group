// ─────────────────────────────────────────────────────────────────────────────
// LOS OCHO NÚMEROS DEL HUB, EN UNA SOLA RESPUESTA DE MENOS DE 1 KB (14-sep-2026)
//
// 🩸 Para escribir «182 productos a la venta · 12 sin foto» en cuatro tarjetas,
// `/catalogos/marcas` bajaba el CATÁLOGO ENTERO de las cuatro marcas más el
// inventario por talla de Reebok: **462,8 KB medidos** contra producción, y
// **24.384 ms de p95** en Sentry. Nombre, precio, color, descripción y fechas
// viajaban para tirarse después de contar.
//
// Daniel, textual (14-sep-2026): *«5. ok va»*.
//
// 🔴 DOS CAMINOS, UNA SOLA REGLA.
//
//   «base»  — la función `catalogos_contadores_hub()`, cuyo SQL se GENERA desde
//             `lib/catalogo/contadores.ts` cláusula por cláusula de
//             `estaALaVenta`. Es el camino normal.
//   «filas» — lee las filas y cuenta con `contarDeFilas`, que ES
//             `productosALaVenta`. Es el respaldo.
//
// 🔴 FALLA ABIERTA: mientras la migración `20261123120000` no se aplique, la
// función no existe y se toma el camino «filas». El hub se ve EXACTAMENTE igual
// y el navegador igual recibe menos de 1 KB. Ninguna pantalla en blanco.
//
// ⚠️ ESTA RUTA NO REEMPLAZA A NINGUNA. `/api/catalogo/[marca]/products` y
// `/api/catalogo/reebok/inventory` no cambiaron ni de forma ni de permisos: los
// usan el catálogo del vendedor y la pantalla de administrar.
//
// `fuente` viaja en la respuesta para que `scripts/_verif-contadores-hub.ts`
// pueda comprobar que los dos caminos dicen lo mismo contra producción.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { catalogoRoles } from "@/lib/catalogo/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { RPC_CONTADORES } from "@/lib/catalogo/contadores-migracion";
import {
  MARCAS_DEL_HUB,
  columnasParaContar,
  contarDeFilas,
  type ContadoresDelHub,
  type FilaContada,
  type MarcaContada,
} from "@/lib/catalogo/contadores";

export const dynamic = "force-dynamic";
// Igual que el resto del módulo: el contador tiene que reflejar al instante el
// sync y el toggle «Ocultar del catálogo».
export const fetchCache = "force-no-store";

interface FilaRpc {
  marca: string;
  a_la_venta: number | string;
  sin_foto: number | string;
}

/** Camino rápido: los ocho números ya sumados por la base. */
async function porLaBase(): Promise<ContadoresDelHub | null> {
  const { data, error } = await supabaseServer.rpc(RPC_CONTADORES);
  // Sin la migración aplicada esto es un 404 de PostgREST. No se distingue del
  // resto de errores a propósito: ante CUALQUIER problema se cuenta por filas,
  // que es la regla de siempre.
  if (error || !Array.isArray(data)) return null;
  const out: ContadoresDelHub = {};
  for (const f of data as FilaRpc[]) {
    if (!(MARCAS_DEL_HUB as readonly string[]).includes(f.marca)) continue;
    out[f.marca as MarcaContada] = {
      aLaVenta: Number(f.a_la_venta),
      sinFoto: Number(f.sin_foto),
    };
  }
  return out;
}

/** Reebok: su existencia por talla vive en `inventory`, no en la fila. */
async function stockDeReebok(): Promise<Record<string, number>> {
  const { supabase } = await import("@/components/reebok/supabase");
  const filas = await leerTodoPaginado<{ product_id: string; quantity: number }>(
    "inventory (contadores del hub)",
    (pedirCount, desde, hasta) =>
      supabase
        .from("inventory")
        .select("product_id,quantity", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const mapa: Record<string, number> = {};
  for (const i of filas) mapa[i.product_id] = (mapa[i.product_id] || 0) + i.quantity;
  return mapa;
}

/** Respaldo: leer las filas y contar con la regla de siempre. */
async function porLasFilas(marca: MarcaContada) {
  const cfg = getMarcaConfig(marca)!;
  const db = await cfg.products.readDb();
  const filas = await leerTodoPaginado<FilaContada>(
    `${cfg.productsTable} (contadores del hub)`,
    (pedirCount, desde, hasta) =>
      db
        .from(cfg.productsTable)
        .select(columnasParaContar(marca), pedirCount ? { count: "exact" } : {})
        .eq("active", true)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const stock = marca === "reebok" ? await stockDeReebok() : undefined;
  return contarDeFilas(filas, stock);
}

export async function GET(req: NextRequest) {
  // Los MISMOS roles que la pantalla del hub y que `/api/catalogo/[marca]/products`.
  const auth = requireRole(req, catalogoRoles());
  if (auth instanceof NextResponse) return auth;

  const deLaBase = await porLaBase();
  if (deLaBase && Object.keys(deLaBase).length === MARCAS_DEL_HUB.length) {
    return NextResponse.json({ contadores: deLaBase, fuente: "base" });
  }

  const contadores: ContadoresDelHub = {};
  // Las cuatro marcas en paralelo: una que falle no deja a las otras sin número
  // (la tarjeta de esa marca dirá «Contadores no disponibles», como hoy).
  const resultados = await Promise.allSettled(MARCAS_DEL_HUB.map((m) => porLasFilas(m)));
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") contadores[MARCAS_DEL_HUB[i]] = r.value;
    else console.error(`contadores del hub · ${MARCAS_DEL_HUB[i]}`, r.reason);
  });
  return NextResponse.json({ contadores, fuente: "filas" });
}
