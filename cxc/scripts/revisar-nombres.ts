// ─────────────────────────────────────────────────────────────────────────────
// 🔴 REVISAR NOMBRES DE ERP EN TODA LA PANTALLA (6-oct-2026).
//
//   npx tsx scripts/revisar-nombres.ts            # todo el sistema
//   npx tsx scripts/revisar-nombres.ts src/app/guias   # una carpeta
//
// Daniel, 6-oct-2026: «¿cómo hago para que apliques nombres como ERP
// profesional sin tener que decírtelo cada vez?». El candado de antes
// (`nombres-erp-prohibidos.test.ts`) solo conocía una lista fija de palabras,
// así que cada coloquialismo NUEVO se colaba: «A quién se le pasa», «mi costo»,
// «Avísale a Roxana», «Poner en bulto», «¿Cómo calcular los precios?»…
//
// Esto no busca palabras: busca FORMAS. Saca los textos que se ven en pantalla
// y frena el que tiene forma de conversación en vez de forma de ERP:
//   · pregunta («¿…?»);
//   · primera o segunda persona («mi costo», «te avisa»);
//   · verbo con el pronombre pegado («Avísale», «Borrarlos»);
//   · imperativo de 2.ª persona («Sube la foto»);
//   · diminutivo o coloquialismo (la lista crece en el documento);
//   · y en un RÓTULO (campo, columna, estado, encabezado de PDF o Excel),
//     que no sea un sustantivo corto (más de 4 palabras, o empieza por verbo,
//     preposición o artículo).
//
// Dos varas, según de dónde salió el texto:
//   · `rotulo`  → vara DURA: es el nombre de una cosa, así que sustantivo corto
//                 y nada de mandatos.
//   · `texto`   → vara BLANDA: una ayuda, un aviso o un botón pueden ser una
//                 frase, pero sin preguntas y sin hablarle a nadie. El tuteo de
//                 la casa («Vuelve a intentarlo») se queda: lo manda CLAUDE.md.
//
// 🔴 El glosario NO vive aquí: se lee de `docs/nombres-erp.md`, que es la ÚNICA
// fuente —la tabla dura «Palabras prohibidas en textos visibles», que también
// lee `nombres-erp-prohibidos`, y la blanda «Formas coloquiales», que solo se
// exige sobre lo que se ve—. Agregar una fila «mal → bien» ahí alcanza para que
// esto la haga cumplir, sin tocar una línea de código. Los términos APROBADOS
// salen de la misma tabla «Un término por concepto».
//
// En CI corre `src/__tests__/lib/revisar-nombres.test.ts`, con un TECHO por
// archivo que SOLO BAJA (igual que `paleta-unica`): lo que ya estaba no frena
// el build, pero nada puede empeorar.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Clase = "rotulo" | "texto";
export type Hallazgo = { archivo: string; linea: number; texto: string; clase: Clase; regla: string; propuesta?: string };

/** Se corre desde `cxc/` (igual que `vitest` y que `revisar-papeles`). */
export const RAIZ = process.cwd();

// ─── 1. El glosario, leído de docs/nombres-erp.md ────────────────────────────

/**
 * Una celda de la tabla puede traer:
 *   · varios literales separados por « · »        → «Mandar · Mandarle»
 *   · un regex entre comillas invertidas          → `` `(^|["'>])\s*Listo[,—]` ``
 *   · notas entre paréntesis, que se ignoran      → «Voseo (elegí, podés…)»
 */
/**
 * 🩸 `\b` de JavaScript NO conoce las tildes: `/\bDí\b/` CAZA «Días», porque
 * entre «í» y «a» ve un borde de palabra. Estos dos son el borde de verdad.
 */
const ANTES = "(?<![A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ])";
const DESPUES = "(?![A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ])";
const LETRA = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/;

