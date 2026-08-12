// Sync del catálogo Calvin Klein (tabla `calvin_products`) desde Switch
// (empresa vistana). Wrapper delgado sobre el motor parametrizado
// `syncCatalogo`, mismo patrón que Tommy (que es su plantilla exacta).
//
// Diferencias con Reebok/Joybees, iguales a Tommy:
//   - FILTRO POR MARCA: vistana es multi-marca en lo contable; el catálogo
//     Calvin = artículos con marcaId === 8 (CK FOOTWEAR) en /apiarticulos.
//     ⚠️ El marcaId es POR EMPRESA: en vistana el 3 es CK Legwear (en
//     fashion_shoes el 3 es Tommy) — el filtro va amarrado a empresaKey
//     vistana + marcaId 8, nunca al número suelto. Medido 12-ago-2026:
//     8.173 artículos en vistana, 616 con marcaId 8, 80 con disponible > 0;
//     barrido completo 103 s (164 páginas) — entra holgado en los 800 s.
//   - NOMBRES DERIVADOS (hook `derive` del motor): Switch trae descripcion
//     genérica ("Women-Sandals", 13 valores reales); el sync arma name =
//     "{Género}-{Categoría}" + llena category/gender con los slugs parseados
//     (lib/calvin-nombres.ts). Si el admin editó el nombre a mano
//     (nombre_manual=true), el sync NO lo pisa (patrón oculto_manual).
//     La categoría SÍ se refresca siempre (lección Tommy 5-ago-2026:
//     congelarla desde el INSERT la dejaba contradiciendo al nombre).
//   - Sin tabla inventory: stock vive en calvin_products.stock (= existencia).
//   - FOTOS: image_url arranca null SIEMPRE; se suben por el admin (portal B2B
//     Dash de PVH, el mismo de Tommy).
//
// TOLERANCIA PRE-DDL (migración 20260812150000 manual, puede tardar): ANTES de
// abrir sesión en Switch se sondea calvin_products; si la tabla no existe aún,
// el sync se OMITE limpio (ddlPendiente=true, sin tocar Switch, sin
// switch_sync_log, sin alerta). Así ni el cron ni la reconciliación hacen
// ruido ni queman la sesión única de vistana mientras la DDL no corra.

import { syncCatalogo, type CatalogoSyncResult } from "./sync-catalogo";
import { normalizarBultoPzas } from "@/lib/calvin-bulto";
import { calvinServer } from "@/lib/calvin-supabase-server";
import { buildCalvinDerivedFields } from "@/lib/calvin-nombres";
import type { SwitchArticulo } from "./client";

/**
 * Piezas por bulto SEGÚN SWITCH (`cantidadPorCaja`).
 *
 * 🩸 DEVUELVE UN OBJETO VACÍO CUANDO NO HAY DATO, y eso es lo importante:
 * `cantidadPorCaja` viene en `0.0000` en los 616 artículos de Calvin (medido
 * 12-ago-2026, igual que en Tommy), así que la columna NO entra en el payload.
 * Devolver `{ bulto_pzas: null }` habría BORRADO lo marcado a mano en cada
 * corrida. Cuando Switch SÍ traiga un número, ese número manda: es la fuente
 * del dato, no una segunda opinión sobre lo que alguien marcó en el catálogo.
 */
function bultoDeSwitch(a: { cantidadPorCaja?: string | null }): { bulto_pzas?: number } {
  const n = normalizarBultoPzas(a.cantidadPorCaja);
  return n === null ? {} : { bulto_pzas: n };
}

const EMPRESAS = [
  { empresaKey: "vistana", categories: [] as const, defaultCategory: "otros" },
] as const;

/** marcaId de CALVIN KLEIN (CK FOOTWEAR) en el Switch de vistana (medido
 *  12-ago-2026). ⚠️ Solo vale para vistana: el marcaId es por empresa. */
export const CALVIN_MARCA_ID = 8;

/** Un artículo entra al catálogo Calvin SOLO si su marcaId es el de CK
 *  FOOTWEAR. Excluye las otras 12 marcas de vistana (CK Legwear, etc.) y la
 *  basura contable, que viene sin esa marca. */
export function isCalvinArticulo(a: SwitchArticulo): boolean {
  return a.marcaId === CALVIN_MARCA_ID;
}

export interface CatalogoCalvinSyncResult extends CatalogoSyncResult {
  /** true = la migración 20260812150000 no ha corrido; el sync se omitió SIN
   *  tocar Switch. Los callers no alertan en este estado. */
  ddlPendiente?: boolean;
}

/** ¿calvin_products existe ya? (probe barato, jamás lanza). OJO: tiene que ser
 *  un SELECT real con limit — un HEAD (head:true) contra una tabla ausente
 *  devuelve ok sin error en PostgREST (verificado contra prod 24-jul-2026) y
 *  daría falso "existe". Exportado: lo reúsa el resumen semanal de fotos
 *  (lib/catalogos/fotos-resumen.ts) para reportar "pendiente de activación". */
export async function calvinDdlPendiente(): Promise<boolean> {
  try {
    const { error } = await calvinServer.from("calvin_products").select("id").limit(1);
    if (!error) return false;
    return /does not exist|schema cache|42P01/i.test(error.message);
  } catch {
    // Probe caído ≠ DDL pendiente: se intenta el sync normal (fail-safe propio).
    return false;
  }
}

export async function syncCatalogoCalvin(
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoCalvinSyncResult> {
  if (await calvinDdlPendiente()) {
    return {
      dryRun: !!opts.dryRun,
      empresas: [
        {
          empresaKey: "vistana",
          switchCount: 0,
          stockChecks: 0,
          actualizados: 0,
          agregados: 0,
          ocultados: 0,
          reactivados: 0,
          nuevosSinFoto: [],
          preciosCambiados: [],
          error:
            "Falta correr la migración 20260812150000 (tablas Calvin) — sync omitido sin tocar Switch",
        },
      ],
      nuevosSinFotoTotal: [],
      hadError: true,
      ddlPendiente: true,
    };
  }

  return syncCatalogo(
    {
      db: calvinServer,
      marca: "calvin",
      syncLogType: "catalogo_calvin",
      productsTable: "calvin_products",
      empresas: EMPRESAS,
      articuloFilter: isCalvinArticulo, // solo marcaId 8 (CK FOOTWEAR en vistana)
      // sin inventoryTable: el stock vive en el producto (patrón Joybees/Tommy)
      stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad, stock: existencia }),
      derive: {
        extraCols: ["nombre_manual"],
        insertFields: (a) => {
          const d = buildCalvinDerivedFields(a.codigo, a.descripcion);
          return { name: d.name, category: d.category, gender: d.gender, ...bultoDeSwitch(a) };
        },
        // La categoría TAMBIÉN se refresca (lección Tommy 5-ago-2026): para
        // Calvin la categoría NO es manual, se DERIVA de la misma descripción
        // que el nombre. `nombre_manual` protege solo el NOMBRE — que es lo que
        // el admin edita — no la categoría, que sigue siendo de Switch.
        updateFields: (a, existing) => {
          const d = buildCalvinDerivedFields(a.codigo, a.descripcion);
          const cat = { category: d.category, gender: d.gender, ...bultoDeSwitch(a) };
          return existing.nombre_manual === true ? cat : { ...cat, name: d.name };
        },
      },
    },
    opts,
  );
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
