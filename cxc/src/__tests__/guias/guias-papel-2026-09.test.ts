/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL PAPEL DE LA GUÍA, HACIA ADELANTE (24-sep-2026) — `GUIA_PAPEL_2026_09`
 *
 * Seis cosas cambian en el PDF que se imprime y se comparte, y ninguna toca una
 * sola fila de la base:
 *   1. las dos firmas salen cada una bajo SU rótulo (en transportista externo
 *      salían cruzadas);
 *   2. el título dice de qué guía se trata y la fila «TIPO» se retira;
 *   3. la columna «DIRECCIÓN» pasa a llamarse «DESTINO»;
 *   4. los renglones del mismo cliente van juntos, con el nombre repetido en
 *      todos y una raya gris entre clientes;
 *   5. las firmas quedan pegadas debajo de observaciones y el pie legal al pie
 *      de la hoja — y con varias hojas, las dos cosas van en la ÚLTIMA;
 *   6. «N° GUÍA» y «N° GUÍA TRANSP.» con el signo de grado.
 *
 * 📏 MEDIDO CONTRA PRODUCCIÓN el 24-sep-2026 (`guia_transporte`, filas vivas):
 * 239 guías vivas · 222 en modo externo · **157 de esas 222 con las DOS
 * firmas**, o sea 157 papeles con las firmas cambiadas de caja. Las 17 de
 * entrega directa salían bien y no se mueven.
 *
 * 🔑 EL PAPEL SE ARMA DE VERDAD Y SE LEE: el texto con pdfjs (mirar el código no
 * dice si algo se dibujó en la hoja 3), y la POSICIÓN de cada firma leyendo los
 * XObject del PDF ya generado — que es lo único que distingue una caja de la
 * otra, porque las dos dicen «FIRMA:».
 *
 * 🔴 Y SE PRUEBAN LAS DOS FORMAS DEL PAPEL: con el interruptor apagado el
 * documento vuelve a decir «GUÍA DE TRANSPORTE INTERIOR», «TIPO», «DIRECCIÓN»,
 * el orden original de los renglones y las firmas en las cajas de antes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { jsPDF } from "jspdf";

// ── La perilla del interruptor ───────────────────────────────────────────────
// Las funciones puras reciben el interruptor como último parámetro (el mismo
// patrón que `PAPEL_SOLO_PAGABLE` en Comisiones), así que apagarlo corre el
// CÓDIGO DE VERDAD y no una segunda implementación escrita para el test.
const perilla = vi.hoisted(() => ({ nuevo: true }));

vi.mock("@/lib/guias/papel-2026-09", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/guias/papel-2026-09")>();
  return {
    ...real,
    get GUIA_PAPEL_2026_09() {
      return perilla.nuevo;
    },
    tituloDelPapel: (g: Parameters<typeof real.tituloDelPapel>[0]) =>
      real.tituloDelPapel(g, perilla.nuevo),
    seDibujaLaFilaTipo: () => real.seDibujaLaFilaTipo(perilla.nuevo),
    rotuloDestino: () => real.rotuloDestino(perilla.nuevo),
    rotuloNumeroGuia: () => real.rotuloNumeroGuia(perilla.nuevo),
    rotuloNumeroTransp: () => real.rotuloNumeroTransp(perilla.nuevo),
    rotuloColumnaNumeroTransp: () => real.rotuloColumnaNumeroTransp(perilla.nuevo),
    renglonesDelPapel: (items: ReadonlyArray<{ cliente?: string | null }>) =>
      real.renglonesDelPapel(items, perilla.nuevo),
    firmasDelPapel: (g: Parameters<typeof real.firmasDelPapel>[0]) =>
      real.firmasDelPapel(g, perilla.nuevo),
  };
});

