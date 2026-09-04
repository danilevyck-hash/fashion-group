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
// 🔴 EL AUTOLLENADO (4-sep-2026): manda «EL DE SIEMPRE» — cada cliente puede
// tener UN destino marcado así y ESE se llena solo al elegir el cliente,
// aunque tenga varios; los demás salen como botones (Daniel: *«sí correcto,
// con entrega Sport Corner como default, que elija si quiere el otro sino»*).
// Sin ninguno marcado, no se llena nada. Un cliente SIN definición sale de su
// historia agrupada y con UN solo destino histórico también autollena
// (Daniel, sobre la regla del 14-ago que él mismo quitó: *«"la dirección no
// se escribe sola" me refería a que el usuario no lo haga para no escribirlo
// mal como lo vimos, quita esa regla. Que se autollene como lo discutimos
// antes.»*). Medido: 40 de 48 clientes con guías usan SIEMPRE el mismo
// destino; ahí no hay ambigüedad que resolver.
//
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
 * Un destino definido — de la tabla `guias_destino_cliente` (migración
 * `20260918120000`, se administra en Guías › Configuración) o de la constante
 * `DESTINOS_DEFINIDOS` (la red mientras la migración no corra).
 */
export interface DestinoDefinido {
  destino: string;
  /** Las tiendas de ese destino (solo Sporting Shoes las usa hoy). */
  tiendas?: readonly string[];
  /**
   * 🔴 «EL DE SIEMPRE» (4-sep-2026). Daniel, textual: *«sí correcto, con
   * entrega Sport Corner como default, que elija si quiere el otro sino»* —
   * cada cliente puede tener UN destino marcado así, y ESE se llena solo al
   * elegir el cliente, aunque el cliente tenga varios. Los demás salen como
   * botones. Sin ninguno marcado, no se llena nada.
   */
  elDeSiempre?: boolean;
}

/**
 * 🔴 LOS DESTINOS DEFINIDOS POR DANIEL (4-sep-2026, cerrados en el mockup
 * final: «dale aprobado») — fuente de verdad para estos clientes: sus botones
 * salen de ACÁ, no del histórico. Su tabla, textual:
 *
 *   | D-81  | Jerusalem Duty Free    | Paso Canoas       | el de siempre |
 *   | D-80  | Jerusalem De Panamá    | Paso Canoas       | el de siempre |
 *   | D-156 | Wolf Mall Center Int   | Changuinola       | el de siempre |
 *   | D-117 | Outlet Duty Free N2    | Guabito           | el de siempre |
 *   | D-87  | La Frontera Duty Free  | Guabito           | el de siempre (gana sobre su histórico, que dice Changinola ×7) |
 *   | D-25  | City Mall Paso Canoa   | Paso Canoas       | el de siempre |
 *   | D-35  | City Shoes             | Calle 19 Central, al lado de la joyería Super Oro | el de siempre |
 *   | D-112 | Nine Sports 9, S.A.    | Calle 19 Central  | el de siempre |
 *   | D-144 | Star Shoes, S.A.       | Albrook           | el de siempre |
 *   | D-141 | Sport Fashion          | Los Andes         | el de siempre |
 *
 * **Las correcciones de escritura** (Daniel: *«pon lo que recomendaste en
 * ¿es esto?, así mismo»*): D-99 Mas Flow 21 Oeste → Westland · D-147 Top Shop
 * Store → Changuinola · D-7 Almacén Flash → Penonomé · D-43 De Moda → Las
 * Tablas · D-86 Kings Sport → Albrook. Todos «el de siempre».
 *
 * **La familia City Moda** (Daniel: *«todos los City Moda en Sport Corner
 * Calidonia, y a veces solo City Moda Chorrera en Chorrera»*): D-27 · D-28 ·
 * D-29 · D-31 · D-32 · D-33 · D-34 · D-42 · D-78 → «Sport Corner Calidonia»,
 * el de siempre. **D-26 City Moda Chorrera** lleva DOS destinos: «Sport
 * Corner Calidonia» (el de siempre) y «Chorrera» (botón) — el «5 de Mayo» de
 * la primera versión se quitó. D-33 y D-78 no tenían guías y ahora quedan
 * definidos igual; **D-30 no se define** (Switch lo borró; lo cubre el sync
 * de clientes). Son ONCE clientes distintos, cada uno con su código: las 8
 * direcciones raras del histórico de D-26 («ALBROOK 2 (ENTREGA EN
 * SPORTCORNER)», «Z15 (…)»…) eran envíos cargados al cliente EQUIVOCADO y se
 * IGNORAN — no llevan campo tienda porque cada «tienda» es OTRO cliente.
 *
 * Y **D-142 Sporting Shoes N 4** es el único SIN «el de siempre»: 8 destinos
 * como botones (Westland · Albrook · Los Andes · Santiago · Penonomé ·
 * Metromall · Megamall · Outlet Vía España), con el renglón de tienda
 * opcional. Si no eligen nada el campo queda vacío y la guía no se guarda —
 * la dirección es obligatoria, igual que hoy.
 *
 * ⚠️ La definición GANA sobre el histórico a propósito: medido, el histórico
 * de D-87 dice más veces «Changinola» (7) que «Guabito» (4) — Daniel,
 * textual: *«en Frontera Duty Free es Guabito, hazme caso.»* Hay candado.
 *
 * ⚠️ Las tiendas de D-142 se verificaron contra producción el 4-sep-2026: el
 * histórico trae «WESTLAND - TIENDA 6», «TIENDA 5 WESTALAND», «MAS FLOW -
 * WESTLAND», «ALBROOK - TIENDA 7», «TIENDA 8/9 ALBROOK», «TIENDA 3/4 LOS
 * ANDES», «METROMALL - TIENDA 10». El campo tienda es OPCIONAL y «+ otra»
 * deja escribir uno nuevo.
 *
 * ⚠️ **Esta constante es la SEGUNDA fuente, no la primera**: los definidos
 * viven en la tabla `guias_destino_cliente` y se administran en Guías ›
 * Configuración (admin y secretaria) sin desplegar. La constante queda como
 * red mientras la migración `20260918120000` no corra — el mismo patrón que
 * las RPC con caída — y la carga inicial de esa migración es EXACTAMENTE esta
 * tabla.
 */
