// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LOS DESTINOS DE CADA CLIENTE, COMO BOTONES BAJO EL CAMPO DIRECCIÓN.
// (módulo PURO: sin React, sin fetch, sin reloj)
//
// El problema, medido contra producción (3/4-sep-2026, 529 renglones vivos):
// la dirección de un renglón es el DESTINO DEL ENVÍO, no la dirección del
// cliente (`clientes_master` no tiene esa columna), se escribe a mano cada vez
// y el mismo lugar entra de varias formas: «Paso Canoas»×208 · «Pasocanoas»×1 ·
// «Paso Canoa»×1; «Penonome / PENONOME / Penonomé»; «Wesland / Westaland /
// WESTLAND - TIENDA 6». De 48 clientes con guías, 40 usan siempre el mismo
// destino.
//
// Después: debajo del campo Dirección aparecen botones con los destinos que ese
// cliente ya recibió. Se toca uno y se llena. 🔴 SIGUE SIENDO TEXTO LIBRE: los
// botones son atajo, jamás candado — quien quiera escribe lo que sea, como hoy.
//
// 🔴 EL AUTOLLENADO (4-sep-2026): con UN solo destino, el campo se llena solo
// al elegir el cliente — `destinoParaAutollenar`. Daniel, textual: *«"la
// dirección no se escribe sola" me refería a que el usuario no lo haga para
// no escribirlo mal como lo vimos, quita esa regla. Que se autollene como lo
// discutimos antes.»* La decisión del 14-ago-2026 la tomó él pensando en que
// la PERSONA no tuviera que teclear el destino (justo para evitar
// «Pasocanoas» / «Wesland» / «PENONOME»), no en prohibir que el sistema lo
// llene — y él mismo la corrigió. Medido: 40 de 48 clientes con guías usan
// SIEMPRE el mismo destino; ahí no hay ambigüedad que resolver.
//
// Con VARIOS destinos no se llena nada: salen los botones y elige la persona.
// Lo autollenado se borra y se escribe encima como cualquier texto, y un
// campo que ya tiene algo NO se pisa.
//
// 🔴 Lo que SÍ sigue prohibido — y no se toca — es el pareo POR PARECIDO:
// «Outlet Duty Free N2» y «N3» son tiendas distintas, «Wesland» (typo) no es
// «Westland». `claveDestino` agrupa por regla exacta, nunca por distancia de
// edición.
//
// 🔴 Cuelga del MISMO interruptor que el panel de facturas
// (`GUIAS_ATAJOS_NUEVOS`, `atajos-facturas.ts`): en `false` no se dibuja ni un
// botón y el formulario queda EXACTAMENTE como hoy. Y NADA de esto cambia lo
// que se GUARDA: tocar un botón escribe en el mismo campo `direccion` que hoy
// se teclea a mano — el payload es idéntico por los dos caminos (hay candado).
//
// 🔴 No se toca ni una fila de `guia_items` existente: el histórico es lo que
// el transportista firmó. Acá solo se LEE.
// ─────────────────────────────────────────────────────────────────────────────

import type { EnvioParaDireccion, GuiaParaDireccion } from "./direccion-sugerida";