import { construirPdfGuia } from "@/lib/guias/pdf-guia";
import {
  PIE_LEGAL_Y,
  TITULO_DIRECTA,
  TITULO_EXTERNO,
  TITULO_VIEJO,
  claveDeCliente,
  firmasDelPapel,
  renglonesDelPapel,
} from "@/lib/guias/papel-2026-09";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

// ── Dos firmas DISTINGUIBLES ─────────────────────────────────────────────────
// PNG de verdad (uno de 2×2 y otro de 3×3): el ancho declarado en el XObject es
// lo que permite decir cuál de las dos quedó en cuál caja. Un base64 inventado
// no sirve — `addImage` va en try/catch y la firma desaparecería sin error.
const FIRMA_PRIMER_CUADRO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=";
const ANCHO_PRIMER_CUADRO = 2;
const FIRMA_SEGUNDO_CUADRO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAEElEQVR4nGP4z8AAQQxYWACPjgj4kWPEuQAAAABJRU5ErkJggg==";
const ANCHO_SEGUNDO_CUADRO = 3;

function renglon(cliente: string, factura: string, bultos: number): GuiaItem {
  return {
    orden: 1,
    cliente,
    direccion: `Destino de ${cliente}`,
    empresa: "Fashion Wear",
    facturas: factura,
    bultos,
    numero_guia_transp: "",
  };
}

// Tres clientes INTERCALADOS a propósito: es el caso que Daniel describió —una
// guía con facturas de varios clientes salteadas— y el que hay que juntar.
const RENGLONES: GuiaItem[] = [
  renglon("SUPERTIENDA COLON", "F-1", 4),
  renglon("BAZAR CHITRE", "F-2", 2),
  renglon("SUPERTIENDA COLON", "F-3", 1),
  renglon("ALMACEN PENONOME", "F-4", 5),
  renglon("BAZAR CHITRE", "F-5", 3),
];

const GUIA_EXTERNA: Guia = {
  id: "g-ext",
  numero: 501,
  fecha: "2026-09-18",
  transportista: "Transporte Rápido S.A.",
  modo_entrega: "transportista",
  placa: "AB-1234",
  observaciones: "Dos bultos van en caja aparte.",
  total_bultos: 15,
  item_count: 5,
  estado: "Completada",
  tipo_despacho: "externo",
  receptor_nombre: "Luis Pérez",
  cedula: "8-888-8888",
  entregado_por: "Angela García",
  numero_guia_transp: "TR-900",
  firma_base64: FIRMA_PRIMER_CUADRO,
  firma_entregador_base64: FIRMA_SEGUNDO_CUADRO,
  guia_items: RENGLONES,
};

const GUIA_DIRECTA: Guia = {
  ...GUIA_EXTERNA,
  id: "g-dir",
  numero: 502,
  transportista: "Camión propio",
  modo_entrega: "entrega_directa",
  tipo_despacho: "directo",
  placa: "",
  numero_guia_transp: "",
  nombre_chofer: "Marcos Rodríguez",
};

// ── Leer el PDF ──────────────────────────────────────────────────────────────

interface Pedazo {
  texto: string;
  pagina: number;
  /** Altura sobre el borde INFERIOR de la hoja, en puntos. */
  y: number;
}

/** El texto del PDF de verdad, hoja por hoja, con la posición de cada pedazo. */
async function pedazos(doc: jsPDF): Promise<Pedazo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
    useSystemFonts: true,
  }).promise;
  const out: Pedazo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      out.push({ texto: item.str, pagina: i, y: item.transform?.[5] ?? 0 });
    }
  }
  return out;
}

const textoDeLaHoja = (ps: Pedazo[], pagina: number) =>
  ps.filter((p) => p.pagina === pagina).map((p) => p.texto).join("\n");

const textoEntero = (ps: Pedazo[]) => ps.map((p) => p.texto).join("\n");

