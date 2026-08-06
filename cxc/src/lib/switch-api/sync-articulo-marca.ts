// ─────────────────────────────────────────────────────────────────────────────
// Sync del diccionario articulo_id → MARCA → `switch_articulo_marca`.
//
// Alimenta el agrupador "por marca" de Multifashion › Productos. La tabla de
// ventas (`switch_articulo_diario`) NO sabe de marcas: su `descripcion` es
// categoría+género ("Men-Sneakers"). La marca vive en el catálogo de Switch.
//
// ── LOS DOS ENDPOINTS, Y POR QUÉ HACEN FALTA LOS DOS (medido 6-ago-2026) ─────
//   · `/apiarticulos/lista` → `marcaId` en el 100% de los 9.126 artículos de
//     american_classic, 33 marcaId distintos. Pero NO trae el nombre.
//   · `/apiarticulos/info?codigoBarra=…` → sí trae `marca` (el nombre), pero de
//     a UN artículo. Resolver 9.126 artículos por acá serían 9.126 requests.
//
// Por eso: la LISTA se barre entera (id → marcaId, ~183 páginas de 50) y a
// `/info` se le pregunta SOLO por los marcaId cuyo nombre todavía no se conoce
// —33 la primera vez, 0 en régimen— usando un artículo cualquiera de esa marca
// como representante. El nombre de una marca no cambia; el catálogo sí crece.
//
// ⚠️ LA MARCA NO SE ADIVINA. Si un artículo no aparece en el catálogo, o su
// marcaId no se pudo traducir, la fila NO se escribe y el módulo lo muestra
// como "Sin marca". Parsear el código del proveedor para deducir la marca sería
// inventar un dato de negocio.
//
// ── ESCRITURA CONSERVADORA ──────────────────────────────────────────────────
// Es UPSERT, nunca DELETE: un artículo que Switch deja de listar (descatalogado)
// conserva su marca, porque sus ventas VIEJAS se siguen consultando. Y si el
// barrido falla a mitad de camino, lo ya escrito queda — el diccionario es
// aditivo, no un espejo.
// ─────────────────────────────────────────────────────────────────────────────

import { createSwitchClient } from "./client";
import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";

/** Paginación real del endpoint: manda ~50 aunque se pida más. Se deja el
 *  pedido en 50 para no mentirle al corte. */
const PER_PAGE = 50;

/** Cota de páginas. american_classic mide 183 (9.126 artículos, 6-ago-2026);
 *  400 deja más del doble de aire y frena un servidor que pagine para siempre.
 *  Si se alcanza, se reporta como error en vez de escribir a medias. */
const MAX_PAGES = 400;

/**
 * ¿Existe ya la tabla? En este proyecto las DDL se aplican A MANO en el SQL
 * Editor, así que entre el deploy y la corrida del SQL hay días en que la tabla
 * no está. Sin esta sonda, el sync barrería las ~183 páginas del catálogo de
 * Switch TODOS LOS DÍAS para después reventar en el upsert: un minuto de
 * llamadas a Switch tiradas, y una sesión abierta contra la empresa para nada.
 *
 * Fail-CERRADO a propósito: cualquier otro error de lectura (base caída, red)
 * también corta antes de tocar Switch. Postergar el diccionario un día no le
 * hace nada a nadie — el agrupador por marca muestra "Sin marca" y lo dice.
 */
async function tablaLista(empresaKey: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from("switch_articulo_marca")
    .select("articulo_id")
    .eq("empresa_key", empresaKey)
    .limit(1);
  return !error;
}

export interface ArticuloMarcaSyncResult {
  empresaKey: string;
  /** `false` = la tabla todavía no existe y no se le pidió NADA a Switch. */
  tablaLista: boolean;
  /** Artículos leídos del catálogo de Switch. */
  articulos: number;
  /** Filas escritas (upsert). */
  filas: number;
  /** marcaId distintos vistos en el catálogo. */
  marcas: number;
  /** marcaId que hubo que traducir a nombre en esta corrida. */
  nombresResueltos: number;
  /** marcaId que quedaron SIN nombre (el /info no respondió o vino vacío). */
  marcasSinNombre: number[];
}

/** Lo ya sabido: marcaId → nombre, tomado de lo que la tabla YA tiene. Evita
 *  volver a preguntarle a Switch por marcas que ya se tradujeron. */
