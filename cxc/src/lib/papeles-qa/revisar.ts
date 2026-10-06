// ─────────────────────────────────────────────────────────────────────────────
// REVISIÓN AUTOMÁTICA DE LOS PAPELES (6-oct-2026). Solo la usan la prueba
// `papeles-sin-encimar.test.ts` y `scripts/revisar-papeles.ts`; la app no.
//
// Daniel: «no quiero tener que buscar PDF por PDF para ver que salga bien».
//
// · PDF: lee la posición de cada texto (pdfjs-dist, ya instalado) y acusa dos
//   cajas de texto que se pisan o un texto que se sale de la hoja.
// · PDF: el encabezado de una columna de NÚMEROS se alinea como sus números
//   (Daniel, 6-oct: «Subtotal» a la izquierda y sus montos a la derecha).
// · Excel: el renglón «Total…» lleva FÓRMULAS, y ninguna celda dice «#».
//
// ⚠️ Mide TEXTO contra TEXTO. Una raya o un logo encima de un texto no se ve
// aquí: para eso está la galería del script.
// ─────────────────────────────────────────────────────────────────────────────

import XLSX from "xlsx-js-style";

export interface Caja {
  pagina: number;
  texto: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cuánto se tienen que pisar dos cajas (en puntos, en los dos ejes) para acusarlas. */
const TOLERANCIA = 1;
/**
 * Aire mínimo contra el borde de la hoja: 2 mm. ⚠️ pdfjs CORTA las letras que
 * caen fuera de la hoja (de «se sale de la hoja» lee «se sale de l»), así que un
 * texto cortado se reconoce porque llega pegado al borde.
 */
const AIRE_AL_BORDE = (2 / 25.4) * 72;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pdfjs(): Promise<any> {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function abrirPdf(bytes: Uint8Array): Promise<any> {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
}

/** Las cajas de texto de todas las hojas, en puntos, con el origen abajo a la izquierda. */
export async function cajasDeTexto(bytes: Uint8Array): Promise<{ cajas: Caja[]; hojas: { ancho: number; alto: number }[] }> {
  const pdf = await abrirPdf(bytes);
  const cajas: Caja[] = [];
  const hojas: { ancho: number; alto: number }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [, , ancho, alto] = page.view as number[];
    hojas.push({ ancho, alto });
    const { items } = await page.getTextContent();
    for (const it of items as { str: string; transform: number[]; width: number; height: number }[]) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, e, f] = it.transform;
      const tam = Math.hypot(c, d) || it.height;
      // Texto girado (etiquetas, sellos): caja por sus cuatro esquinas.
      const ux = a / (Math.hypot(a, b) || 1);
      const uy = b / (Math.hypot(a, b) || 1);
      const w = it.width;
      const sube = 0.75 * tam; // alto de mayúscula, aprox.
      const baja = 0.2 * tam; // descendentes
      const esquinas = [
        [e - uy * -baja, f + ux * -baja],
        [e + ux * w - uy * -baja, f + uy * w + ux * -baja],
        [e - uy * sube, f + ux * sube],
        [e + ux * w - uy * sube, f + uy * w + ux * sube],
      ];
      const xs = esquinas.map((q) => q[0]);
      const ys = esquinas.map((q) => q[1]);
      cajas.push({ pagina: p, texto: it.str, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
  }
  return { cajas, hojas };
}

export interface Problema {
  pagina: number;
  tipo: "encimado" | "fuera de la hoja" | "columna desalineada" | "color fuera de la paleta";
  detalle: string;
}

const corto = (t: string) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);

/** Encimados y textos que se salen de la hoja. Vacío = el papel está bien. */
export async function revisarPdf(bytes: Uint8Array): Promise<Problema[]> {
  const { cajas, hojas } = await cajasDeTexto(bytes);
  const problemas: Problema[] = [];
  for (const k of cajas) {
    const h = hojas[k.pagina - 1];
    if (k.x0 < AIRE_AL_BORDE || k.y0 < AIRE_AL_BORDE || k.x1 > h.ancho - AIRE_AL_BORDE || k.y1 > h.alto - AIRE_AL_BORDE) {
      problemas.push({ pagina: k.pagina, tipo: "fuera de la hoja", detalle: `«${corto(k.texto)}»` });
    }
  }
  // ponytail: O(n²) por hoja; los papeles traen cientos de textos, no miles.
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i];
      const b = cajas[j];
      if (a.pagina !== b.pagina) continue;
      const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (dx > TOLERANCIA && dy > TOLERANCIA) {
        problemas.push({ pagina: a.pagina, tipo: "encimado", detalle: `«${corto(a.texto)}» pisa «${corto(b.texto)}»` });
      }
    }
  }
  problemas.push(...columnasDesalineadas(cajas));
  return problemas;
}

