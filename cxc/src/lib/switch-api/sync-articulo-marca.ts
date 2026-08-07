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
//
// ── 🩸 EL CATÁLOGO DE SWITCH REPITE ARTÍCULOS (medido 7-ago-2026) ───────────
// `/apiarticulos/lista` devuelve **9.126 renglones pero solo 8.447 `id`
// distintos**: 221 artículos vienen repetidos (679 renglones de más, uno de
// ellos 12 veces), casi siempre en renglones CONSECUTIVOS de la misma página.
// Las copias son idénticas — verificado copia por copia: 0 de 221 difieren en
// `codigo` y 0 de 221 difieren en `marcaId` — así que no hay ningún dato que
// elegir, solo un renglón de más.
//
// Eso ROMPÍA el upsert. Postgres rechaza un `INSERT … ON CONFLICT` que traiga
// la misma llave dos veces EN LA MISMA sentencia ("ON CONFLICT DO UPDATE
// command cannot affect row a second time"), y acá se manda de a 500 filas. El
// primer lote con un repetido adentro es el **5.º**, así que los 4 primeros
// entraban (2.000 filas) y el 5.º tumbaba la corrida entera.
//
// Eso es EXACTAMENTE lo que se midió en producción el 7-ago-2026: 2.000 filas,
// `articulo_id` 1…2004, escritas todas a las 08:45:07, 19 marcas de 33, y el
// diccionario cubriendo el 8,7% de los códigos vendidos en 12 meses. No fue un
// timeout (el barrido completo mide 204 s y la función tiene 800 s) ni un corte
// del endpoint (la página 41 devuelve datos): fue el 5.º lote del upsert.
//
// Por eso el catálogo se DEDUPLICA antes de escribir (`dedupeCatalogo`), que
// además es lo correcto por definición: la llave de la tabla es
// (empresa_key, articulo_id) — dos renglones con el mismo id son UN artículo.
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

/** Tamaño del lote del upsert. Con el catálogo deduplicado ya no puede haber
 *  llaves repetidas dentro de un lote, sea cual sea el tamaño. */
const UPSERT_BATCH = 500;

/**
 * Piso de "el barrido llegó hasta el final", como fracción de lo que el
 * diccionario YA sabe de esta empresa.
 *
 * 🩸 Por qué hace falta: el corte del barrido es una página VACÍA. Si Switch
 * devuelve 200 con una lista vacía a mitad del catálogo —un hipo del proveedor,
 * no un error HTTP— el sync corta contento, hace UPSERT de lo poco que trajo y
 * se anota `success`. Como la tabla es aditiva no se pierde nada de lo viejo,
 * pero el diccionario deja de crecer EN SILENCIO, que es la forma de fallar que
 * este PR vino a eliminar. Con el guard, ese barrido corto queda `error` en
 * `switch_sync_log` y entra en la racha de la política anti-ruido.
 *
 * El 70% es holgado a propósito: el catálogo solo CRECE en la tabla (los
 * descatalogados conservan su fila), así que con los años lo guardado puede
 * superar a lo que Switch lista hoy. Que el catálogo vivo caiga a menos de dos
 * tercios del histórico acumulado no es un cambio de negocio plausible; un
 * barrido cortado a la mitad sí. El caso real del 7-ago habría dado 2.000
 * contra 8.447 = 24%.
 */
const PISO_BARRIDO = 0.7;

/** Un renglón del catálogo de Switch, con lo único que este sync mira. */
export interface ArticuloCrudo {
  id: number;
  codigo: string;
  marcaId: number | null;
}

export interface CatalogoDeduplicado {
  unicos: ArticuloCrudo[];
  /** Renglones de más que traía el catálogo (9.126 − 8.447 = 679 el 7-ago). */
  renglonesRepetidos: number;
  /** Cuántos `articulo_id` distintos venían más de una vez (221 el 7-ago). */
  idsRepetidos: number;
}

/**
 * Un renglón por `articulo_id` — PURO, sin base ni red.
 *
 * Gana la ÚLTIMA aparición: es lo que habría quedado si cada renglón se
 * escribiera por separado, uno tras otro, que es la semántica del upsert. La
 * elección no cambia ningún dato (las 221 copias medidas traen `codigo` y
 * `marcaId` idénticos), pero se fija para que el resultado sea determinista y
 * no dependa del orden en que Switch mande las copias.
 */
