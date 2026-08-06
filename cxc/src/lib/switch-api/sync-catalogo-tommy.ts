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
import { normalizarBultoPzas } from "@/lib/tommy-bulto";
import { tommyServer } from "@/lib/tommy-supabase-server";
import { buildTommyDerivedFields } from "@/lib/tommy-nombres";
import type { SwitchArticulo } from "./client";

/**
 * Piezas por bulto SEGÚN SWITCH (`cantidadPorCaja`).
 *
 * 🩸 DEVUELVE UN OBJETO VACÍO CUANDO NO HAY DATO, y eso es lo importante: hoy
 * `cantidadPorCaja` viene en `0.0000` en los 650 artículos de Tommy (medido
 * 6-ago-2026), así que la columna NO entra en el payload y el sync sigue
 * funcionando aunque la migración 20260806120000 todavía no se haya corrido.
 * Devolver `{ bulto_pzas: null }` habría tumbado el cron del catálogo —que está
 * bajo vigilancia estricta— y encima habría BORRADO lo marcado a mano en cada
 * corrida.
 *
 * Cuando Switch SÍ trae un número, ese número manda: es la fuente del dato, no
 * una segunda opinión sobre lo que alguien marcó en el catálogo.
 */
function bultoDeSwitch(a: { cantidadPorCaja?: string | null }): { bulto_pzas?: number } {
  const n = normalizarBultoPzas(a.cantidadPorCaja);
  return n === null ? {} : { bulto_pzas: n };
}

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
          return { name: d.name, category: d.category, gender: d.gender, ...bultoDeSwitch(a) };
        },
        // 🩸 LA CATEGORÍA TAMBIÉN SE REFRESCA, y esto es un ARREGLO (5-ago-2026).
        // Antes solo se actualizaba el `name` y la categoría quedaba congelada
        // desde el INSERT. Cuando Switch cambiaba la descripción de un artículo,
        // el nombre se corregía y la categoría NO: quedaban contradiciéndose.
        //
        // Medido: **12 de 490 productos** con el nombre diciendo una cosa y la
        // categoría otra. Daniel lo vio filtrando "Sandals" en el catálogo y
        // encontrando cinco pares que se llaman "Women-Flip Flops" (7 casos
        // sandals→flip_flops, 2 flip_flops→slippers, 3 desde sneakers).
        //
        // Para Tommy la categoría NO es manual: se DERIVA de la misma
        // descripción que el nombre. Si se refresca una y la otra no, el filtro
        // del catálogo miente. `nombre_manual` protege solo el NOMBRE —que es lo
        // que el admin edita— no la categoría, que sigue siendo de Switch.
        updateFields: (a, existing) => {
          const d = buildTommyDerivedFields(a.codigo, a.descripcion);
          const cat = { category: d.category, gender: d.gender, ...bultoDeSwitch(a) };
          return existing.nombre_manual === true ? cat : { ...cat, name: d.name };
        },
      },
    },
    opts,
  );
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