/** Las celdas de una fila, respetando el «\\|» escapado de Markdown. */
function celdasDe(linea: string): string[] {
  return linea.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

/** Quita las notas entre paréntesis y los adornos, y parte por « · ». */
function literalesDeCelda(celda: string): string[] {
  return celda
    .replace(/\([^)]*\)/g, "")
    .split("·")
    .map((t) => t.replace(/[«»"']/g, "").replace(/…/g, "").trim())
    .filter(Boolean);
}

function patronDeCelda(celda: string): RegExp[] {
  const regex = celda.trim().match(/^`(.+)`$/);
  if (regex) return [new RegExp(regex[1])];
  return literalesDeCelda(celda).flatMap((limpio) => {
    if (limpio.length < 3) return [];
    const esc = limpio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 🔑 El documento manda el caso: lo que escribe con mayúscula es un RÓTULO
    // («Mandar», «No pude») y se exige con mayúscula; lo que escribe en
    // minúscula es una palabra de prosa («a medias», «plata») y vale en las dos
    // («A medias» también). Sin esto, «Mandar» cazaba «para mandar el correo».
    const conCaso = esc.replace(/^[a-záéíóúñ]/, (c) => `[${c}${c.toUpperCase()}]`);
    const ini = LETRA.test(limpio[0]) ? ANTES : "";
    const fin = LETRA.test(limpio[limpio.length - 1]) ? DESPUES : "";
    return [new RegExp(`${ini}${conCaso}${fin}`)];
  });
}

let glosarioCache: [RegExp, string][] | null = null;

export const TITULO_DURAS = "## Palabras prohibidas en textos visibles";
export const TITULO_BLANDAS = "## Formas coloquiales (techo por archivo)";

/**
 * Una tabla «mal → bien» de docs/nombres-erp.md.
 *   · `TITULO_DURAS`    — CERO en todo el código (`nombres-erp-prohibidos`).
 *   · `TITULO_BLANDAS`  — solo en lo que se ve en pantalla, con techo.
 */
export function glosario(
  md = readFileSync(path.join(RAIZ, "docs/nombres-erp.md"), "utf8"),
  titulo = TITULO_DURAS,
): [RegExp, string][] {
  const seccion = (md.split(titulo)[1] ?? "").split("\n## ")[0];
  const filas: [RegExp, string][] = [];
  for (const linea of seccion.split("\n")) {
    const celdas = celdasDe(linea);
    if (celdas.length < 4 || /^-+$/.test(celdas[1]) || celdas[1] === "Prohibido" || !celdas[1]) continue;
    for (const re of patronDeCelda(celdas[1])) filas.push([re, celdas[2]]);
  }
  if (!filas.length) throw new Error("docs/nombres-erp.md: no se pudo leer la tabla de palabras prohibidas");
  return filas;
}

function glosarioVivo(): [RegExp, string][] {
  return (glosarioCache ??= [...glosario(), ...glosario(undefined, TITULO_BLANDAS)]);
}

let aprobadosCache: string[] | null = null;

/**
 * La columna «Término» de la tabla «Un término por concepto»: los nombres que
 * el propio glosario MANDA usar. Un texto que es (o empieza por) uno de ellos
 * pasa sin más, aunque la forma no parezca un sustantivo: «Cómo se calcula»,
 * «Seleccionar período» y «Enviar estado de cuenta» están ahí por decisión de
 * Daniel. De un solo término se exige coincidencia exacta; de los de dos o más
 * palabras basta que el texto empiece así («Cómo se calcula el neto»).
 */
export function terminosAprobados(md = readFileSync(path.join(RAIZ, "docs/nombres-erp.md"), "utf8")): string[] {
  const seccion = (md.split("## Un término por concepto")[1] ?? "").split("\n## ")[0];
  const out: string[] = [];
  for (const linea of seccion.split("\n")) {
    const celdas = celdasDe(linea);
    if (celdas.length < 4 || /^-+$/.test(celdas[2]) || celdas[2] === "Término" || !celdas[2]) continue;
    for (const limpio of literalesDeCelda(celdas[2]))
      if (limpio.length >= 3 && /^[A-ZÁÉÍÓÚÑ¿]/.test(limpio)) out.push(limpio.toLowerCase());
  }
  return out;
}

function esAprobado(t: string): boolean {
  const low = (aprobadosCache ??= terminosAprobados());
  const texto = t.toLowerCase().replace(/[:·.…]+$/, "");
  return low.some((a) => texto === a || (a.includes(" ") && texto.startsWith(a)));
}

// ─── 2. Las formas que no son de ERP ─────────────────────────────────────────

/** Pronombres de 1.ª y 2.ª persona sueltos. «le/les» va aparte (ver ENCLITICO). */
const PERSONA = new RegExp(
  `${ANTES}(?:me|mi|mis|mío|mía|nos|nuestro|nuestra|te|ti|tu|tus|tuyo|tuya|usted|ustedes|contigo|conmigo)${DESPUES}`,
  "i",
);
/**
 * Verbo con el pronombre pegado: infinitivo («Borrarlos», «pedírselo»,
 * «elegirla») y los imperativos irregulares, que van en IMPERATIVO con su
 * pronombre opcional («Avísale», «Ponlo»). No se generaliza más: «Cliente» y
 * «Estilo» también acaban en «-te»/«-lo» y no son verbos.
 */
const ENCLITICO = new RegExp(`${ANTES}[a-záéíóúñ]{3,}[aeiáéí]r(?:se)?(?:l[oae]s?|les?|se|nos)${DESPUES}`, "i");
/**
 * Imperativo de tú: lista corta, son irregulares. 🔴 Solo se exige en los
 * RÓTULOS: en un aviso o una validación el tuteo es la casa (CLAUDE.md
 * «selecciona · escribe · revisa · guarda · toca · mira») y el propio glosario
 * manda «Selecciona …».
 */
const IMPERATIVO = new RegExp(
  `^(?:Sube|Súbe|Pon|Mira|Míra|Dale|Da|Haz|Ve|Di|Dí|Avisa|Avísa|Toca|Escribe|Escríbe|Llena|Lléna|Busca|Búsca|Agrega|Agrégá?|Quita|Quíta|Borra|Bórra|Manda|Mánda|Envía|Revisa|Revísa|Elige|Elíge|Fíjate|Espera|Prueba|Vuelve|Entra|Checa|Mete|Méte|Saca|Sáca|Trae|Tráe|Cuéntame|Dime|Dame)(?:l[oae]s?|les?|me|te|nos|se)?${DESPUES}`,
);

/** Verbos en infinitivo (también con pronombre pegado): «Revocar», «Poner», «Borrarlos». */
const INFINITIVO = /^[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}(?:ar|er|ir)(?:se|l[oae]s?|les?|me|te|nos)?$/i;
/** Sustantivos de ERP que terminan en -ar/-er/-ir y NO son verbos. */
const NO_ES_VERBO = new Set(
  ("celular titular lugar particular taller auxiliar ejemplar familiar militar dólar dolar bar mar hogar mujer ayer alfiler " +
    "interior exterior superior inferior anterior posterior menor mejor peor señor chofer líder lider carácter caracter cáncer " +
    "póster poster máster master bachiller canciller azúcar azucar collar pilar solar escolar singular circular popular total")
    .split(" "),
);
/** Un rótulo arranca con el nombre de la cosa, no con una preposición ni un artículo. */
const NO_ES_SUSTANTIVO = new Set(
  // 🔑 «Sin …» NO entra: es la forma de la casa para un vacío («Sin saldo»,
  // «Sin registros»). «Por …» tampoco: agrupa («Por empresa», «Por pagar»).
  ("de del a al en para con sobre entre desde hasta hacia según tras y o u que si cuando como donde quien cual cuanto " +
    "el la los las un una unos unas lo").split(" "),
);

const MAX_PALABRAS_ROTULO = 4;

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * La única regla del sistema. Devuelve null si el texto es un nombre de ERP.
 * `clase` decide la vara: `rotulo` es el nombre de una cosa, `texto` una frase.
 */
export function revisarTexto(texto: string, clase: Clase): { regla: string; propuesta?: string } | null {
  const t = texto.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (esAprobado(t)) return null;

  for (const [re, cambio] of glosarioVivo())
    if (re.test(t)) return { regla: `glosario de docs/nombres-erp.md`, propuesta: cambio };

  if (t.includes("¿") || /\?$/.test(t)) return { regla: "es una pregunta", propuesta: "el sustantivo de lo que se pide" };

  const persona = t.match(PERSONA);
  if (persona) return { regla: `habla en 1.ª o 2.ª persona («${persona[0]}»)`, propuesta: "sin pronombres: «Costo», «Observaciones»" };

  if (clase === "texto") return null;

  // ── Vara dura: un rótulo es un sustantivo corto ──
  // En una frase de ayuda el enclítico y el tuteo son la casa («Vuelve a
  // intentarlo»); en el nombre de una cosa, no.
  const enclitico = t.match(ENCLITICO);
  if (enclitico) return { regla: `verbo con pronombre pegado («${enclitico[0]}»)`, propuesta: "el sustantivo de la acción" };
  if (IMPERATIVO.test(t)) return { regla: "el rótulo está en imperativo de 2.ª persona", propuesta: "el sustantivo" };

  const palabras = t.replace(/[:·.…]+$/, "").split(" ").filter(Boolean);
  if (palabras.length > MAX_PALABRAS_ROTULO)
    return { regla: `rótulo de ${palabras.length} palabras (máximo ${MAX_PALABRAS_ROTULO})`, propuesta: "el sustantivo corto" };

  const primera = sinTildes(palabras[0].replace(/[^\wÁÉÍÓÚÑáéíóúñ]/g, ""));
  if (!primera) return null;
  if (NO_ES_SUSTANTIVO.has(primera))
    return { regla: `el rótulo empieza por «${palabras[0]}», no por el nombre de la cosa`, propuesta: "el sustantivo" };
  if (INFINITIVO.test(palabras[0]) && !NO_ES_VERBO.has(primera))
    return { regla: `el rótulo empieza por el verbo «${palabras[0]}»`, propuesta: "el sustantivo de la cosa" };
  return null;
}

// ─── 3. De dónde se saca lo que se ve en pantalla ────────────────────────────

/**
 * Atributos y claves cuyo valor ES el nombre de una cosa: va con la vara dura.
 * Fuera quedan a propósito `placeholder`, `titulo`/`title` y `aria-label`:
 * el glosario manda ahí frases («Seleccionar período», «Cómo se calcula») y
 * `aria-label`/`title` nombran la ACCIÓN de un botón de ícono («Cerrar»).
 */
const ATRIBUTOS_ROTULO = /(?<![\w-])(?:label|etiqueta|rotulo|encabezado|header|columna|estado)\s*[=:]\s*["'`]([^"'`]{3,80})["'`]/g;
/** Atributos y claves que llevan una frase: ayuda, avisos, descripciones, acciones. */
const ATRIBUTOS_TEXTO = /(?<![\w-])(?:ayuda|descripcion|descripción|mensaje|nota|subtitulo|subtítulo|detalle|texto|leyenda|tooltip|vacio|vacío|placeholder|titulo|title|aria-label)\s*[=:]\s*["'`]([^"'`]{3,160})["'`]/g;
/** El texto de un <th> o de un <label> es un rótulo, pase lo que pase. */
const ROTULO_JSX = /<(?:th|label)\b[^>]*>([^<>{}]{3,80})</g;
/** Texto suelto de JSX: lo que se lee entre etiquetas. */
const TEXTO_JSX = /<\/?[A-Za-z][^<>]*>\s*([A-ZÁÉÍÓÚÑ¿][^<>{}]{2,160}?)\s*</g;
/** Arrays de encabezados de PDF y de Excel: `const ENCABEZADOS = ["Cliente", …]`. */
const ARRAY_ENCABEZADOS = /\b(?:encabezados?|columnas?|headers?|titulos?|t[ií]tulos?)\b[^=]*=\s*\[([^\]]{3,600})\]/gi;
const LITERAL = /["'`]([^"'`\n]{3,80})["'`]/g;
/**
 * Un `label` que viene con una acción al lado (`{ label: "Eliminar", onClick }`,
 * el «···») NO es el nombre de una cosa: es un BOTÓN, y un botón dice lo que
 * hace (docs/diseno.md, regla 6). Baja a la vara blanda.
 */
const ES_ACCION = /\bon(?:Click|Select|Press)\b|\bhref\s*[=:]|\bdestructive\b/;

/** Ruido de código que nunca se ve en pantalla: clases, rutas, claves, SQL. */
function esTextoHumano(t: string): boolean {
  if (!/^[¿«"A-ZÁÉÍÓÚÑ]/.test(t)) return false; // en pantalla todo arranca en mayúscula
  if (/[{}<>$\\|=]|\$\{|\/\/|^\/|\.\w{2,4}$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false; // CONSTANTE_ASI
  if (/-(?:\d{2,3}|\[)/.test(t) || /\b(?:px|rem|text|bg|border|flex|grid|rounded|hover)-/.test(t)) return false; // Tailwind
  if (/\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|NULL|UTF-8|GET|POST)\b/.test(t)) return false;
  return /[a-záéíóúñ]/.test(t); // algo en minúscula: no es una sigla ni un código
}

function* archivos(dir: string, ext: RegExp): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "__tests__" && n !== "node_modules") yield* archivos(p, ext);
    } else if (ext.test(n) && !n.includes(".test.")) yield p;
  }
}

/** Borra comentarios de bloque y de línea sin mover los renglones. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const lineaDe = (src: string, i: number) => src.slice(0, i).split("\n").length;

/** Los textos de pantalla de un archivo, cada uno con su vara. */
export function textosDe(src: string, esPantalla: boolean): { linea: number; texto: string; clase: Clase }[] {
  const limpio = sinComentarios(src);
  const out: { linea: number; texto: string; clase: Clase }[] = [];
  const agregar = (texto: string, i: number, clase: Clase) => {
    if (esTextoHumano(texto)) out.push({ linea: lineaDe(limpio, i), texto: texto.trim(), clase });
  };
  const renglon = (i: number) => limpio.slice(limpio.lastIndexOf("\n", i) + 1, (limpio.indexOf("\n", i) + 1 || limpio.length + 1) - 1);
  for (const m of limpio.matchAll(ATRIBUTOS_ROTULO)) agregar(m[1], m.index, ES_ACCION.test(renglon(m.index)) ? "texto" : "rotulo");
  for (const m of limpio.matchAll(ATRIBUTOS_TEXTO)) agregar(m[1], m.index, "texto");
  for (const m of limpio.matchAll(ARRAY_ENCABEZADOS))
    for (const l of m[1].matchAll(LITERAL)) agregar(l[1], m.index, "rotulo");
  if (esPantalla) {
    for (const m of limpio.matchAll(ROTULO_JSX)) agregar(m[1], m.index, "rotulo");
    for (const m of limpio.matchAll(TEXTO_JSX)) agregar(m[1], m.index, "texto");
  }
  return out;
}

/** Revisa todo el sistema (o la carpeta que se le pase, relativa a cxc/). */
export function revisarTodo(carpetas = ["src/app", "src/components", "src/lib"]): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const c of carpetas) {
    const abs = path.join(RAIZ, c);
    if (!statSync(abs).isDirectory()) continue;
    for (const f of archivos(abs, /\.tsx?$/)) {
      const rel = path.relative(RAIZ, f);
      const src = readFileSync(f, "utf8");
      for (const { linea, texto, clase } of textosDe(src, f.endsWith(".tsx"))) {
        const mal = revisarTexto(texto, clase);
        if (mal) out.push({ archivo: rel, linea, texto, clase, ...mal });
      }
    }
  }
  return out;
}

export const porArchivo = (hs: Hallazgo[]): Record<string, number> =>
  hs.reduce<Record<string, number>>((a, h) => ((a[h.archivo] = (a[h.archivo] ?? 0) + 1), a), {});

if (process.argv[1] && /revisar-nombres\.ts$/.test(process.argv[1])) {
  const hallazgos = revisarTodo(process.argv[2] ? [process.argv[2]] : undefined);
  for (const h of hallazgos)
    console.log(`${h.archivo}:${h.linea} [${h.clase}] «${h.texto}» → ${h.regla}${h.propuesta ? ` · usa ${h.propuesta}` : ""}`);
  const cuenta = porArchivo(hallazgos);
  console.log(`\n${hallazgos.length} textos fuera de la norma en ${Object.keys(cuenta).length} archivos.`);
  console.log(
    Object.entries(cuenta)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([f, n]) => `  ${n}\t${f}`)
      .join("\n"),
  );
  process.exit(hallazgos.length ? 1 : 0);
}
