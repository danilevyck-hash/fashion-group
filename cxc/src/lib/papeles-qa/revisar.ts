// ─────────────────────────────────────────────────────────────────────────────
// REVISIÓN AUTOMÁTICA DE LOS PAPELES (6-oct-2026). Solo la usan la prueba
// `papeles-sin-encimar.test.ts` y `scripts/revisar-papeles.ts`; la app no.
//
// Daniel: «no quiero tener que buscar PDF por PDF para ver que salga bien».
//
// · PDF: lee la posición de cada texto (pdfjs-dist, ya instalado) y acusa dos
//   cajas de texto que se pisan o un texto que se sale de la hoja.
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
  tipo: "encimado" | "fuera de la hoja";
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
  return problemas;
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