/**
 * 🔴 LOS DESTINOS DEFINIDOS POR DANIEL (4-sep-2026) — fuente de verdad para
 * estos clientes: sus botones salen de ACÁ, no del histórico. Su tabla,
 * textual:
 *
 *   | D-81  | Jerusalem Duty Free   | Paso Canoas |
 *   | D-156 | Wolf Mall Center Int  | Changuinola |
 *   | D-117 | Outlet Duty Free N2   | Guabito |
 *   | D-87  | La Frontera Duty Free | Guabito |
 *   | D-25  | City Mall Paso Canoa  | Paso Canoas |
 *   | D-35  | City Shoes            | Calle 19 Central | ← corregido el
 *     4-sep-2026, ver abajo.
 *   | D-144 | Star Shoes, S.A.      | Albrook |
 *   | D-26  | City Moda Chorrera    | Entrega en SportCorner | ← superado el
 *     mismo 4-sep: ver «LA FAMILIA CITY MODA» abajo (D-26 quedó en «5 de
 *     Mayo» y las «entregas en SportCorner» son de los OTROS códigos).
 *
 * Y **D-142 Sporting Shoes N 4** es el único con varios, porque tiene varias
 * tiendas en el mismo lugar: «Westland · Albrook · Los Andes · Santiago ·
 * Penonomé · Metromall · Megamall · Outlet Vía España».
 *
 * ⚠️ La definición GANA sobre el histórico a propósito: medido, el histórico
 * de D-87 dice más veces «Changinola» (7) que «Guabito» (4), y el de D-117
 * está partido — es exactamente el desorden que Daniel vino a cerrar.
 * Daniel, textual (4-sep-2026): *«en Frontera Duty Free es Guabito, hazme
 * caso.»* — hay candado que exige que D-87 diga Guabito mire lo que mire su
 * histórico real.
 *
 * ⚠️ **LA FAMILIA CITY MODA (4-sep-2026).** Daniel preguntó *«¿hay varios
 * city moda no?»* — y sí: son ONCE clientes distintos, cada uno con su código
 * (D-26 Chorrera · D-27 Calidonia · D-28 Albrook 2 · D-29 Central · D-30
 * Chorrera · D-31 Del Este · D-32 Los Andes · D-33 Santa Ana · D-34 Westland
 * · D-42 Del Norte · D-78 Ismora). Las 8 direcciones raras del histórico de
 * D-26 («ALBROOK 2 (ENTREGA EN SPORTCORNER)», «CALIDONIA (…)», «Z15 (…)»…)
 * son **envíos cargados al cliente EQUIVOCADO**: iban a esos otros códigos y
 * quien hizo la guía eligió D-26. No es un dato que preservar — es el error
 * que este cambio viene a evitar — y por eso se IGNORAN: la definición gana
 * sobre el histórico. El destino de la familia es **«Sport Corner Calidonia»**
 * (la grafía mayoritaria de sus propias guías: D-27, D-28, D-29, D-31, D-32,
 * D-34 y D-42 ya apuntan ahí), y el único destino PROPIO de D-26 es
 * **«5 de Mayo»**. D-30, D-33 y D-78 no tienen guías todavía y por eso no
 * tienen destino definido.
 *
 * 🔴 **LAS DOS CORRECCIONES DEL 4-SEP-2026.** Daniel, textual: *«city shoes →
 * Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19
 * Central.»*
 *   · **D-35 City Shoes** pasa de «Calle 19 Central» al texto completo con la
 *     referencia de la joyería.
 *   · **D-112 Nine Sports 9, S.A.** entra a los definidos con «Calle 19
 *     Central» — hoy autollenaba «Calle 19» por su histórico de 2 guías, y la
 *     definición de Daniel gana.
 * Van acá (la constante) además de en la migración `20260918120000`, para que
 * no dependan de que la migración corra: la constante es la RED del orden de
 * precedencia (ver `destinosDefinidosPara`).
 *
 * ⚠️ **Desde el 4-sep-2026 esta constante es la SEGUNDA fuente, no la primera**:
 * los destinos definidos viven en la tabla `guias_destino_cliente` y se
 * administran en Guías › Configuración (admin y secretaria) sin desplegar.
 * La constante queda como red mientras la migración no corra — el mismo
 * patrón que las RPC con caída.
 */
