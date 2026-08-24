// ─────────────────────────────────────────────────────────────────────────────
// Filtros EXTRA del catálogo (25-jul-2026) — hoy Tommy Hilfiger y Calvin Klein.
//
// Dos filtros que Daniel aprobó por marca (flags `filtroBultos` y `filtroPrecio`
// en MARCA_THEME.features).
//
// ⚠️ Los dos flags YA NO van juntos, y desde el 24-ago-2026 tienen respuestas
// distintas para Reebok y Joybees:
//   · `filtroBultos` sigue en `false` ahí — el corte deja pasar el 92% del
//     catálogo de Joybees y un filtro que casi no corta enreda al vendedor;
//   · `filtroPrecio` pasó a `true` en las CUATRO marcas, por pedido explícito
//     de Daniel (*"sí, pero no quiero botones de precios, solo escribirlo y ya,
//     me explico?"*). Revirtió a propósito la medición de jul-2026 — el porqué
//     completo está en `marcas-ui`, marca por marca.
//
// ── EL DESPLEGABLE DE TRAMOS SE FUE: AHORA SE ESCRIBE EL PRECIO (23-ago-2026) ─
//
// Daniel, textual: *"quita el dropdown del filtro de precio en los catalogos y
// pon opcion de filtro exacto"*. Y enseguida, sobre el segundo campo:
// *"me gusto el segundo campo de hasta, pero para facilidad del usuario siempre
// usara precio exacto, asi que el hasta automaticamente se ponga el precio que
// puso el usuario de desde para no hacer doble trabajo"*.
//
// O sea: DOS campos, «desde» y «hasta», pero el caso normal es escribir UN solo
// número. Mientras la persona no toque «hasta» a mano, lo que escribe en
// «desde» se copia solo — y el filtro queda en precio EXACTO sin trabajo extra.
// El espejo vive en el componente (`FiltroPrecioExacto`), no acá: este archivo
// es la REGLA (qué pasa el filtro, qué precios existen, qué decirle a quien
// escribió un precio que no existe), y la regla no depende de la pantalla.
//
// 🔴 POR QUÉ SE SIGUEN DERIVANDO LOS PRECIOS QUE EXISTEN, AUNQUE YA NO SE
// PINTEN. Los tramos viejos ("$23 a $31") escondían un dato que con el precio
// exacto queda al descubierto: no todos los precios son dólares enteros.
// MEDIDO contra producción el 23-ago-2026, en el catálogo público: Tommy tiene
// 41 precios distintos — $10 … $17.50 … $19.50 … $64 — y Calvin 15, con $15.50.
// Quien escribe "17" en Tommy no encuentra NADA aunque haya producto a $17.50,
// y concluye que la pantalla se rompió.
//
// El 24-ago Daniel retiró la FILA DE BOTONES que listaba esos precios (*"no
// quiero botones de precios, solo escribirlo y ya"*), pero el AVISO se queda —
// es texto y aparece solo cuando hace falta. `preciosDelCatalogo` sigue viva
// porque de ella sale el "Lo más cercano: $16 o $17.50" de `mensajeFiltroPrecio`:
// sin la lista, el aviso no tendría qué ofrecer. Se DERIVA de los productos que
// la pantalla ya tiene en memoria — ninguna consulta nueva, ni antes ni ahora.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtPrecio } from "@/lib/catalogo/precio";

/** Bultos COMPLETOS mínimos del filtro "2 bultos o más". */
export const MIN_BULTOS = 2;

/** Los dos campos del filtro de precio, tal cual los escribió la persona. */
export interface FiltroPrecio {
  desde: string;
  hasta: string;
}

/** Filtro de precio apagado. Es el valor de "Limpiar filtros" y el inicial. */
export const PRECIO_VACIO: FiltroPrecio = { desde: "", hasta: "" };

/**
 * Lo que escribió la persona → número, o `null` si no es un precio.
 *
 * Tolera lo que de verdad se teclea en Panamá: `$30`, `30,00`, ` 17.5 `,
 * `1,234.50`. No tolera letras ni negativos: eso es "no escribió un precio", y
 * el control lo dice con un texto, no filtrando en silencio.
 */
export function parsePrecio(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/[$\s]/g, "");
  if (!s) return null;
  // "1,234.50" → coma de miles; "30,00" → coma decimal.
  s = s.includes(",") && s.includes(".") ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * El precio que viene en la URL es dato NO confiable: entra solo si es un
 * número, y ya normalizado (`?precio_desde=$30` se guarda como "30").
 */
export function precioDeUrl(v: string | null | undefined): string {
  const n = parsePrecio(v);
  return n === null ? "" : String(n);
}

/** Centavos enteros: comparar precios como float da 17.5 !== 17.500000000001. */
function centavos(n: number): number {
  return Math.round(n * 100);
}

/**
 * ¿El precio POR PIEZA (no por bulto) cae en el filtro?
 *
 * Con los dos campos en el mismo número —el caso normal, por el espejo— esto
 * es igualdad exacta al centavo. Campos vacíos o ilegibles = no filtra: un
 * campo a medio escribir no debe vaciar la grilla de golpe.
 */
export function precioEnFiltro(
  price: number | null | undefined,
  desde: string,
  hasta: string,
): boolean {
  const min = parsePrecio(desde);
  const max = parsePrecio(hasta);
  if (min === null && max === null) return true;
  const p = Number(price ?? Number.NaN);
  // Fail-open: un precio roto en el dato no esconde el producto (misma
  // filosofía que `disponibleVendible` y `cumpleBultosMinimos`).
  if (!Number.isFinite(p)) return true;
  const c = centavos(p);
  if (min !== null && c < centavos(min)) return false;
  if (max !== null && c > centavos(max)) return false;
  return true;
}

