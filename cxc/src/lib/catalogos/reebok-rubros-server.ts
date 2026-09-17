// ─────────────────────────────────────────────────────────────────────────────
// LAS CATEGORÍAS DEL CATÁLOGO REEBOK — la parte que TOCA LA BASE
// (`reebok_rubro_categoria`, migración `20261205120000`).
//
// Tres lectores, y los tres con el MISMO mapa:
//   · el SYNC del catálogo (`sync-catalogo-reebok.ts`), que clasifica;
//   · el aviso de la **Plantilla Switch**, que decide si grita o se calla; y
//   · la pantalla **Catálogos › Reebok › Categorías del catálogo**, que lo edita.
//
// 🔴 **FALLA ABIERTA.** `leerMapaDeRubros` NUNCA lanza: sin tabla, sin
// migración o con la base callada devuelve `CATEGORIA_POR_RUBRO_BASE` —las seis
// reglas del código— y el catálogo clasifica exactamente igual que ayer. Un
// problema de base no puede dejar productos sin cajón: el cajón neutro es lo que
// cambia el bulto de 12 a 6, y eso es plata.
//
// 🔴 NUNCA DELETE. Quitar = `activo = false` + quién y cuándo (soft delete
// firmado, el mismo patrón que `guias_destino_lista` y `comision_exclusion`).
// Hay CHECK en la tabla que exige la firma.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIA_POR_RUBRO_BASE, type CategoriaReebok } from "@/lib/reebok-clasificacion";
import {
  MIGRACION_RUBROS_REEBOK,
  TABLA_RUBROS_REEBOK,
  mapaDeRubros,
  yaEstaElRubro,
  type RubroDelCatalogo,
} from "@/lib/catalogos/reebok-rubros";

/**
 * 🔑 Import DINÁMICO, por la misma razón que `cargarFichas` en
 * `sync-catalogo-reebok.ts`: **importar este módulo NUNCA puede construir un
 * cliente de Supabase.** El arnés de paridad de catálogos mockea los clients por
 * archivo de test, y un import eager arrastraría el client real —sin env,
 * `throw`— a tests que no tienen por qué saber que acá se lee una tabla más.
 */
const db = async () => (await import("@/lib/supabase-server")).supabaseServer;

const esTablaAusente = (code: string | undefined, message: string | undefined): boolean =>
  code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(message ?? "");

/** Las filas ACTIVAS, las más viejas primero. Lanza si la base falla. */
async function leerFilasActivas(): Promise<RubroDelCatalogo[]> {
  const { data, error } = await (await db())
    .from(TABLA_RUBROS_REEBOK)
    .select("id, rubro, categoria, creado_por, creado_en")
    .eq("activo", true)
    .order("id", { ascending: true });
  if (error) {
    const e = new Error(`${TABLA_RUBROS_REEBOK}: ${error.message}`);
    (e as Error & { tablaAusente?: boolean }).tablaAusente = esTablaAusente(error.code, error.message);
    throw e;
  }
  return (data ?? []) as RubroDelCatalogo[];
}

/**
 * 🔴 EL MAPA `rubro → categoría` QUE USA LA CLASIFICACIÓN. **No lanza nunca.**
 *
 * Ante cualquier problema —tabla ausente, red caída, filas vacías— devuelve la
 * red del código. Es la misma decisión que toma `cargarFichas` con las fichas de
 * Switch: ante la duda, el sistema conserva y no reclasifica a ciegas.
 */
export async function leerMapaDeRubros(): Promise<Readonly<Record<string, CategoriaReebok>>> {
  try {
    return mapaDeRubros(await leerFilasActivas());
  } catch (e) {
    console.error(`[reebok_rubros] no pude leer el mapa, uso el del código: ${String(e)}`);
    return CATEGORIA_POR_RUBRO_BASE;
  }
}

/** Las filas activas con su id — para la pantalla. Lanza si falla. */
export async function leerRubrosConfigurados(): Promise<RubroDelCatalogo[]> {
  return leerFilasActivas();
}

export type ResultadoAltaRubro =
  | { ok: true; id: number }
  | { ok: false; status: 409 | 500 | 503; error: string };

const AVISO_MIGRACION = `Falta correr la migración de ${TABLA_RUBROS_REEBOK} (${MIGRACION_RUBROS_REEBOK})`;
const NO_SE_PUDO_GUARDAR = "No se pudo guardar. Intenta de nuevo en unos segundos.";

/**
 * Agrega un rubro al mapa.
 *
 * 🔴 El repetido se rechaza por igualdad exacta normalizada, **jamás por
 * parecido**: «T-SHIRTS» no entra dos veces, y «T-SHIRT» (singular) es OTRO
 * rubro porque Switch lo mandaría distinto.
 */
export async function agregarRubro(
  rubro: string,
  categoria: CategoriaReebok,
  creadoPor: string,
): Promise<ResultadoAltaRubro> {
  let activos: RubroDelCatalogo[];
  try {
    activos = await leerFilasActivas();
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: NO_SE_PUDO_GUARDAR };
  }
  if (yaEstaElRubro(rubro, activos.map((f) => f.rubro))) {
    return { ok: false, status: 409, error: "Ese rubro ya está en la lista" };
  }

  const { data, error } = await (await db())
    .from(TABLA_RUBROS_REEBOK)
    .insert({ rubro, categoria, creado_por: creadoPor })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "Ese rubro ya está en la lista" };
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: NO_SE_PUDO_GUARDAR };
  }
  return { ok: true, id: Number((data as { id: number }).id) };
}

export type ResultadoBajaRubro =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

/** Quita un rubro del mapa: SOFT DELETE FIRMADO. La fila se queda. */
export async function desactivarRubro(
  id: number,
  desactivadoPor: string,
): Promise<ResultadoBajaRubro> {
  const { data, error } = await (await db())
    .from(TABLA_RUBROS_REEBOK)
    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    return { ok: false, status: 500, error: "No se pudo quitar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese rubro ya no está en la lista" };
  }
  return { ok: true };
}
