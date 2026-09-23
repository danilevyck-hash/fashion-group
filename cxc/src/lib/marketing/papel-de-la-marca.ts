// ============================================================================
// Marketing — EL PAPEL QUE LEE LA MARCA. Módulo PURO.
//
// El Excel que va dentro del ZIP lo abre el encargado de Tommy, de Calvin o de
// Karl. Medido sobre el ZIP REAL que recibió Tommy («mid 2026», 40 gastos,
// $94.104,43), tres cosas se le escapaban de adentro de la casa:
//
//   1. 🩸 UNA NOTA INTERNA EN EL SUBTÍTULO: *«mid 2026 · calculado el 20 sept
//      2026 (este período se cerró sin reporte guardado)»*. Eso le habla al
//      sistema, no al encargado: a él no le importa si el reporte quedó o no
//      congelado. Queda «mid 2026 · al 20 sept 2026».
//   2. 🩸 EL NOMBRE DE UNA EMPRESA DEL GRUPO EN EL CONCEPTO: *«Pago de espacio
//      (mueble) en tienda para Fashion Wear Inc.»* (1 de 40 filas). La marca le
//      factura a una compañía por marca; quién es la compañía de adentro no es
//      asunto suyo. Queda «Pago de espacio (mueble) en tienda».
//   3. 🩸 EL PROVEEDOR ESCRITO DE TRES FORMAS: «Impresora Comercial S a»,
//      «Grupo City Mall S.a.», «Grupo Monat, S.a.», «Iluminaciones Tecnicas,
//      S.a». Es el MISMO sufijo de sociedad escrito de cuatro maneras en un
//      papel de cuatro páginas. Queda UNA grafía: «Impresora Comercial, S.A.».
//
// 🔴 NADA DE ESTO TOCA LA BASE. Daniel, textual (22-sep-2026): *«no elimines ni
// modifiques nada, deja que secretaria lo haga cuando rediseñemos»*. Los
// errores de tecleo se quedan donde están y los limpia Daniela desde el módulo;
// acá solo se arma el papel que sale de la casa.
//
// ⚠️ EL PROVEEDOR NO SE CENSURA. «Confecciones Boston» es una empresa del grupo
// Y ADEMÁS un proveedor legítimo cuando fabrica (Daniel: *«Boston cuando
// fabrica — NUNCA la marca»*). Borrar su nombre de la columna Proveedor dejaría
// la fila sin quién hizo el trabajo. La regla 2 se aplica SOLO al concepto.
// ============================================================================

import { EMPRESA_KEY_TO_NAME, EMPRESA_KEY_TO_NOMBRE_CORTO } from "@/lib/empresa-mapping";
import { EMPRESA_FISCAL } from "@/lib/cxc/empresa-fiscal";
import { normalizarProveedor } from "./proveedor";

// ─── Lo que NO puede salir: los nombres de las empresas del grupo ────────────

/** Minúsculas, sin acentos, sin puntuación, un espacio. Para comparar. */
function plano(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:'"()\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Los nombres de las ocho empresas, DERIVADOS de las listas que ya existen —
 * nunca escritos a mano acá. Se juntan el nombre de pantalla
 * (`EMPRESA_KEY_TO_NAME`), el corto (`EMPRESA_KEY_TO_NOMBRE_CORTO`) y el LEGAL
 * de la ficha fiscal (`EMPRESA_FISCAL`), porque la factura de City Mall decía
 * «Fashion Wear Inc.» y ninguna de las dos primeras listas trae ese «Inc.».
 *
 * Ordenados del más largo al más corto: primero se busca «Confecciones Boston»
 * y recién después «Boston», para no dejar la mitad del nombre en el papel.
 */
export const NOMBRES_DE_LAS_EMPRESAS: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      [
        ...Object.values(EMPRESA_KEY_TO_NAME),
        ...Object.values(EMPRESA_KEY_TO_NOMBRE_CORTO),
        ...Object.values(EMPRESA_FISCAL).map((f) => f.legal),
      ]
        .map((n) => plano(n))
        .filter((n) => n.length >= 4),
    ),
  ).sort((a, b) => b.length - a.length),
);

/** Colas de sociedad que van pegadas al nombre y se van con él. */
const COLA_DE_SOCIEDAD = /^(?:\s*,?\s*(?:s\s*\.?\s*a\s*\.?|sa|inc|corp|ltd|srl)\b\.?)+/i;

/** Conectores que quedan colgando cuando se va el nombre («… para »). */
const CONECTOR_COLGANDO = /(?:\s+(?:para|por|de|del|a|al|en|con))+\s*$/i;

/** Lo que se muestra cuando limpiar deja el concepto en nada. */
export const CONCEPTO_SIN_NADA = "Gasto de marketing";