export const DESTINOS_DEFINIDOS: Readonly<Record<string, readonly string[]>> = {
  "D-81": ["Paso Canoas"],
  "D-156": ["Changuinola"],
  "D-117": ["Guabito"],
  "D-87": ["Guabito"],
  "D-25": ["Paso Canoas"],
  // Daniel, 4-sep-2026: «city shoes → Calle 19 Central, al lado de la joyería
  // Super Oro.»
  "D-35": ["Calle 19 Central, al lado de la joyería Super Oro"],
  // Daniel, 4-sep-2026: «Y Nine Sport en Calle 19 Central.» (Nine Sports 9,
  // S.A. — su histórico decía «Calle 19»; la definición gana.)
  "D-112": ["Calle 19 Central"],
  "D-144": ["Albrook"],
  "D-26": ["5 de Mayo"],
  // La familia City Moda: todas entregan en Sport Corner Calidonia (ver el
  // bloque de arriba). D-30, D-33 y D-78 quedan fuera: sin guías todavía.
  "D-27": ["Sport Corner Calidonia"],
  "D-28": ["Sport Corner Calidonia"],
  "D-29": ["Sport Corner Calidonia"],
  "D-31": ["Sport Corner Calidonia"],
  "D-32": ["Sport Corner Calidonia"],
  "D-34": ["Sport Corner Calidonia"],
  "D-42": ["Sport Corner Calidonia"],
  "D-142": [
    "Westland",
    "Albrook",
    "Los Andes",
    "Santiago",
    "Penonomé",
    "Metromall",
    "Megamall",
    "Outlet Vía España",
  ],
};

/**
 * Las tiendas ya usadas por destino (solo D-142 las tiene). Verificado contra
 * producción el 4-sep-2026: el histórico trae «WESTLAND - TIENDA 6», «TIENDA 5
 * WESTALAND», «MAS FLOW - WESTLAND», «ALBROOK - TIENDA 7», «TIENDA 8/9
 * ALBROOK», «TIENDA 3/4 LOS ANDES», «METROMALL - TIENDA 10» — exactamente los
 * números de la tabla de Daniel. El campo tienda es OPCIONAL, y «+ otra» deja
 * escribir uno nuevo.
 *
 * ⚠️ City Moda NO lleva tienda: cada «tienda» de City Moda es OTRO CLIENTE
 * con su propio código (D-27 Calidonia, D-28 Albrook 2, …) — ver el bloque de
 * DESTINOS_DEFINIDOS.
 */
export const TIENDAS_POR_CLIENTE: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  "D-142": {
    Westland: ["5", "6", "14", "Mas Flow"],
    Albrook: ["7", "8", "9"],
    "Los Andes": ["3", "4"],
    Metromall: ["10"],
  },
};

/** Máximo de botones por cliente (los definidos de D-142 son 8 y van enteros). */
export const MAX_BOTONES_DESTINO = 6;

// ─── La tabla `guias_destino_cliente` y el orden de precedencia ──────────────

/**
 * Un destino definido tal como sale de la tabla `guias_destino_cliente`
 * (migración `20260918120000`, se administra en Guías › Configuración).
 */
export interface DestinoDefinido {
  destino: string;
  /** Las tiendas de ese destino (solo Sporting Shoes las usa hoy). */
  tiendas?: readonly string[];
}

/** Código de cliente → sus destinos definidos EN LA TABLA (activos, en orden). */
export type DefinidosPorCliente = Readonly<Record<string, readonly DestinoDefinido[]>>;

/**
 * 🔴 EL ORDEN DE PRECEDENCIA VIVE ACÁ Y EN NINGÚN OTRO LADO (4-sep-2026):
 *
 *   1. la TABLA `guias_destino_cliente` (si hay filas activas para ese
 *      cliente) — lo que se corrige desde Guías › Configuración sin desplegar;
 *   2. la CONSTANTE `DESTINOS_DEFINIDOS` — la red mientras la migración no
 *      corra (el mismo patrón que las RPC con caída);
 *   3. `null` → el que llama cae al HISTÓRICO agrupado de `guia_items`.
 *
 * Si la tabla tiene filas para el cliente, la constante NO se mezcla: la
 * tabla es la foto completa de ese cliente (quitar un destino en la pantalla
 * tiene que quitarlo de verdad, no revivirlo desde el código).
 */