/**
 * Dónde quedó dibujada cada imagen del PDF y de qué ancho es.
 *
 * ⚠️ Esto NO se puede preguntar por el texto: las dos cajas de firma dicen
 * «FIRMA:» igual, así que lo único que distingue una firma de la otra es su
 * posición horizontal y el ancho del PNG. Se lee del documento ya generado —
 * jsPDF no comprime estos streams—, que es el mismo método que ya usan otros
 * candados de guías para contar los XObject.
 */
function imagenesDelPdf(doc: jsPDF): Array<{ x: number; ancho: number }> {
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const anchoDe = new Map<string, number>();
  for (const dict of crudo.matchAll(/\/XObject <<([\s\S]*?)>>/g)) {
    for (const ref of dict[1].matchAll(/\/(I\d+)\s+(\d+)\s+0\s+R/g)) {
      const cuerpo = new RegExp(`(?:^|\\n)${ref[2]} 0 obj\\n([\\s\\S]{0,600}?)stream`).exec(crudo);
      const ancho = Number(/\/Width (\d+)/.exec(cuerpo?.[1] ?? "")?.[1] ?? 0);
      anchoDe.set(ref[1], ancho);
    }
  }
  return [...crudo.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/(I\d+) Do/g)].map((m) => ({
    x: Number(m[3]),
    ancho: anchoDe.get(m[5]) ?? 0,
  }));
}

/** Las dos firmas, sin el logo (que es el único PNG grande del documento). */
function firmasDibujadas(doc: jsPDF) {
  const todas = imagenesDelPdf(doc).filter((i) => i.ancho < 10);
  const izquierda = todas.find((i) => i.x < 200);
  const derecha = todas.find((i) => i.x >= 200);
  return { izquierda: izquierda?.ancho ?? null, derecha: derecha?.ancho ?? null };
}

beforeEach(() => {
  perilla.nuevo = true;
});

// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1 · el interruptor", () => {
  it("vive en su propio módulo puro y hoy está PRENDIDO", () => {
    const fuente = leer("src/lib/guias/papel-2026-09.ts");
    expect(fuente).toContain("export const GUIA_PAPEL_2026_09 = true;");
    // El PDF lo APLICA, no lo redefine.
    expect(leer("src/lib/guias/pdf-guia.ts")).toContain(
      'from "@/lib/guias/papel-2026-09"',
    );
  });

  it("🔴 nada de esto toca la base: ni migración ni UPDATE de firmas", () => {
    const fuente = leer("src/lib/guias/papel-2026-09.ts");
    expect(fuente).not.toMatch(/supabase|createClient|\.update\(|\.upsert\(|\.insert\(/i);
    // Y el PDF tampoco escribe: solo dibuja.
    expect(leer("src/lib/guias/pdf-guia.ts")).not.toMatch(/supabase|createClient/i);
  });
});

describe("🔴 2 · el título dice de qué guía se trata, y «TIPO» se va", () => {
  it("transportista externo → «GUÍA DE TRANSPORTE EXTERNO»", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    expect(t).toContain(TITULO_EXTERNO);
    expect(t).not.toContain(TITULO_VIEJO);
    expect(t).not.toContain(TITULO_DIRECTA);
  });

  it("entrega directa → «GUÍA DE ENTREGA DIRECTA»", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_DIRECTA)));
    expect(t).toContain(TITULO_DIRECTA);
    expect(t).not.toContain(TITULO_VIEJO);
    expect(t).not.toContain(TITULO_EXTERNO);
  });

  it("la fila «TIPO» ya no se dibuja en ninguno de los dos modos", async () => {
    for (const g of [GUIA_EXTERNA, GUIA_DIRECTA]) {
      const t = textoEntero(await pedazos(construirPdfGuia(g)));
      expect(t, `${g.id} sigue dibujando TIPO`).not.toMatch(/TIPO/);
    }
  });

  it("los números llevan el signo de grado", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    expect(t).toContain("N° GUÍA:");
    expect(t).toContain("N° GUÍA TRANSP.");
    expect(t).not.toContain("N GUÍA:");
  });
});