export const DESTINOS_DEFINIDOS: Readonly<Record<string, readonly DestinoDefinido[]>> = {
  "D-81": [{ destino: "Paso Canoas", elDeSiempre: true }],
  "D-80": [{ destino: "Paso Canoas", elDeSiempre: true }],
  "D-156": [{ destino: "Changuinola", elDeSiempre: true }],
  "D-117": [{ destino: "Guabito", elDeSiempre: true }],
  // Daniel, 4-sep-2026: «en Frontera Duty Free es Guabito, hazme caso.»
  "D-87": [{ destino: "Guabito", elDeSiempre: true }],
  "D-25": [{ destino: "Paso Canoas", elDeSiempre: true }],
  // Daniel, 4-sep-2026: «city shoes → Calle 19 Central, al lado de la joyería
  // Super Oro.»
  "D-35": [{ destino: "Calle 19 Central, al lado de la joyería Super Oro", elDeSiempre: true }],
  // Daniel, 4-sep-2026: «Y Nine Sport en Calle 19 Central.»
  "D-112": [{ destino: "Calle 19 Central", elDeSiempre: true }],
  "D-144": [{ destino: "Albrook", elDeSiempre: true }],
  "D-141": [{ destino: "Los Andes", elDeSiempre: true }],
  // Las cinco correcciones de escritura — Daniel: «pon lo que recomendaste en
  // ¿es esto?, así mismo» (su histórico traía el typo: «Wesland», «Changinola»,
  // «Penonome», «las tablas», «albrok»).
  "D-99": [{ destino: "Westland", elDeSiempre: true }],
  "D-147": [{ destino: "Changuinola", elDeSiempre: true }],
  "D-7": [{ destino: "Penonomé", elDeSiempre: true }],
  "D-43": [{ destino: "Las Tablas", elDeSiempre: true }],
  "D-86": [{ destino: "Albrook", elDeSiempre: true }],
  // La familia City Moda — «todos los City Moda en Sport Corner Calidonia, y a
  // veces solo City Moda Chorrera en Chorrera». D-26 lleva DOS: el de siempre
  // y «Chorrera» como botón. D-30 no se define (Switch lo borró).
  "D-26": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }, { destino: "Chorrera" }],
  "D-27": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-28": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-29": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-31": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-32": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-33": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-34": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-42": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  "D-78": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],
  // Sporting Shoes N 4 — SIN «el de siempre»: sus 8 destinos como botones,
  // con las tiendas ya usadas.
  "D-142": [
    { destino: "Westland", tiendas: ["5", "6", "14", "Mas Flow"] },
    { destino: "Albrook", tiendas: ["7", "8", "9"] },
    { destino: "Los Andes", tiendas: ["3", "4"] },
    { destino: "Santiago" },
    { destino: "Penonomé" },
    { destino: "Metromall", tiendas: ["10"] },
    { destino: "Megamall" },
    { destino: "Outlet Vía España" },
  ],
};

/** Máximo de botones por cliente (los definidos de D-142 son 8 y van enteros). */
export const MAX_BOTONES_DESTINO = 6;

// ─── La tabla `guias_destino_cliente` y el orden de precedencia ──────────────

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
  if (constante && constante.length > 0) return constante;
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
 * 🔴 LA REGLA DE «EL DE SIEMPRE» (4-sep-2026, mockup final: «dale aprobado»).
 * Daniel, textual: *«sí correcto, con entrega Sport Corner como default, que
 * elija si quiere el otro sino»*:
 *
 *   · Cliente con destinos DEFINIDOS (tabla o constante): se llena SOLO el
 *     marcado como «el de siempre», aunque el cliente tenga varios (D-26
 *     autollena «Sport Corner Calidonia» y ofrece «Chorrera» como botón).
 *     **Sin ninguno marcado, no se llena nada** (Sporting Shoes D-142) —
 *     esto REEMPLAZA la regla anterior de «solo autollena si hay UNO».
 *   · Cliente SIN definición (los ~40 restantes — Daniel: *«no quiero definir
 *     cliente por cliente, ya tú debes de saberlo con las guías que hemos
 *     hecho»*): sale de su historia agrupada, y con UN solo destino en toda
 *     su historia también se autollena (Bouti, S.A. D-14 → «David», 4 guías,
 *     siempre igual). Con varios, botones y elige la persona.
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
  const c = String(codigo ?? "").trim();
  if (!c) return null;
  const definidos = destinosDefinidosPara(c, deTabla);
  if (definidos) {
    const elDeSiempre = definidos.find((d) => d.elDeSiempre === true);
    return elDeSiempre ? elDeSiempre.destino : null;
  }
  const botones = (historicos ?? []).slice(0, MAX_BOTONES_DESTINO);
  return botones.length === 1 ? botones[0] : null;
}