/**
 * Quita del texto el nombre de cualquier empresa del grupo, con su cola de
 * sociedad y el conector que quedaría colgando. Devuelve un texto NUEVO; el
 * original no se toca (y menos el de la base).
 */
export function limpiarTextoParaLaMarca(texto: unknown): string {
  const original = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (original.length === 0) return "";

  let out = original;
  let toco = false;
  for (const nombre of NOMBRES_DE_LAS_EMPRESAS) {
    // Se busca sobre el texto APLANADO para que «Fashion Wear», «FASHION WEAR»
    // y «Fáshion Wear» caigan igual, pero se corta sobre el texto de verdad.
    let guarda = 0;
    for (;;) {
      const i = indiceDelNombre(out, nombre);
      if (i.desde < 0 || guarda++ > 20) break;
      const resto = out.slice(i.hasta).replace(COLA_DE_SOCIEDAD, "");
      const antes = out.slice(0, i.desde).replace(CONECTOR_COLGANDO, "");
      out = `${antes} ${resto}`.replace(/\s+/g, " ").trim();
      toco = true;
    }
  }
  if (!toco) return original;

  const limpio = out
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[\s,;:\-–]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length === 0 ? CONCEPTO_SIN_NADA : limpio;
}

/**
 * Dónde está el nombre (ya aplanado) dentro del texto de verdad, respetando
 * los bordes de palabra. Devuelve índices sobre el texto ORIGINAL.
 */
function indiceDelNombre(texto: string, nombrePlano: string): { desde: number; hasta: number } {
  // Mapa índice-del-plano → índice-del-original, construido carácter a carácter.
  const mapa: number[] = [];
  let acum = "";
  let espacioPendiente = false;
  for (let i = 0; i < texto.length; i++) {
    // La puntuación separa igual que un espacio: «Fashion-Wear» tiene que caer
    // con «fashion wear», si no el nombre se queda en el papel por un guion.
    const c = plano(texto[i]);
    if (c.length === 0 || c === " ") {
      if (acum.length > 0) espacioPendiente = true;
      continue;
    }
    if (espacioPendiente) {
      acum += " ";
      mapa.push(i);
      espacioPendiente = false;
    }
    acum += c;
    for (let k = 0; k < c.length; k++) mapa.push(i);
  }
  mapa.push(texto.length);

  let desdeP = acum.indexOf(nombrePlano);
  while (desdeP >= 0) {
    const bordeIzq = desdeP === 0 || acum[desdeP - 1] === " ";
    const finP = desdeP + nombrePlano.length;
    const bordeDer = finP >= acum.length || acum[finP] === " ";
    if (bordeIzq && bordeDer) {
      return { desde: mapa[desdeP] ?? 0, hasta: mapa[finP] ?? texto.length };
    }
    desdeP = acum.indexOf(nombrePlano, desdeP + 1);
  }
  return { desde: -1, hasta: -1 };
}

// ─── UNA sola grafía por proveedor ──────────────────────────────────────────

/** Cómo se escribe cada cola de sociedad. UNA forma por cola, y nada más. */
const COLA_CANONICA: Record<string, { texto: string; coma: boolean }> = {
  sa: { texto: "S.A.", coma: true },
  srl: { texto: "S.R.L.", coma: true },
  inc: { texto: "Inc.", coma: false },
  corp: { texto: "Corp.", coma: false },
  ltd: { texto: "Ltd.", coma: false },
};

const TOKENS_DE_SOCIEDAD = new Set(["sa", "s", "a", "inc", "corp", "ltd", "srl"]);