/** Un número de tabla: «$1,180.35», «-0.60», «12», «45.5». Nada de letras. */
const esNumero = (t: string) => /^[-$(]*\d[\d,.]*\)?%?$/.test(t.trim());
/** Cuánto pueden diferir dos bordes (o dos centros) para contar como alineados. */
const ALINEADO = 3;
/** Letra de tabla, no de título: más alto que esto no se mide (el «$40.67», el bulto de la etiqueta). */
const ALTO_DE_TABLA = 14;

/** Lo más lejos (en puntos) que puede estar el encabezado del primer número de su columna. */
const HASTA_EL_ENCABEZADO = 60;
/** Un número a menos de esto encima es el renglón anterior de la MISMA tabla. */
const OTRO_RENGLON = 40;

/**
 * 🔴 EL ENCABEZADO VA COMO SU COLUMNA. Para cada número se mira el renglón de
 * texto que tiene justo encima. Si ese renglón es un ENCABEZADO —tres textos o
 * más y casi ningún número—, se busca el título de su columna, y
 * tienen que compartir el borde derecho, el izquierdo o el centro (las
 * columnas centradas, como «Bultos»). Un renglón con números encima es cuerpo
 * de tabla: ese número no es el primero de su columna y no se mide.
 */
export function columnasDesalineadas(cajas: Caja[]): Problema[] {
  const problemas: Problema[] = [];
  const alto = (k: Caja) => k.y1 - k.y0;
  for (const n of cajas) {
    if (!esNumero(n.texto) || alto(n) > ALTO_DE_TABLA) continue;
    const encima = cajas.filter((k) => k.pagina === n.pagina && k.y0 >= n.y1 - 1 && k.y0 - n.y1 <= HASTA_EL_ENCABEZADO);
    if (!encima.length) continue;
    // No es el primero de su columna: tiene otro número justo encima (el
    // renglón de arriba puede ser la segunda línea de un nombre largo).
    if (encima.some((k) => esNumero(k.texto) && k.y0 - n.y1 <= OTRO_RENGLON && Math.min(k.x1, n.x1) - Math.max(k.x0, n.x0) > 0)) continue;
    const base = Math.min(...encima.map((k) => k.y0));
    const renglon = encima.filter((k) => Math.abs(k.y0 - base) <= 2);
    // Un encabezado puede traer un número suelto («Extra 1.25» partido en dos); un renglón del cuerpo trae muchos.
    const numeros = renglon.filter((k) => esNumero(k.texto)).length;
    if (renglon.length - numeros < 3 || numeros * 4 > renglon.length || renglon.some((k) => alto(k) > ALTO_DE_TABLA)) continue;
    // El título de su columna es el último que EMPIEZA antes de donde termina
    // el número: vale para encabezados a la izquierda, a la derecha y centrados.
    const titulo = renglon.filter((k) => k.x0 < n.x1).sort((a, b) => b.x0 - a.x0)[0];
    if (!titulo) continue;
    const der = Math.abs(titulo.x1 - n.x1) <= ALINEADO;
    const izq = Math.abs(titulo.x0 - n.x0) <= ALINEADO;
    const centro = Math.abs((titulo.x0 + titulo.x1) / 2 - (n.x0 + n.x1) / 2) <= ALINEADO;
    if (!der && !izq && !centro) {
      problemas.push({ pagina: n.pagina, tipo: "columna desalineada", detalle: `«${corto(titulo.texto)}» no se alinea con «${corto(n.texto)}»` });
    }
  }
  return problemas;
}