describe("🔴 3 · la columna se llama DESTINO", () => {
  it("el encabezado dice DESTINO y ya no dice DIRECCIÓN", async () => {
    for (const g of [GUIA_EXTERNA, GUIA_DIRECTA]) {
      const t = textoEntero(await pedazos(construirPdfGuia(g)));
      expect(t).toContain("DESTINO");
      expect(t, `${g.id} sigue diciendo DIRECCIÓN`).not.toContain("DIRECCIÓN");
    }
  });
});

describe("🔴 4 · los renglones, juntos por cliente", () => {
  it("la regla pura agrupa por PRIMERA APARICIÓN y conserva el orden de adentro", () => {
    const rs = renglonesDelPapel(RENGLONES);
    expect(rs.map((r) => r.item.facturas)).toEqual(["F-1", "F-3", "F-2", "F-5", "F-4"]);
    // Solo la PRIMERA de cada cliente lleva la raya.
    expect(rs.map((r) => r.primeroDeSuGrupo)).toEqual([true, false, true, false, true]);
    // Y no se pierde ni se repite un renglón.
    expect(rs.length).toBe(RENGLONES.length);
  });

  it("no ordena alfabéticamente: el primero en aparecer va primero", () => {
    const rs = renglonesDelPapel(RENGLONES);
    expect(rs[0].item.cliente).toBe("SUPERTIENDA COLON");
    expect(rs[rs.length - 1].item.cliente).toBe("ALMACEN PENONOME");
  });

  it("agrupa por igualdad exacta normalizada, nunca por parecido", () => {
    expect(claveDeCliente("  City Mall  ")).toBe(claveDeCliente("CITY MALL"));
    expect(claveDeCliente("City Mall David")).not.toBe(claveDeCliente("City Mall"));
    const mezcla = renglonesDelPapel([
      renglon("City Mall", "F-1", 1),
      renglon("BAZAR", "F-2", 1),
      renglon("  CITY MALL ", "F-3", 1),
    ]);
    expect(mezcla.map((r) => r.item.facturas)).toEqual(["F-1", "F-3", "F-2"]);
  });

  it("🔴 en el PDF los renglones salen agrupados y numerados 1..N sobre el orden NUEVO", async () => {
    const ps = await pedazos(construirPdfGuia(GUIA_EXTERNA));
    const t = textoEntero(ps);
    const orden = ["F-1", "F-3", "F-2", "F-5", "F-4"].map((f) => t.indexOf(f));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    for (const n of ["1", "2", "3", "4", "5"]) expect(t.split("\n")).toContain(n);
  });

  it("🔴 el nombre del cliente se escribe en TODOS los renglones", async () => {
    // Daniel: «que se repita para que no haya confusión». No es solo la primera
    // fila de cada grupo: son las cinco.
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    const veces = (s: string) => t.split("\n").filter((l) => l.trim() === s).length;
    expect(veces("SUPERTIENDA COLON")).toBe(2);
    expect(veces("BAZAR CHITRE")).toBe(2);
    expect(veces("ALMACEN PENONOME")).toBe(1);
  });

  it("🔴 el total de bultos NO cambia: el mismo antes y después", async () => {
    const suma = RENGLONES.reduce((s, i) => s + i.bultos, 0);
    const totalDelPdf = async () => {
      const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
      const i = t.indexOf("TOTAL DE BULTOS DESPACHADOS");
      expect(i).toBeGreaterThan(-1);
      return t.slice(i).split("\n").map((l) => l.trim()).filter(Boolean)[1];
    };
    const conElPapelNuevo = await totalDelPdf();
    perilla.nuevo = false;
    const conElPapelViejo = await totalDelPdf();
    expect(conElPapelNuevo).toBe(String(suma));
    expect(conElPapelNuevo).toBe(conElPapelViejo);
  });
});