async function nombresConocidos(empresaKey: string): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  // Son ≤ decenas de marcas: se leen los distintos con una consulta acotada.
  // No usa leerTodoPaginado porque no necesita TODAS las filas — necesita un
  // representante por marca, y con 1.000 filas cualquiera alcanza para eso...
  // salvo que las 1.000 primeras sean todas de la misma marca. Por eso se
  // pagina igual, pero cortando apenas se cubren todas las marcas conocidas.
  for (let p = 0; p < 20; p++) {
    const { data, error } = await supabaseServer
      .from("switch_articulo_marca")
      .select("marca_id, marca_nombre")
      .eq("empresa_key", empresaKey)
      .not("marca_nombre", "is", null)
      .order("articulo_id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`switch_articulo_marca (nombres): ${error.message}`);
    const lote = data ?? [];
    for (const r of lote) {
      const id = r.marca_id as number | null;
      const nom = (r.marca_nombre as string | null) ?? "";
      if (id != null && nom && !out.has(id)) out.set(id, nom);
    }
    if (lote.length < 1000) break;
  }
  return out;
}

export async function syncArticuloMarca(
  empresaKey: string,
  triggeredBy: SwitchSyncTriggeredBy = "cron",
): Promise<ArticuloMarcaSyncResult> {
  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "articulo_marca",
    triggeredBy,
  });

  try {
    // Antes de tocar Switch: si la tabla no está, no hay adónde escribir.
    if (!(await tablaLista(empresaKey))) {
      const vacio: ArticuloMarcaSyncResult = {
        empresaKey, tablaLista: false, articulos: 0, filas: 0,
        marcas: 0, nombresResueltos: 0, marcasSinNombre: [],
      };
      await finishSwitchSyncLog(logId, "success", { inserted: 0 });
      console.warn(
        "[sync-articulo-marca] switch_articulo_marca todavía no existe — falta correr " +
        "supabase/migrations/20260806120000_switch_articulo_marca.sql. No se llamó a Switch.",
      );
      return vacio;
    }

    const client = createSwitchClient(empresaKey);

    // ── 1. Barrido del catálogo: articulo_id → marcaId (+ un codigoBarra por
    //       marca, que es la llave con la que se le pregunta el nombre). ─────
    interface Art { id: number; codigo: string; marcaId: number | null }
    const articulos: Art[] = [];
    const representante = new Map<number, string>(); // marcaId → codigoBarra

    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
      const lote = data?.articulos ?? [];

      // El corte es por página VACÍA, no por "lote < PER_PAGE": el endpoint
      // ignora `porPagina` y devuelve lo que quiere. Cortar por tamaño leería
      // una sola página y el diccionario saldría con el 0,5% de los artículos.
      if (lote.length === 0) break;
      for (const a of lote) {
        articulos.push({ id: a.id, codigo: a.codigo, marcaId: a.marcaId ?? null });
        const cb = a.codigoBarra;
        if (a.marcaId != null && cb && !representante.has(a.marcaId)) {
          representante.set(a.marcaId, cb);
        }
      }
      if (pagina === MAX_PAGES) {
        throw new Error(
          `catálogo de ${empresaKey}: se alcanzó el tope de ${MAX_PAGES} páginas sin llegar al final — el diccionario habría quedado incompleto`,
        );
      }
    }

    // ── 2. Nombres: solo los marcaId que todavía no se conocen. ──────────────
    const nombres = await nombresConocidos(empresaKey);
    const faltantes = [...representante.keys()].filter(id => !nombres.has(id));
    const marcasSinNombre: number[] = [];
    let nombresResueltos = 0;
    for (const marcaId of faltantes) {
      const cb = representante.get(marcaId)!;
      try {
        const info = await client.getArticuloInfo(cb);
        const nom = (info?.articulo?.marca ?? "").trim();
        if (nom) {
          nombres.set(marcaId, nom);
          nombresResueltos += 1;
        } else {
          marcasSinNombre.push(marcaId);
        }
      } catch {
        // Un /info que falla NO tumba el sync: esa marca queda sin nombre y sus
        // artículos caen en "Sin marca" hasta la corrida siguiente. Perder el
        // diccionario entero por una marca sería peor.
        marcasSinNombre.push(marcaId);
      }
    }

    // ── 3. Upsert. Solo se escriben los artículos CON marcaId: una fila con
    //       marca nula no aporta nada que la ausencia de fila no diga igual. ──
    const filas = articulos
      .filter(a => a.marcaId != null)
      .map(a => ({
        empresa_key: empresaKey,
        articulo_id: a.id,
        codigo: a.codigo,
        marca_id: a.marcaId,
        marca_nombre: nombres.get(a.marcaId!) ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      const { error } = await supabaseServer
        .from("switch_articulo_marca")
        .upsert(lote, { onConflict: "empresa_key,articulo_id" });
      if (error) throw new Error(`upsert switch_articulo_marca: ${error.message}`);
    }

    const result: ArticuloMarcaSyncResult = {
      empresaKey,
      tablaLista: true,
      articulos: articulos.length,
      filas: filas.length,
      marcas: representante.size,
      nombresResueltos,
      marcasSinNombre,
    };

    await finishSwitchSyncLog(logId, "success", { inserted: filas.length });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    throw err;
  }
}