/**
 * Los precios que EXISTEN en el catálogo: sin repetir, de menor a mayor.
 *
 * ⚠️ Desde el 24-ago-2026 esto NO se pinta. Su único consumidor es
 * `mensajeFiltroPrecio`, para poder decir cuál es el precio real más cercano
 * al que alguien escribió. No es una lista de opciones: es la evidencia del
 * aviso.
 *
 * Se DERIVA de los productos que la pantalla ya cargó. No hay —ni debe haber—
 * una consulta nueva para esto: los precios los manda Switch y esta pantalla
 * solo filtra lo que ya tiene en memoria.
 */
export function preciosDelCatalogo(precios: (number | null | undefined)[]): number[] {
  const porCentavo = new Map<number, number>();
  for (const x of precios) {
    const p = Number(x ?? Number.NaN);
    if (!Number.isFinite(p) || p <= 0) continue;
    porCentavo.set(centavos(p), centavos(p) / 100);
  }
  return [...porCentavo.values()].sort((a, b) => a - b);
}

// El precio se escribe con EL formato de los catálogos (`lib/catalogo/precio`):
// sin `.00` y sin redondear. Un `$18` acá y un `$17.50` en la card serían dos
// verdades distintas sobre el mismo producto.
const fmt = fmtPrecio;

/** El precio existente inmediatamente por debajo y por encima del escrito. */
export function preciosCercanos(
  precio: number,
  precios: number[],
): { abajo: number | null; arriba: number | null } {
  let abajo: number | null = null;
  let arriba: number | null = null;
  for (const p of precios) {
    if (centavos(p) < centavos(precio)) abajo = p;
    else if (centavos(p) > centavos(precio) && arriba === null) arriba = p;
  }
  return { abajo, arriba };
}

/**
 * Qué decirle a quien escribió un precio que este catálogo no tiene.
 *
 * Devuelve `null` cuando no hay nada que avisar (filtro vacío, precio que sí
 * existe, o catálogo todavía sin cargar — "no hay ninguno" es indistinguible
 * de "todavía no sé", y en la duda no se acusa a nadie).
 *
 * El texto va en español simple y SIEMPRE ofrece la salida: el precio real más
 * cercano. Decir solo "no hay resultados" es exactamente el mensaje que hace
 * pensar que la pantalla se rompió.
 */
export function mensajeFiltroPrecio(
  desde: string,
  hasta: string,
  precios: number[],
): string | null {
  const dTxt = desde.trim();
  const hTxt = hasta.trim();
  if (!dTxt && !hTxt) return null;

  const min = parsePrecio(dTxt);
  const max = parsePrecio(hTxt);
  if ((dTxt && min === null) || (hTxt && max === null)) {
    return "Escribe solo el número del precio. Por ejemplo: 17.50";
  }
  if (min !== null && max !== null && centavos(min) > centavos(max)) {
    return "El precio de «hasta» es menor que el de «desde». Cámbialos y vuelve a intentar.";
  }
  if (precios.length === 0) return null;

  const hay = precios.some((p) => precioEnFiltro(p, dTxt, hTxt));
  if (hay) return null;

  // Precio EXACTO (el caso normal): se ofrece el vecino de abajo y el de arriba.
  if (min !== null && max !== null && centavos(min) === centavos(max)) {
    const { abajo, arriba } = preciosCercanos(min, precios);
    const cerca = [abajo, arriba].filter((p): p is number => p !== null).map(fmt);
    if (cerca.length === 2) {
      return `En este catálogo no hay nada a ${fmt(min)}. Lo más cercano: ${cerca[0]} o ${cerca[1]}.`;
    }
    if (cerca.length === 1) {
      return `En este catálogo no hay nada a ${fmt(min)}. Lo más cercano: ${cerca[0]}.`;
    }
  }

  const desdeTxt = min !== null ? fmt(min) : null;
  const hastaTxt = max !== null ? fmt(max) : null;
  const rango =
    desdeTxt && hastaTxt ? `entre ${desdeTxt} y ${hastaTxt}`
      : desdeTxt ? `de ${desdeTxt} o más`
        : `de ${hastaTxt} o menos`;
  return `En este catálogo no hay nada ${rango}. Los precios van de ${fmt(precios[0])} a ${fmt(precios[precios.length - 1])}.`;
}

/** Label del chip de bultos. Dice la REGLA, no un juicio de valor: la card del
 *  catálogo público no muestra Disponibilidad ni Existencia, así que "buen
 *  stock" dejaría al cliente sin saber por qué desaparecieron productos.
 *  "Bulto" ya es vocabulario de la card ("Bulto de 12"). */
export const BULTOS_CHIP_LABEL = "2 bultos o más";

/**
 * ¿El producto tiene al menos `minBultos` bultos COMPLETOS disponibles?
 * `piezas` debe ser la DISPONIBILIDAD (lo vendible), no la existencia, y
 * `piezasPorBulto` sale de `theme.bulto(category)` — nunca hardcodeado.
 *
 * Fail-open si el tamaño de bulto viene inválido: un dato roto de config no
 * debe esconder producto (misma filosofía que `disponibleVendible`).
 */
export function cumpleBultosMinimos(
  piezas: number | null | undefined,
  piezasPorBulto: number,
  minBultos: number = MIN_BULTOS,
): boolean {
  if (!Number.isFinite(piezasPorBulto) || piezasPorBulto <= 0) return true;
  const p = Number(piezas ?? 0);
  if (!Number.isFinite(p)) return false;
  return Math.floor(p / piezasPorBulto) >= minBultos;
}