describe("🔴 5 · cada firma bajo SU rótulo", () => {
  it("la regla pura cruza SOLO en transportista externo", () => {
    const ext = firmasDelPapel(GUIA_EXTERNA);
    expect(ext.izquierda).toBe(FIRMA_SEGUNDO_CUADRO); // «Despachado por»
    expect(ext.derecha).toBe(FIRMA_PRIMER_CUADRO); // «Recibido Conforme — Transportista»

    const dir = firmasDelPapel(GUIA_DIRECTA);
    expect(dir.izquierda).toBe(FIRMA_PRIMER_CUADRO); // «Chofer»
    expect(dir.derecha).toBe(FIRMA_SEGUNDO_CUADRO); // «Recibido por — Cliente»
  });

  it("🔴 en el PDF de verdad, la firma del transportista queda en la caja DERECHA", () => {
    const doc = construirPdfGuia(GUIA_EXTERNA);
    const { izquierda, derecha } = firmasDibujadas(doc);
    expect(derecha).toBe(ANCHO_PRIMER_CUADRO);
    expect(izquierda).toBe(ANCHO_SEGUNDO_CUADRO);
  });

  it("⚠️ en entrega directa NO se mueve nada", () => {
    const { izquierda, derecha } = firmasDibujadas(construirPdfGuia(GUIA_DIRECTA));
    expect(izquierda).toBe(ANCHO_PRIMER_CUADRO);
    expect(derecha).toBe(ANCHO_SEGUNDO_CUADRO);
  });

  it("el PDF sigue trayendo las DOS imágenes de firma, enteras", () => {
    const todas = imagenesDelPdf(construirPdfGuia(GUIA_EXTERNA));
    expect(todas.filter((i) => i.ancho < 10).length).toBe(2);
  });

  it("una guía a la que le falta una firma no inventa la otra", () => {
    const media: Guia = { ...GUIA_EXTERNA, firma_entregador_base64: undefined };
    const { izquierda, derecha } = firmasDibujadas(construirPdfGuia(media));
    expect(izquierda).toBeNull();
    expect(derecha).toBe(ANCHO_PRIMER_CUADRO);
  });
});

describe("🔴 6 · el acomodo de la hoja", () => {
  const guiaLarga = (n: number): Guia => ({
    ...GUIA_EXTERNA,
    guia_items: Array.from({ length: n }, (_, i) =>
      renglon(`CLIENTE ${String(i).padStart(2, "0")}`, `F-${i + 100}`, 1),
    ),
  });

  it("el pie legal cae al PIE de la hoja, no a media página", async () => {
    const abajo = async (nuevo: boolean) => {
      perilla.nuevo = nuevo;
      const ps = await pedazos(construirPdfGuia(GUIA_EXTERNA));
      const legal = ps.find((p) => p.texto.includes("La firma del transportista"));
      expect(legal).toBeTruthy();
      return legal!.y;
    };
    const conNuevo = await abajo(true);
    const conViejo = await abajo(false);
    // Menos altura sobre el borde inferior = más abajo en la hoja.
    expect(conNuevo).toBeLessThan(conViejo);
    expect(conNuevo).toBeLessThan(45);
    // Y coincide con la constante del módulo (mm desde arriba → pt desde abajo).
    expect(conNuevo).toBeCloseTo((279.4 - (PIE_LEGAL_Y + 5)) * (72 / 25.4), 0);
  });

  it("🔴 con varias hojas, las firmas y el pie legal van en la ÚLTIMA", async () => {
    const ps = await pedazos(construirPdfGuia(guiaLarga(70)));
    const hojas = Math.max(...ps.map((p) => p.pagina));
    expect(hojas).toBeGreaterThan(1);
    const ultima = textoDeLaHoja(ps, hojas);
    expect(ultima).toContain("Nombre y firma");
    expect(ultima).toContain("Nombre, cédula y firma");
    expect(ultima).toContain("La firma del transportista constituye aceptación expresa");
    for (let p = 1; p < hojas; p++) {
      const previa = textoDeLaHoja(ps, p);
      expect(previa, `la hoja ${p} ya dibuja las firmas`).not.toContain("Nombre y firma");
      expect(previa, `la hoja ${p} ya dibuja el pie legal`).not.toContain(
        "La firma del transportista constituye aceptación expresa",
      );
    }
  });

  it("y las firmas no se encabalgan con la tabla: si no entran, se abre una hoja", async () => {
    // 28 renglones dejan la tabla muy abajo en la primera hoja.
    const ps = await pedazos(construirPdfGuia(guiaLarga(28)));
    const hojas = Math.max(...ps.map((p) => p.pagina));
    const firmas = ps.filter((p) => p.texto === "FIRMA:");
    expect(firmas.length).toBe(2);
    for (const f of firmas) {
      expect(f.pagina).toBe(hojas);
      // Por encima del pie legal, siempre.
      expect(f.y).toBeGreaterThan(40);
    }
  });
});