export function dedupeCatalogo(crudos: readonly ArticuloCrudo[]): CatalogoDeduplicado {
  const porId = new Map<number, ArticuloCrudo>();
  // Se cuenta UNA vez por id aunque venga 12 veces: lo que interesa es cuántos
  // artículos vienen repetidos, no cuántas copias trajo cada uno (eso es
  // `renglonesRepetidos`).
  const repetidos = new Set<number>();
  for (const a of crudos) {
    if (porId.has(a.id)) repetidos.add(a.id);
    porId.set(a.id, a);
  }
  return {
    unicos: [...porId.values()],
    renglonesRepetidos: crudos.length - porId.size,
    idsRepetidos: repetidos.size,
  };
}

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
 *
 * Devuelve CUÁNTAS filas hay (null = no se pudo leer / la tabla no está). La
 * misma consulta hace los dos trabajos: la sonda de existencia y la línea base
 * contra la que el guard de barrido corto compara al final.
 */
async function filasGuardadas(empresaKey: string): Promise<number | null> {
  const { count, error } = await supabaseServer
    .from("switch_articulo_marca")
    .select("articulo_id", { count: "exact", head: true })
    .eq("empresa_key", empresaKey);
  if (error) return null;
  return count ?? 0;
}

export interface ArticuloMarcaSyncResult {
  empresaKey: string;
  /** `false` = la tabla todavía no existe y no se le pidió NADA a Switch. */
  tablaLista: boolean;
  /** Renglones leídos del catálogo de Switch (incluye los repetidos). */
  articulos: number;
  /** Artículos DISTINTOS tras deduplicar — lo que de verdad se escribe. */
  articulosUnicos: number;
  /** Renglones de más que traía el catálogo (ver el encabezado del archivo). */
  renglonesRepetidos: number;
  /** Filas escritas (upsert). */
  filas: number;
  /** Filas que la tabla ya tenía de esta empresa ANTES de esta corrida. Es el
   *  número contra el que se mide el guard de barrido corto. */
  filasPrevias: number;
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
    const filasPrevias = await filasGuardadas(empresaKey);
    if (filasPrevias === null) {
      const vacio: ArticuloMarcaSyncResult = {
        empresaKey, tablaLista: false, articulos: 0, articulosUnicos: 0,
        renglonesRepetidos: 0, filas: 0, filasPrevias: 0,
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
    const articulos: ArticuloCrudo[] = [];
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

    // ── 3. Un renglón por artículo. SIN ESTO el upsert revienta — ver el
    //       encabezado del archivo (el catálogo repite 221 ids). ──────────────
    const dedup = dedupeCatalogo(articulos);

    // ── 4. Guard del barrido corto. Va ANTES del upsert: escribir primero y
    //       avisar después dejaría el diccionario a medias con un `success`. ──
    if (filasPrevias > 0 && dedup.unicos.length < filasPrevias * PISO_BARRIDO) {
      throw new Error(
        `catálogo de ${empresaKey}: el barrido trajo ${dedup.unicos.length} artículos contra ${filasPrevias} ya guardados ` +
        `(menos del ${Math.round(PISO_BARRIDO * 100)}%) — se cortó a mitad de camino, no se escribe nada`,
      );
    }

    // Solo se escriben los artículos CON marcaId: una fila con marca nula no
    // aporta nada que la ausencia de fila no diga igual.
    const sello = new Date().toISOString();
    const filas = dedup.unicos
      .filter(a => a.marcaId != null)
      .map(a => ({
        empresa_key: empresaKey,
        articulo_id: a.id,
        codigo: a.codigo,
        marca_id: a.marcaId,
        marca_nombre: nombres.get(a.marcaId!) ?? null,
        synced_at: sello,
        updated_at: sello,
      }));

    let escritas = 0;
    for (let i = 0; i < filas.length; i += UPSERT_BATCH) {
      const lote = filas.slice(i, i + UPSERT_BATCH);
      const { error } = await supabaseServer
        .from("switch_articulo_marca")
        .upsert(lote, { onConflict: "empresa_key,articulo_id" });
      // El mensaje dice CUÁNTO alcanzó a escribirse. Sin eso, el 7-ago el log
      // habría dicho "falló el upsert" y nadie habría sabido que el diccionario
      // quedó con el 22% de los artículos y en uso.
      if (error) {
        throw new Error(
          `upsert switch_articulo_marca (lote ${Math.floor(i / UPSERT_BATCH) + 1} de ${Math.ceil(filas.length / UPSERT_BATCH)}, ` +
          `${escritas} de ${filas.length} filas escritas): ${error.message}`,
        );
      }
      escritas += lote.length;
    }

    const result: ArticuloMarcaSyncResult = {
      empresaKey,
      tablaLista: true,
      articulos: articulos.length,
      articulosUnicos: dedup.unicos.length,
      renglonesRepetidos: dedup.renglonesRepetidos,
      filas: filas.length,
      filasPrevias,
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
