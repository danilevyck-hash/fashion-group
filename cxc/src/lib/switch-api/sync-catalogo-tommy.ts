// Sync del catálogo Tommy Hilfiger (tabla `tommy_products`) desde Switch
// (empresa fashion_shoes). Wrapper delgado sobre el motor parametrizado
// `syncCatalogo`, mismo patrón que Reebok/Joybees.
//
// Diferencias con las otras marcas:
//   - FILTRO POR MARCA: fashion_shoes es multi-marca en lo contable; el
//     catálogo Tommy = artículos con marcaId === 3 en /apiarticulos (656 arts
//     → 648 Tommy; los 8 excluidos son basura de marketing/ajustes). NO se
//     filtra por proveedor: no discrimina (656/656 mismo importador) —
//     decisión Daniel 24-jul-2026.
//   - NOMBRES DERIVADOS (hook `derive` del motor): Switch trae descripcion
//     genérica ("Women-Flip Flops"); el sync arma name = "{codigo} · {categoría}
//     {género}" + llena category/gender con los slugs parseados
//     (lib/tommy-nombres.ts). Si el admin editó el nombre a mano
//     (nombre_manual=true), el sync NO lo pisa (patrón oculto_manual).
//     category/gender solo se escriben en el INSERT (invariante del motor:
//     category jamás se pisa en UPDATE).
//   - Sin tabla inventory: stock vive en tommy_products.stock (= existencia),
//     igual que Joybees.
//   - FOTOS: image_url arranca null SIEMPRE (las miniaturas de Switch son
//     inservibles — 40% reales y de 2-4KB); se suben por el admin como Reebok.
//
// TOLERANCIA PRE-DDL (migración 20260724150000 manual, puede tardar): ANTES de
// abrir sesión en Switch se sondea tommy_products; si la tabla no existe aún,
// el sync se OMITE limpio (ddlPendiente=true, sin tocar Switch, sin
// switch_sync_log, sin alerta). Así ni el cron ni la reconciliación hacen
// ruido ni queman la sesión única de fashion_shoes mientras la DDL no corra.

import { syncCatalogo, type CatalogoSyncResult } from "./sync-catalogo";
import { tommyServer } from "@/lib/tommy-supabase-server";
import { buildTommyDerivedFields } from "@/lib/tommy-nombres";
import type { SwitchArticulo } from "./client";

const EMPRESAS = [
  { empresaKey: "fashion_shoes", categories: [] as const, defaultCategory: "otros" },
] as const;

/** marcaId de TOMMY en el Switch de fashion_shoes (verificado 24-jul-2026). */
export const TOMMY_MARCA_ID = 3;

/** Un artículo entra al catálogo Tommy SOLO si su marcaId es el de Tommy.
 *  Excluye la basura de marketing/ajustes de fashion_shoes (THERMO,
 *  MERCANCIA DEFECTUOSA, donaciones…), que viene sin esa marca. */
export function isTommyArticulo(a: SwitchArticulo): boolean {
  return a.marcaId === TOMMY_MARCA_ID;
}

export interface CatalogoTommySyncResult extends CatalogoSyncResult {
  /** true = la migración 20260724150000 no ha corrido; el sync se omitió SIN
   *  tocar Switch. Los callers no alertan en este estado. */
  ddlPendiente?: boolean;
}

/** ¿tommy_products existe ya? (probe barato, jamás lanza). OJO: tiene que ser
 *  un SELECT real con limit — un HEAD (head:true) contra una tabla ausente
 *  devuelve ok sin error en PostgREST (verificado contra prod 24-jul-2026) y
 *  daría falso "existe". Exportado: lo reúsa el resumen semanal de fotos
 *  (lib/catalogos/fotos-resumen.ts) para reportar "pendiente de activación". */
export async function tommyDdlPendiente(): Promise<boolean> {
  try {
    const { error } = await tommyServer.from("tommy_products").select("id").limit(1);
    if (!error) return false;
    return /does not exist|schema cache|42P01/i.test(error.message);
  } catch {
    // Probe caído ≠ DDL pendiente: se intenta el sync normal (fail-safe propio).
    return false;
  }
}

export async function syncCatalogoTommy(
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoTommySyncResult> {
  if (await tommyDdlPendiente()) {
    return {
      dryRun: !!opts.dryRun,
      empresas: [
        {
          empresaKey: "fashion_shoes",
          switchCount: 0,
          stockChecks: 0,
          actualizados: 0,
          agregados: 0,
          ocultados: 0,
          reactivados: 0,
          nuevosSinFoto: [],
          preciosCambiados: [],
          error:
            "Falta correr la migración 20260724150000 (tablas Tommy) — sync omitido sin tocar Switch",
        },
      ],
      nuevosSinFotoTotal: [],
      hadError: true,
      ddlPendiente: true,
    };
  }

  return syncCatalogo(
    {
      db: tommyServer,
      marca: "tommy",
      syncLogType: "catalogo_tommy",
      productsTable: "tommy_products",
      empresas: EMPRESAS,
      articuloFilter: isTommyArticulo, // solo marcaId 3 (excluye basura marketing/ajustes)
      // sin inventoryTable: el stock vive en el producto (patrón Joybees)
      stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad, stock: existencia }),
      derive: {
        extraCols: ["nombre_manual"],
        insertFields: (a) => {
          const d = buildTommyDerivedFields(a.codigo, a.descripcion);
          return { name: d.name, category: d.category, gender: d.gender };
        },
        // nombre_manual=true → el admin es dueño del nombre; no se pisa.
        // (undefined pre-migración de la columna cuenta como false.)
        updateFields: (a, existing) =>
          existing.nombre_manual === true
            ? {}
            : { name: buildTommyDerivedFields(a.codigo, a.descripcion).name },
      },
    },
    opts,
  );
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