describe("🔴 7 · con el interruptor APAGADO, el papel de siempre", () => {
  beforeEach(() => {
    perilla.nuevo = false;
  });

  it("vuelve el título, «TIPO» y «DIRECCIÓN»", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    expect(t).toContain(TITULO_VIEJO);
    expect(t).not.toContain(TITULO_EXTERNO);
    expect(t).toContain("TIPO:");
    expect(t).toContain("Transportista externo");
    expect(t).toContain("DIRECCIÓN");
    expect(t).not.toContain("DESTINO");
    expect(t).toContain("N GUÍA:");
    expect(t).not.toContain("N° GUÍA:");
  });

  it("vuelve el orden original de los renglones", async () => {
    expect(renglonesDelPapel(RENGLONES).map((r) => r.item.facturas)).toEqual([
      "F-1", "F-2", "F-3", "F-4", "F-5",
    ]);
    expect(renglonesDelPapel(RENGLONES).every((r) => !r.primeroDeSuGrupo)).toBe(true);
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    const orden = ["F-1", "F-2", "F-3", "F-4", "F-5"].map((f) => t.indexOf(f));
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("y las firmas vuelven a sus cajas de antes (las cruzadas)", () => {
    const { izquierda, derecha } = firmasDibujadas(construirPdfGuia(GUIA_EXTERNA));
    expect(izquierda).toBe(ANCHO_PRIMER_CUADRO);
    expect(derecha).toBe(ANCHO_SEGUNDO_CUADRO);
    // Y en entrega directa, igual que siempre.
    const dir = firmasDibujadas(construirPdfGuia(GUIA_DIRECTA));
    expect(dir.izquierda).toBe(ANCHO_PRIMER_CUADRO);
    expect(dir.derecha).toBe(ANCHO_SEGUNDO_CUADRO);
  });
});

describe("⚠️ CONTROL — lo que NO cambió", () => {
  it("el texto legal es palabra por palabra el mismo", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    expect(t).toContain(
      "La firma del transportista constituye aceptación expresa de la mercancía detallada en este",
    );
  });

  it("los rótulos de las dos cajas de firma no se tocaron", async () => {
    const ext = textoEntero(await pedazos(construirPdfGuia(GUIA_EXTERNA)));
    expect(ext).toContain("DESPACHADO POR");
    expect(ext).toContain("RECIBIDO CONFORME — TRANSPORTISTA");
    const dir = textoEntero(await pedazos(construirPdfGuia(GUIA_DIRECTA)));
    expect(dir).toContain("CHOFER");
    expect(dir).toContain("RECIBIDO POR — CLIENTE");
  });

  it("en entrega directa sigue sin dibujarse la placa ni el N° del transportista", async () => {
    const t = textoEntero(await pedazos(construirPdfGuia(GUIA_DIRECTA)));
    expect(t).not.toContain("PLACA");
    expect(t).not.toContain("GUÍA TRANSP.");
  });
});