/**
 * 🔴 LOS COLORES SALEN SOLO DE LA PALETA DEL PAPEL (`pdf-estilo.ts`, 6-oct-2026).
 * Daniel: «Algunos PDF en azul, gris, negro. No hay congruencia». Lee del
 * archivo cada color de relleno, de texto y de raya, y devuelve los que no
 * son de `PALETA_PAPEL` (con en qué hoja salen). Las fotos y el logo son
 * imágenes: no cuentan.
 */
export async function coloresFueraDePaleta(bytes: Uint8Array, paleta: ReadonlySet<string>): Promise<Problema[]> {
  const lib = await pdfjs();
  // jsPDF guarda cada canal con 2 decimales (0–1): #f9fafb vuelve como #fafafa.
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const permitidos = [...paleta].map(rgb);
  const enPaleta = (h: string) => permitidos.some((q) => rgb(h).every((v, k) => Math.abs(v - q[k]) <= 3));
  const pdf = await abrirPdf(bytes);
  const problemas: Problema[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const ops = await (await pdf.getPage(p)).getOperatorList();
    const vistos = new Set<string>();
    ops.fnArray.forEach((fn: number, i: number) => {
      if (fn !== lib.OPS.setFillRGBColor && fn !== lib.OPS.setStrokeRGBColor) return;
      const c = String(ops.argsArray[i]?.[0] ?? "").toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(c) && !enPaleta(c) && !vistos.has(c)) {
        vistos.add(c);
        problemas.push({ pagina: p, tipo: "color fuera de la paleta", detalle: c });
      }
    });
  }
  return problemas;
}

/**
 * La paleta del papel, leída de `docs/marca.md` (entre `<!-- paleta:inicio -->`
 * y `<!-- paleta:fin -->`). La revisión de color mide contra ESTO, no contra el
 * código: el brandbook escrito manda. Solo para Node (la prueba y el script).
 */
export async function paletaDeMarca(): Promise<Set<string>> {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const md = readFileSync(path.join(process.cwd(), "docs/marca.md"), "utf8");
  const tramo = md.split("<!-- paleta:inicio -->")[1]?.split("<!-- paleta:fin -->")[0] ?? "";
  return new Set((tramo.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()));
}

/** Excel: el renglón que dice «Total…» suma con fórmulas, y nada dice «#». */
export function revisarExcel(bytes: Uint8Array): string[] {
  const wb = XLSX.read(bytes, { type: "array", cellFormula: true });
  const problemas: string[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (!ws["!ref"]) continue;
    const r = XLSX.utils.decode_range(ws["!ref"]);
    for (let fila = r.s.r; fila <= r.e.r; fila++) {
      let esTotal = false;
      const numeros: string[] = [];
      for (let col = r.s.c; col <= r.e.c; col++) {
        const ref = XLSX.utils.encode_cell({ r: fila, c: col });
        const c = ws[ref];
        if (!c) continue;
        if (typeof c.v === "string" && c.v.trim().startsWith("#")) problemas.push(`${nombre}!${ref} dice «${c.v}»`);
        if (c.t === "e") problemas.push(`${nombre}!${ref} tiene un error`);
        if (typeof c.v === "string" && /^total\b/i.test(c.v.trim())) esTotal = true;
        if (c.t === "n" && !c.f) numeros.push(ref);
      }
      if (esTotal && numeros.length) problemas.push(`${nombre}: el total de la fila ${fila + 1} es número fijo (${numeros.join(", ")}), no fórmula`);
    }
  }
  return problemas;
}
