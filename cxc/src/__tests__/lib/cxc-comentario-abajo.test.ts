// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «COMENTARIO» SALE DE LA TABLA Y BAJA A UN COMENTARIO GENERAL (20-sep-2026).
//
// Daniel, textual: *«deja comentario abajo general como siempre»*.
//
// 🩸 QUÉ PASABA. «Comentario» era la TERCERA de las diez columnas del papel del
// cliente y era la ÚNICA en `auto`, así que se quedaba con todo el sobrante:
// **37,9 mm de los 191,9 mm útiles — el 20 % del ancho**. Y va **vacía en los
// 3.003 documentos**, porque el API de Switch (`/apicliente/estadocuenta`) no
// manda ese campo: se revisaron las 20 llaves de cada renglón y ninguna lo trae.
// Una quinta parte del papel en blanco a propósito, mientras «Comprobante» y
// «N. Interno» se partían en dos renglones por falta de sitio.
//
// LO QUE SE HIZO. Los 37,9 mm se reparten entre esas dos —«Comprobante» de 23 a
// **42 mm**, «N. Interno» de 24 a `auto` (~**42,9 mm**)— y el comentario baja al
// pie como un **recuadro en blanco**, con la forma que ya tiene la guía de
// despacho en «OBSERVACIONES GENERALES DEL ENVÍO».
//
// ⚠️ NO SE INVENTA CONTENIDO. El dato no existe en ningún lado de Switch, así
// que el recuadro sale vacío y se llena a mano — que es exactamente para lo que
// sirve, al lado del «RECIBIDO CONFORME» que también se firma a mano.
//
// ⚠️ LAS OTRAS NUEVE COLUMNAS Y SU ORDEN NO SE TOCAN, y ningún número se
// recalcula: el candado `cxc-estado-cuenta-forma-switch` sigue mandando sobre
// eso, con su nota fechada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COLUMNAS, ROTULO_COMENTARIO } from "@/lib/cxc/pdf-estado-cuenta-hoja";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const HOJA = "src/lib/cxc/pdf-estado-cuenta-hoja.ts";

/** Un pedazo de texto del PDF, con dónde empieza y dónde termina (en puntos). */
interface Pedazo { texto: string; x0: number; x1: number; y: number }

async function pedazosDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<Pedazo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  const fuera: Pedazo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (await page.getTextContent()).items as any[]) {
      if (!it.str?.trim()) continue;
      fuera.push({ texto: it.str.trim(), x0: it.transform[4], x1: it.transform[4] + it.width, y: it.transform[5] });
    }
  }
  return fuera;
}