export function destinosDefinidosPara(
  codigo: string | null | undefined,
  deTabla?: DefinidosPorCliente | null,
): readonly DestinoDefinido[] | null {
  const c = String(codigo ?? "").trim();
  if (!c) return null;
  const filas = deTabla?.[c];
  if (filas && filas.length > 0) return filas;
  const constante = DESTINOS_DEFINIDOS[c];
  if (constante) return constante.map((d) => ({ destino: d, tiendas: TIENDAS_POR_CLIENTE[c]?.[d] }));
  return null;
}

// ─── Normalización: exacta y por regla, nunca por parecido ───────────────────

/**
 * La clave con la que dos grafías cuentan como EL MISMO destino.
 *
 * Reglas, todas deterministas — 🔴 NADA de distancia de edición:
 *   · minúsculas y sin acentos («Penonomé» ≡ «PENONOME»);
 *   · se quitan espacios y puntuación («Pasocanoas» ≡ «Paso Canoas»);
 *   · UNA «s» final se ignora («Paso Canoa» ≡ «Paso Canoas» — las tres grafías
 *     conviven en producción: 208/1/1). Es una regla de plural, completa y
 *     total, no un umbral de parecido.
 *   · 🔴 LOS DÍGITOS SE COMPARAN TAL CUAL SOBRE EL TEXTO CRUDO, aparte de las
 *     letras — la lección de `nombre-normalizado.ts`: «Outlet Duty Free N2» y
 *     «N3» son tiendas DISTINTAS, y «Westland - tienda 5» no es «tienda 6».
 *     Ninguna limpieza de letras puede comérselos.
 *
 * Por eso «Wesland» (typo) NO se junta con «Westland»: juntarlos pediría
 * distancia de edición, que este repo tiene prohibida con nombres.
 */
export function claveDestino(s: string | null | undefined): string {
  const crudo = String(s ?? "").trim();
  const letras = crudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");
  const digitos = (crudo.match(/\d+/g) ?? []).map((d) => String(Number(d))).join("|");
  return `${letras}#${digitos}`;
}

// ─── El destino compuesto con la tienda ──────────────────────────────────────

/**
 * 🔴 EL SEPARADOR SE DECIDE ACÁ Y EN NINGÚN OTRO LADO.
 *
 * Se guarda «Westland · tienda 6» (el ejemplo del mockup que Daniel aprobó).
 * Antes de elegirlo se miró dónde se imprime la dirección: en el papel
 * (`PrintDocument`), en el PDF (`pdf-guia.ts`) y en el Excel (`excel-guias.ts`)
 * la dirección sale en su PROPIA celda/columna, así que ningún separador choca
 * con nada. El único « · » vecino es el del resumen del acordeón
 * («Cliente · Destino»), donde «Sporting Shoes N 4 · Westland · tienda 6»
 * sigue leyéndose de corrido.
 *
 * Con una tienda que no es número («Mas Flow») no se antepone «tienda»:
 * «Westland · Mas Flow», que es como se habla de ella.
 */
export function componerDestino(destino: string, tienda: string): string {
  const d = String(destino ?? "").trim();
  const t = String(tienda ?? "").trim();
  if (!t) return d;
  return /^\d+$/.test(t) ? `${d} · tienda ${t}` : `${d} · ${t}`;
}

/** La parte del campo ANTES del separador: la base sobre la que van las tiendas. */
export function baseDeDestino(direccion: string | null | undefined): string {
  return String(direccion ?? "").split("·")[0].trim();
}

/**
 * Las tiendas ya usadas para lo que el campo dice AHORA (por su base): con
 * «Westland» o «Westland · tienda 6» devuelve las de Westland; con «Santiago»
 * (sin tiendas) o con otro cliente, nada.
 *
 * Con la tabla presente (`deTabla`), las tiendas salen de la fila del destino
 * — mismo orden de precedencia que los botones (`destinosDefinidosPara`).
 */