/** Parte un nombre crudo en su cuerpo y su cola de sociedad ("sa", "corp"…). */
function partirProveedor(crudo: string): { cuerpo: string; cola: string } {
  const tokens = String(crudo ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const cola: string[] = [];
  while (tokens.length > 1) {
    const partes = plano(tokens[tokens.length - 1]).split(" ").filter(Boolean);
    if (partes.length === 0 || !partes.every((p) => TOKENS_DE_SOCIEDAD.has(p))) break;
    cola.unshift(...partes);
    tokens.pop();
  }
  const cuerpo = tokens.join(" ").replace(/[\s,;:.]+$/g, "").trim();
  return { cuerpo, cola: cola.join("") };
}

/**
 * La grafía única de UN nombre crudo: el cuerpo tal como se escribió y la cola
 * de sociedad siempre igual.
 *
 *   «Impresora Comercial S a»      → «Impresora Comercial, S.A.»
 *   «Grupo Monat, S.a.»            → «Grupo Monat, S.A.»
 *   «Cerantola Global Corp.»       → «Cerantola Global Corp.»
 *   «Krysthel Yanneth Morales…»    → igual (no tiene cola)
 */
export function grafiaDeProveedor(crudo: unknown): string {
  const texto = String(crudo ?? "").replace(/\s+/g, " ").trim();
  if (texto.length === 0) return "";
  const { cuerpo, cola } = partirProveedor(texto);
  if (cuerpo.length === 0) return texto;
  const canon = COLA_CANONICA[cola];
  if (!canon) return cola.length === 0 ? cuerpo : texto;
  return canon.coma ? `${cuerpo}, ${canon.texto}` : `${cuerpo} ${canon.texto}`;
}

/**
 * El diccionario del archivo: para cada proveedor (por el normalizado del
 * cimiento) UNA grafía, la de la escritura MÁS USADA. Así, si el mismo
 * proveedor está escrito de dos formas, el papel usa una sola — y es la que más
 * veces eligió quien carga, no una inventada acá.
 */
export function grafiasUnicasDeProveedor(
  historico: ReadonlyArray<string | null | undefined>,
): Map<string, string> {
  const usos = new Map<string, Map<string, number>>();
  for (const crudo of historico) {
    const nombre = String(crudo ?? "").replace(/\s+/g, " ").trim();
    const clave = normalizarProveedor(nombre);
    if (clave.length === 0) continue;
    const grafias = usos.get(clave) ?? new Map<string, number>();
    grafias.set(nombre, (grafias.get(nombre) ?? 0) + 1);
    usos.set(clave, grafias);
  }
  const out = new Map<string, string>();
  for (const [clave, grafias] of usos) {
    let mejor = "";
    let mejorUsos = -1;
    for (const [grafia, n] of grafias) {
      if (n > mejorUsos || (n === mejorUsos && grafia < mejor)) {
        mejor = grafia;
        mejorUsos = n;
      }
    }
    out.set(clave, grafiaDeProveedor(mejor));
  }
  return out;
}

/** El proveedor como lo lee la marca: su grafía única, o la suya canonizada. */
export function proveedorParaLaMarca(
  crudo: unknown,
  grafias: ReadonlyMap<string, string>,
): string {
  const clave = normalizarProveedor(String(crudo ?? ""));
  return grafias.get(clave) ?? grafiaDeProveedor(crudo);
}

// ─── El subtítulo, sin notas internas ───────────────────────────────────────

/**
 * El subtítulo del Excel que lee la marca: de qué período es y a qué fecha.
 * 🔴 SIN la nota interna de si el reporte quedó congelado o se calculó hoy: eso
 * es cómo funciona el sistema por dentro, y el papel del encargado no lo dice.
 * (El dato NO se pierde: sigue viajando en `fuenteMontos` y en la cabecera
 * `X-Fuente-Montos` de la descarga, que son para adentro.)
 */
export function subtituloParaLaMarca(args: {
  nombrePeriodo: string;
  estado: string;
  cerradoEn: string | null;
  hoyFormateado: string;
  formatearFecha: (iso: string) => string;
}): string {
  const nombre = String(args.nombrePeriodo ?? "").trim();
  if (nombre.length === 0) return `Gastos al ${args.hoyFormateado}`;
  if (String(args.estado).trim() !== "cerrado") {
    return `${nombre} · período abierto — gastos al ${args.hoyFormateado}`;
  }
  // Cerrado se dice «cerrado», con su fecha si se sabe. Lo que NO se dice es
  // si el reporte quedó congelado o se volvió a calcular: eso es de adentro.
  const f = args.cerradoEn ? args.formatearFecha(args.cerradoEn) : "";
  return f ? `${nombre} · cerrado el ${f}` : `${nombre} · cerrado`;
}

// ─── Una marca = 100 % ──────────────────────────────────────────────────────

/**
 * Cuánto de una factura le toca a la marca.
 *
 * 🔴 UN GASTO LLEVA UNA MARCA (`gasto.ts › exigirUnaMarca`, enchufado en las
 * tres puertas que escriben marcas). Con una sola marca el reparto
 * `total × (pct / sumPct)` da SIEMPRE el total entero —incluidas las 72
 * facturas guardadas «al 50 %», que son el modelo viejo «marca 50 / Fashion
 * Group 50» y no un reparto entre marcas—, así que la cuenta se escribe como
 * lo que es: el total.
 *
 * ⚠️ La red queda puesta: si alguna vez llegara una fila repartida entre dos
 * marcas (hoy la puerta la rechaza; medido 0 de 108), se vuelve al reparto
 * viejo en vez de romper el ZIP de un encargado.
 */
export function porcionDeLaFactura(
  total: number,
  filas: ReadonlyArray<{ marcaId: string; pct: number }>,
  marcaId: string,
): number {
  const mia = filas.find((r) => r.marcaId === marcaId);
  if (!mia) return 0;
  const t = Number(total) || 0;
  if (filas.length === 1) return redondear(t);
  const suma = filas.reduce((s, r) => s + (Number(r.pct) || 0), 0) || 1;
  return redondear(t * ((Number(mia.pct) || 0) / suma));
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