const D25 = {
  codigo: "D-25",
  clienteNombre: "City Mall Paso Canoa",
  cliente: {
    nombre: "City Mall Paso Canoa", identificacion: "1513069-1-650069",
    telefono: "727-7247", email: "contabilidad@citymall.com.pa",
    direccion: "Paso Canoas", limiteCredito: 0, tiempoMorosidad: 0,
  },
  total: 23910,
  generadoEn: "2026-09-20T12:00:00.000Z",
  empresas: [{
    empresa_key: "fashion_wear", empresa_nombre: "Fashion Wear", subtotal: 23910, saldoSwitch: null,
    documentos: [
      { numero: "11-000003121", fecha: "2026-01-15", tipo: "Factura", monto: 12500.45, saldo: 12500.45, debito: 12500.45, credito: 0, dias: 85, plazoCredito: 30, numeroFiscal: null },
      // El tipo más largo del papel: es el que se partía en dos renglones.
      { numero: "14-000000258", fecha: "2026-06-18", tipo: "Nota de Crédito", monto: 1200.55, saldo: -1200.55, debito: 0, credito: 1200.55, dias: 40, plazoCredito: 30, numeroFiscal: null },
    ],
  }],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La columna se fue de la tabla
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · «Comentario» ya no es una columna", () => {
  it("son NUEVE columnas y ninguna se llama «Comentario»", () => {
    expect(COLUMNAS).toHaveLength(9);
    expect([...COLUMNAS]).not.toContain("Comentario");
  });

  it("🔴 las otras nueve conservan su orden de Switch", () => {
    expect([...COLUMNAS]).toEqual([
      "Fecha", "Comprobante", "N. Interno",
      "Débitos", "Créditos", "Saldo", "Vence", "Plazo", "Días",
    ]);
  });

  it("y la fila de la tabla ya no lleva el campo vacío", () => {
    const src = plano(HOJA);
    expect(src).toContain("f.fecha, f.comprobante, f.numeroInterno,");
    expect(src, "volvió el comentario a la fila de la tabla").not.toContain("f.comentario");
  });

  it("🩸 el dato sigue sin existir: no se inventó contenido de ningún lado", () => {
    const motor = plano("src/lib/cxc/estado-cuenta-switch.ts");
    // Se sigue escribiendo vacío, que es lo que Switch manda (o sea: nada).
    expect(motor).toContain('comentario: ""');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Los 37,9 mm van a las dos columnas que se partían
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · el ancho liberado va a «Comprobante» y «N. Interno»", () => {
  it("«Comprobante» pasa de 23 a 42 mm y «N. Interno» se queda con el resto", () => {
    const src = plano(HOJA);
    const estilos = src.slice(src.indexOf("columnStyles: {"), src.indexOf("});", src.indexOf("columnStyles: {")));
    expect(estilos).toContain("1: { cellWidth: 42 }");
    expect(estilos).toContain('2: { cellWidth: "auto" }');
    // Y no queda ninguna columna de 23 o 24 mm: ésas eran las dos apretadas.
    expect(estilos).not.toContain("cellWidth: 23");
    expect(estilos).not.toContain("cellWidth: 24");
  });

  it("🔑 y las nueve columnas caben en el ancho útil, sin sobras ni faltantes", () => {
    // Letter en vertical: 215,9 mm menos 12 de margen a cada lado = 191,9 útiles.
    const fijas = [17, 42, 17, 17, 19, 17, 10, 10]; // todas menos la `auto`
    const auto = 191.9 - fijas.reduce((s, n) => s + n, 0);
    expect(auto).toBeGreaterThan(24); // más de lo que «N. Interno» tenía
    expect(auto).toBeCloseTo(42.9, 1);
  });

  it("🩸 «Nota de Crédito» deja de partirse: entra en un solo renglón", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    const entero = pedazos.find((p) => p.texto === "Nota de Crédito");
    expect(entero, "«Nota de Crédito» volvió a partirse en dos renglones").toBeDefined();
    // El ancho del texto entra holgado en los 42 mm (≈ 119 puntos) de la columna.
    expect(entero!.x1 - entero!.x0).toBeLessThan(42 * 2.835);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El comentario general, abajo y en blanco
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · el comentario baja al pie de la hoja, en blanco", () => {
  it("el papel lo dibuja, con su rótulo", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    expect(pedazos.map((p) => p.texto)).toContain(ROTULO_COMENTARIO);
  });

  it("🔴 va ABAJO: debajo de la tabla y pegado al «RECIBIDO CONFORME»", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    const y = (t: string) => pedazos.find((p) => p.texto === t)!.y;
    // En PDF la Y crece hacia ARRIBA: más abajo = número más chico.
    expect(y(ROTULO_COMENTARIO)).toBeLessThan(y("Fecha"));
    expect(y(ROTULO_COMENTARIO)).toBeGreaterThan(y("RECIBIDO CONFORME"));
  });

  it("⚠️ sale VACÍO: es un espacio para escribir a mano, no un dato", () => {
    const src = plano(HOJA);
    const fn = src.slice(src.indexOf("export function dibujarComentario"));
    const cuerpo = fn.slice(0, fn.indexOf("\n}"));
    // Dibuja el rótulo y el recuadro, y nada más: ni un `doc.text` de contenido.
    expect(cuerpo).toContain("doc.rect(");
    expect((cuerpo.match(/doc\.text\(/g) ?? [])).toHaveLength(1);
    expect(cuerpo).toContain("doc.text(ROTULO_COMENTARIO");
  });

  it("🔑 sigue la forma que ya tenía la guía de despacho", () => {
    // No se inventó un bloque nuevo: rótulo en negrita + recuadro vacío, igual
    // que «OBSERVACIONES GENERALES DEL ENVÍO».
    const guia = plano("src/lib/guias/pdf-guia.ts");
    expect(guia).toContain("OBSERVACIONES GENERALES DEL ENVÍO");
    expect(guia).toContain("doc.rect(");
  });

  it("la hoja lo dibuja UNA vez por compañía, antes de la firma", () => {
    const papel = plano("src/lib/pdf-estado-cuenta.ts");
    const i = papel.indexOf("dibujarComentario(doc, y)");
    const j = papel.indexOf("dibujarRecibidoConforme(doc, y)");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