export function tiendasDelDestino(
  codigo: string | null | undefined,
  direccion: string | null | undefined,
  deTabla?: DefinidosPorCliente | null,
): readonly string[] {
  const definidos = destinosDefinidosPara(codigo, deTabla);
  if (!definidos) return [];
  const base = claveDestino(baseDeDestino(direccion));
  if (base === "#") return [];
  for (const d of definidos) {
    if (claveDestino(d.destino) === base) return d.tiendas ?? [];
  }
  return [];
}

// ─── El histórico: qué recibió cada cliente, agrupado y por frecuencia ───────

/**
 * Para cada cliente del directorio, sus destinos históricos: variantes
 * agrupadas por `claveDestino`, mostrando la GRAFÍA MÁS USADA (desempata la
 * más reciente — nunca se inventa una grafía normalizada, la lección de los
 * juegos de despacho), ordenados por frecuencia y recortados a
 * `MAX_BOTONES_DESTINO`.
 *
 * 🔴 Solo renglones VIVOS de guías VIVAS: `guia_items.deleted` es independiente
 * del `deleted` de la cabecera — filtrar solo uno deja pasar renglones
 * borrados. Y 🔴 solo por `cliente_codigo`, nunca por nombre escrito a mano
 * (la misma razón medida de `direccion-sugerida.ts`).
 *
 * «Más reciente» es cronológico: `guia_items` no tiene fecha propia, así que
 * se usa la `fecha` de la guía con el `numero` de desempate (ordenar por el
 * uuid sería ordenar por nada).
 */
export function destinosHistoricos(
  envios: readonly EnvioParaDireccion[],
  guias: readonly GuiaParaDireccion[],
): Record<string, string[]> {
  const fechaDe = new Map<string, string>();
  const numeroDe = new Map<string, number>();
  for (const g of guias) {
    if (g.deleted) continue;
    fechaDe.set(g.id, String(g.fecha ?? "").slice(0, 10));
    numeroDe.set(g.id, Number(g.numero ?? 0));
  }

  interface Forma {
    c: number;
    f: string;
    n: number;
  }
  interface Grupo {
    total: number;
    ultF: string;
    ultN: number;
    formas: Map<string, Forma>;
  }
  const porCliente = new Map<string, Map<string, Grupo>>();

  for (const e of envios) {
    if (e.deleted) continue;
    const codigo = String(e.cliente_codigo ?? "").trim();
    const direccion = String(e.direccion ?? "").trim();
    if (!codigo || !direccion) continue;
    // Una guía borrada (o inexistente) no aporta: su envío no viajó.
    if (!fechaDe.has(e.guia_id)) continue;
    const f = fechaDe.get(e.guia_id) as string;
    const n = numeroDe.get(e.guia_id) ?? 0;

    let grupos = porCliente.get(codigo);
    if (!grupos) porCliente.set(codigo, (grupos = new Map()));
    const clave = claveDestino(direccion);
    let grupo = grupos.get(clave);
    if (!grupo) grupos.set(clave, (grupo = { total: 0, ultF: "", ultN: -1, formas: new Map() }));
    grupo.total += 1;
    if (f > grupo.ultF || (f === grupo.ultF && n >= grupo.ultN)) {
      grupo.ultF = f;
      grupo.ultN = n;
    }
    const forma = grupo.formas.get(direccion);
    if (!forma) {
      grupo.formas.set(direccion, { c: 1, f, n });
    } else {
      forma.c += 1;
      if (f > forma.f || (f === forma.f && n >= forma.n)) {
        forma.f = f;
        forma.n = n;
      }
    }
  }

  const salida: Record<string, string[]> = {};
  for (const [codigo, grupos] of porCliente) {
    const ordenados = [...grupos.values()].sort(
      (a, b) =>
        b.total - a.total ||
        (a.ultF < b.ultF ? 1 : a.ultF > b.ultF ? -1 : 0) ||
        b.ultN - a.ultN,
    );
    salida[codigo] = ordenados.slice(0, MAX_BOTONES_DESTINO).map((g) => {
      // La grafía más usada; empate → la más reciente. SIEMPRE un valor
      // original: ofrecer el normalizado estrenaría una forma MÁS de escribir
      // lo mismo, que es justo lo que esto vino a evitar.
      let mejor: { texto: string; c: number; f: string; n: number } | null = null;
      for (const [texto, forma] of g.formas) {
        if (
          !mejor ||
          forma.c > mejor.c ||
          (forma.c === mejor.c &&
            (forma.f > mejor.f || (forma.f === mejor.f && forma.n > mejor.n)))
        ) {
          mejor = { texto, ...forma };
        }
      }
      return (mejor as { texto: string }).texto;
    });
  }
  return salida;
}

