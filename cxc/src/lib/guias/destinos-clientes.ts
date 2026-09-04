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
// 🔴 EL BOTÓN SE TOCA, NUNCA SE APLICA SOLO — ni con un único candidato, ni
// para los 9 definidos. Es el invariante de guías («las sugerencias nunca atan
// solas») y la decisión del 14-ago-2026 sobre este MISMO campo: la dirección
// «NO se escribe sola en el campo» (`direccion-sugerida.ts`). Por eso ninguna
// función de aquí expone un «elegido» del que alguien pueda deducir un
// auto-completado.
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
 *   | D-35  | City Shoes            | Calle 19 Central |
 *   | D-144 | Star Shoes, S.A.      | Albrook |
 *   | D-26  | City Moda Chorrera    | Entrega en SportCorner |
 *
 * Y **D-142 Sporting Shoes N 4** es el único con varios, porque tiene varias
 * tiendas en el mismo lugar: «Westland · Albrook · Los Andes · Santiago ·
 * Penonomé · Metromall · Megamall · Outlet Vía España».
 *
 * ⚠️ La definición GANA sobre el histórico a propósito: medido, el histórico
 * de D-87 dice más veces «Changinola» (7) que «Guabito» (4), y el de D-117
 * está partido — es exactamente el desorden que Daniel vino a cerrar.
 */
export const DESTINOS_DEFINIDOS: Readonly<Record<string, readonly string[]>> = {
  "D-81": ["Paso Canoas"],
  "D-156": ["Changuinola"],
  "D-117": ["Guabito"],
  "D-87": ["Guabito"],
  "D-25": ["Paso Canoas"],
  "D-35": ["Calle 19 Central"],
  "D-144": ["Albrook"],
  "D-26": ["Entrega en SportCorner"],
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
 */
export function tiendasDelDestino(
  codigo: string | null | undefined,
  direccion: string | null | undefined,
): readonly string[] {
  const mapa = TIENDAS_POR_CLIENTE[String(codigo ?? "").trim()];
  if (!mapa) return [];
  const base = claveDestino(baseDeDestino(direccion));
  if (base === "#") return [];
  for (const [destino, tiendas] of Object.entries(mapa)) {
    if (claveDestino(destino) === base) return tiendas;
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
 * Los botones que ve una fila del formulario: si el cliente es uno de los
 * definidos por Daniel, EXACTAMENTE su lista (fuente de verdad, sin mezclar el
 * histórico); si no, su histórico agrupado; sin código o sin historia, NADA —
 * el campo queda vacío, como hoy.
 */
export function botonesDeDestino(
  codigo: string | null | undefined,
  historicos: readonly string[] | null | undefined,
): string[] {
  const c = String(codigo ?? "").trim();
  if (!c) return [];
  const definidos = DESTINOS_DEFINIDOS[c];
  if (definidos) return [...definidos];
  return (historicos ?? []).slice(0, MAX_BOTONES_DESTINO);
}