/**
 * Los botones que ve una fila del formulario: si el cliente tiene destinos
 * DEFINIDOS —en la tabla `guias_destino_cliente` primero, en la constante como
 * red—, EXACTAMENTE esa lista (fuente de verdad, sin mezclar el histórico); si
 * no, su histórico agrupado; sin código o sin historia, NADA — el campo queda
 * vacío, como hoy. La precedencia vive en `destinosDefinidosPara`.
 */
export function botonesDeDestino(
  codigo: string | null | undefined,
  historicos: readonly string[] | null | undefined,
  deTabla?: DefinidosPorCliente | null,
): string[] {
  const c = String(codigo ?? "").trim();
  if (!c) return [];
  const definidos = destinosDefinidosPara(c, deTabla);
  if (definidos) return definidos.map((d) => d.destino);
  return (historicos ?? []).slice(0, MAX_BOTONES_DESTINO);
}

/**
 * 🔴 EL DESTINO QUE SE LLENA SOLO AL ELEGIR EL CLIENTE (4-sep-2026).
 *
 * Daniel, textual: *«sí quiero que se llene sola, ¿ese no era el propósito de
 * todo esto? ¿Cómo que no pre-llenaste la dirección?»* — y al preguntarle por
 * la regla del 14-ago-2026: *«"la dirección no se escribe sola" me refería a
 * que el usuario no lo haga para no escribirlo mal como lo vimos, quita esa
 * regla. Que se autollene como lo discutimos antes.»* Aquella regla la tomó
 * él para que la PERSONA no tecleara el destino (y no naciera otro
 * «Pasocanoas»); no prohíbe que el sistema lo llene.
 *
 * La regla nueva: **con UN solo destino — definido en su tabla O único en su
 * historia agrupada — el campo se llena solo al elegir el cliente.** Medido:
 * 40 de 48 clientes con guías usan siempre el mismo destino (Bouti, S.A.
 * D-14 → «David», 4 guías, siempre igual); ahí no hay ambigüedad que
 * resolver. Con VARIOS destinos (Sporting Shoes D-142 y los pocos así) no se
 * llena nada: salen los botones y elige la persona.
 *
 * 🔴 Lo que sigue prohibido es el pareo POR PARECIDO — la historia entra ya
 * agrupada por `claveDestino` (regla exacta), nunca por distancia de edición.
 *
 * ⚠️ El que llama es responsable de NO PISAR un campo que ya tiene algo
 * escrito, y de que lo puesto siga siendo texto libre (se borra y se escribe
 * encima como cualquier valor).
 */
export function destinoParaAutollenar(
  codigo: string | null | undefined,
  historicos: readonly string[] | null | undefined,
  deTabla?: DefinidosPorCliente | null,
): string | null {
  const botones = botonesDeDestino(codigo, historicos, deTabla);
  return botones.length === 1 ? botones[0] : null;
}
