/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS — EL TIQUETE SE LEE PARADO, A UN METRO (20-sep-2026)
 *
 * 🩸 LO QUE ESTABA MAL, medido sobre el PDF real: entre el destino y la raya del
 * bulto quedaban 130 pt (46 mm) de papel en blanco —un 33 % del alto del
 * tiquete— y por ese hueco el cliente y el destino se imprimían a 18,97 pt, o
 * sea 4,8 mm de altura de mayúscula: justo en el límite de lo que se lee a un
 * metro, encima de una caja.
 *
 * 🔴 LA REGLA CON LA QUE SE ELIGIERON LOS TAMAÑOS: cada milímetro de altura de
 * mayúscula se lee cómodo desde unos 30 cm, así que cada dato crece hasta la
 * distancia desde la que se lee de verdad.
 *
 *   | dato         | desde dónde se lee            | antes    | ahora   |
 *   | bulto        | contando, de lejos y de cerca | 34,27 pt | 11 mm   |
 *   | destino      | ordenando el camión, de lejos | 18,97 pt | 7,5 mm  |
 *   | cliente      | al entregar, de cerca         | 18,97 pt | 5,5 mm  |
 *   | empresa      | separando en bodega           | 18,97 pt | igual   |
 *   | factura      | comparando contra un papel    | 13,46 pt | 4 mm    |
 *   | fecha        | casi nunca                    |  9,18 pt | igual   |
 *
 * 🔑 LO QUE ESTE CANDADO MIDE SON LOS MILÍMETROS, NO LOS PUNTOS. El papel se
 * ARMA de verdad y se le leen los tamaños al flujo del PDF: si alguien cambia
 * la fuente o el factor de la altura de mayúscula, los puntos cambian solos y
 * los milímetros —que es lo que se mide con una regla— tienen que seguir dando.
 *
 * Y los otros cambios aprobados el mismo día:
 *   · «CAJA» pasa a «BULTO», la palabra del resto de Guías.
 *   · El número va partido: el «1» grande y el «de 4» a la MITAD de ese tamaño,
 *     en la misma línea. 🔴 «1 de 4», nunca «1/4».
 *   · La factura sigue COMPLETA.
 *   · Nada se mueve de sitio: mismo orden, rótulo gris arriba del dato, la raya
 *     del bulto, 4 por hoja y las líneas de corte.
 *
 * 🔴 Y NADA SE SALE DEL CUARTO DE HOJA: se barren los 148 nombres de cliente y
 * los 84 destinos REALES de producción (medidos el 20-sep-2026) contra el papel
 * armado, y ni un texto pasa del margen ni se le mete al bloque del bulto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import {
  ROTULO_BULTO,
  cajasDelJuego,
  numeroDeCaja,
  partesDelNumeroDeBulto,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";

const PDF = fs.readFileSync(path.join(process.cwd(), "src/lib/guias/pdf-etiquetas.ts"), "utf8");

/** Puntos → milímetros, y la parte del tamaño de letra que es la mayúscula. */
const MM = 0.3527777778;
const ALTURA_DE_MAYUSCULA = 0.718;
const mayusculaEnMm = (pt: number): number => pt * ALTURA_DE_MAYUSCULA * MM;

// El cuarto de hoja carta, en milímetros, y sus márgenes.
const CUARTO_W = 215.9 / 2;
const CUARTO_H = 279.4 / 2;
const PAD_X = 8.6;
const PAD_Y = 9.1;
const HOJA_ALTO_PT = 279.4 / MM;

const ETQ: EtiquetaFila = {
  id: 1,
  empresa_key: "fashion_shoes",
  empresa: "Fashion Shoes",
  switch_factura_id: 52558,
  secuencial: "11-000002558",
  fecha_factura: "2026-09-18",
  cliente_codigo: "D-170",
  cliente_nombre: "Nova Lux, S.A.",
  destino: "Paso Canoas",
  cajas: 14,
  creado_en: "2026-09-18T14:41:00-05:00",
  guia_numero: null,
};

interface Pieza {
  texto: string;
  /** El tamaño con el que se dibujó, en puntos. */
  pt: number;
  /** Altura de la MAYÚSCULA, en milímetros: lo que se mide con una regla. */
  mayusculaMm: number;
  /** Dentro del cuarto de arriba a la izquierda, en milímetros. */
  x: number;
  y: number;
  /** Dónde termina el texto, en milímetros. */
  derecha: number;
  cortado: boolean;
}

/**
 * 🔑 EL PAPEL DE VERDAD. Se arma el PDF y se leen las piezas del flujo de texto:
 * jsPDF no lo comprime, así que cada `doc.text` deja su `/Fn <pt> Tf` y su
 * `x y Td (texto) Tj`. Los anchos se miden con la MISMA fuente con la que se
 * dibujaron (normal o negrita), que es de dónde salía un error de 2 mm cuando
 * se medía todo en negrita.
 */
function piezas(e: EtiquetaFila, cajas: readonly number[]): Pieza[] {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(e), cajas);
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");

  const fuentes = new Map<string, "normal" | "bold">();
  for (const f of crudo.matchAll(/\/BaseFont \/(Helvetica(?:-Bold)?)[^>]*?\/Name \/(F\d+)/g)) {
    fuentes.set(f[2], f[1].endsWith("Bold") ? "bold" : "normal");
  }

  const re = /\/(F\d+) ([\d.]+) Tf|([-\d.]+)\s+([-\d.]+)\s+Td\s*\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  let pt = 0;
  let estilo: "normal" | "bold" = "normal";
  const out: Pieza[] = [];
  while ((m = re.exec(crudo)) !== null) {
    if (m[1]) {
      pt = Number(m[2]);
      estilo = fuentes.get(m[1]) ?? "normal";
      continue;
    }
    const bruto = m[5];
    // El corte con puntos suspensivos viaja como el octal \205 de WinAnsi.
    const cortado = /\\205|\u0085|\u2026/.test(bruto);
    const texto = bruto.replace(/\\(\d{3})/g, "~").replace(/\\([()\\])/g, "$1");
    doc.setFont("helvetica", estilo);
    doc.setFontSize(pt);
    const x = Number(m[3]) * MM;
    out.push({
      texto,
      pt,
      mayusculaMm: mayusculaEnMm(pt),
      x,
      y: (HOJA_ALTO_PT - Number(m[4])) * MM,
      derecha: x + doc.getTextWidth(texto),
      cortado,
    });
  }
  return out;
}

/** La pieza que se dibujó con este texto. */
function pieza(e: EtiquetaFila, texto: string): Pieza {
  const p = piezas(e, [3]).find((x) => x.texto === texto);
  if (!p) throw new Error(`el papel no dibujó «${texto}»`);
  return p;
}

// ─── 1 · LOS MILÍMETROS DE LA TABLA ──────────────────────────────────────────

describe("🔴 1. cada dato mide lo que tiene que medir, en milímetros", () => {
  const esperado: Array<[string, string, number]> = [
    ["el número del bulto", "3", 11.0],
    ["el destino", "PASO CANOAS", 7.5],
    ["el cliente", "NOVA LUX, S.A.", 5.5],
    ["la factura", "11-000002558", 4.0],
  ];

  for (const [que, texto, mm] of esperado) {
    it(`${que}: ${mm} mm de altura de mayúscula`, () => {
      // Medio décimo de milímetro: lo que se ve con una regla, no el redondeo.
      expect(pieza(ETQ, texto).mayusculaMm).toBeCloseTo(mm, 2);
    });
  }

  it("⚠️ la empresa y la fecha NO se tocaron: siguen en 18,97 y 9,18 pt", () => {
    expect(pieza(ETQ, "FASHION SHOES").pt).toBeCloseTo(18.97, 2);
    expect(pieza(ETQ, "18 sept 2026").pt).toBeCloseTo(9.18, 2);
  });

  it("🩸 y ya no queda nada en los 18,97 pt de antes: el cliente y el destino crecieron", () => {
    const cli = pieza(ETQ, "NOVA LUX, S.A.");
    const des = pieza(ETQ, "PASO CANOAS");
    expect(cli.pt).toBeGreaterThan(18.97);
    expect(des.pt).toBeGreaterThan(cli.pt);
    // El número del bulto también: 34,27 pt eran 8,68 mm.
    expect(pieza(ETQ, "3").pt).toBeGreaterThan(34.27);
  });

  it("🔴 los tamaños se PIDEN en milímetros: nadie escribe un punto a mano", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const [nombre, mm] of [
      ["MAY_BULTO", "11.0"],
      ["MAY_DESTINO", "7.5"],
      ["MAY_CLIENTE", "5.5"],
      ["MAY_FACTURA", "4.0"],
    ]) {
      expect(sinComentarios).toContain(`const ${nombre} = ${mm};`);
    }
    // Todos los tamaños pasan por la MISMA conversión.
    const tamanos = sinComentarios.match(/const F_\w+ = [^;]+;/g) ?? [];
    for (const t of tamanos) {
      expect(t).toMatch(/PT_PARA_MAYUSCULA\(MAY_\w+\)|F_BULTO \/ 2/);
    }
    expect(sinComentarios).toContain("const ALTURA_DE_MAYUSCULA = 0.718;");
  });
});

// ─── 2 · «BULTO», Y EL NÚMERO PARTIDO EN DOS ─────────────────────────────────

describe("🔴 2. dice BULTO, y el número va partido", () => {
  it("🔴 el rótulo dice «BULTO» — la palabra del resto de Guías", () => {
    expect(ROTULO_BULTO).toBe("BULTO");
    expect(piezas(ETQ, [3]).map((p) => p.texto)).toContain("BULTO");
  });

  it("🩸 y en el papel ya no aparece la palabra «CAJA» por ningún lado", () => {
    for (const p of piezas(ETQ, [3])) expect(p.texto).not.toMatch(/CAJA/i);
  });

  it("🔴 el «3» va entero y el «de 14» a la MITAD de su tamaño, en la misma línea", () => {
    const numero = pieza(ETQ, "3");
    const total = pieza(ETQ, "de 14");
    expect(total.pt).toBeCloseTo(numero.pt / 2, 4);
    expect(total.y).toBe(numero.y);
    // Y el «de 14» va DESPUÉS del número, sin encimársele.
    expect(total.x).toBeGreaterThan(numero.derecha);
  });

  it("🔴 sigue siendo «1 de 4» y NUNCA «1/4» — sucia, la rayita se lee como un 14", () => {
    expect(numeroDeCaja(1, 4)).toBe("1 de 4");
    expect(partesDelNumeroDeBulto(1, 4)).toEqual({ numero: "1", total: "de 4" });
    for (const p of piezas({ ...ETQ, cajas: 4 }, [1])) {
      expect(p.texto).not.toMatch(/\d\s*\/\s*\d/);
    }
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/\$\{\w+\}\/\$\{\w+\}/);
  });

  it("🔴 el bloque entero queda CENTRADO en el cuarto, no cada pieza por su lado", () => {
    for (const total of [4, 14, 300]) {
      const p = piezas({ ...ETQ, cajas: total }, [3]);
      const numero = p.find((x) => x.texto === "3")!;
      const de = p.find((x) => x.texto === `de ${total}`)!;
      const centroDelBloque = (numero.x + de.derecha) / 2;
      expect(Math.abs(centroDelBloque - CUARTO_W / 2)).toBeLessThan(0.6);
    }
  });

  it("⚠️ la factura sigue COMPLETA: no se recorta el número", () => {
    expect(pieza(ETQ, "11-000002558").texto).toBe("11-000002558");
  });
});

// ─── 3 · NADA SE SALE DEL CUARTO DE HOJA ─────────────────────────────────────

/**
 * Los nombres y destinos REALES, medidos contra producción el 20-sep-2026: 148
 * clientes distintos en `switch_clientes` de las 6 del grupo y 84 destinos
 * distintos entre `guias_destino_lista`, `guias_destino_cliente` y la dirección
 * escrita en `guia_items`. Van los EXTREMOS de esa medición, que es lo que el
 * papel tiene que aguantar.
 */
const CLIENTES_REALES = [
  "Nova Lux, S.A.",
  "Sistema Nacional De Proteccion Civil (Sinaproc)", // 47, el más largo
  "Grup M.E.L. International, S.A.(Aguas)",
  "Comerciales La Nueva Reina, S.A.",
  "Super Centro La Competencia S.A.",
  "Distribuidora Karen Viva Panama",
  "El Machetazo San Miguelito",
  "Zappattos Holding, S.A.",
];
const DESTINOS_REALES = [
  "Paso Canoas",
  "Changuinola",
  "Calle 19 Central, al lado de la joyería Super Oro", // 49, el más largo
  "Albrook Pasillo del tigre fenre al costo",
  "ALBROOK, PASILLO DE DINOSAURIO",
  "CALIDONIA (ENTREGA EN SPORTCORNER)",
  "Sport Corner Calidonia",
  "TIENDA 6 WESTLAND MALL",
];

describe("🔴 3. con lo más largo de producción, nada se sale ni se encima", () => {
  const derecha = CUARTO_W - PAD_X;
  /** La raya del bulto: el piso de los campos. */
  const yRaya = CUARTO_H - PAD_Y - 14.0 - 4.6;

  it("ningún texto pasa del margen derecho del cuarto", () => {
    for (const cliente_nombre of CLIENTES_REALES) {
      for (const destino of DESTINOS_REALES) {
        for (const p of piezas({ ...ETQ, cliente_nombre, destino }, [3])) {
          expect(
            p.derecha,
            `«${p.texto}» se sale con ${cliente_nombre} / ${destino}`,
          ).toBeLessThanOrEqual(derecha + 0.05);
          expect(p.x).toBeGreaterThanOrEqual(PAD_X - 0.05);
        }
      }
    }
  });

  it("🩸 y los puntos suspensivos tampoco: recortar no puede empujar la línea afuera", () => {
    // El «…» de la Helvetica mide un em entero: pegado a una línea que ya
    // llegaba al borde, un destino de 7,5 mm se salía 10 mm del cuarto.
    const cortadas = piezas(
      { ...ETQ, cliente_nombre: "Sistema Nacional De Proteccion Civil (Sinaproc)", destino: "Calle 19 Central, al lado de la joyería Super Oro" },
      [3],
    ).filter((x) => x.cortado);
    // El cliente más largo y el destino más largo de producción: los dos se
    // cortan, y los dos cortes tienen que caber.
    expect(cortadas.length).toBeGreaterThanOrEqual(2);
    for (const p of cortadas) expect(p.derecha).toBeLessThanOrEqual(derecha + 0.05);
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).toMatch(/while \(ultima\.length > 1 && doc\.getTextWidth\(`\$\{ultima\}…`\) > ancho\)/);
  });

  it("ningún campo se le mete al bloque del bulto", () => {
    for (const cliente_nombre of CLIENTES_REALES) {
      for (const destino of DESTINOS_REALES) {
        for (const p of piezas({ ...ETQ, cliente_nombre, destino }, [3])) {
          // Las piezas del bloque del bulto viven debajo de la raya a propósito.
          if (p.texto === "BULTO" || p.texto === "3" || p.texto.startsWith("de ")) continue;
          expect(p.y, `«${p.texto}» pisa la raya con ${cliente_nombre} / ${destino}`).toBeLessThan(yRaya);
        }
      }
    }
  });

  it("🔴 el destino se queda con el hueco: con el cliente corto entra en TRES líneas", () => {
    const tres = piezas({ ...ETQ, destino: "TIENDA 6 WESTLAND MALL" }, [3]).filter(
      (p) => Math.abs(p.mayusculaMm - 7.5) < 0.01,
    );
    expect(tres.map((p) => p.texto)).toEqual(["TIENDA 6", "WESTLAND", "MALL"]);
    expect(tres.some((p) => p.cortado)).toBe(false);
  });

  it("🔴 y con el cliente en DOS líneas —55 de los 148 reales— el destino todavía entra en tres", () => {
    const p = piezas(
      { ...ETQ, cliente_nombre: "Comerciales La Nueva Reina, S.A.", destino: "ALBROOK, PASILLO DE DINOSAURIO" },
      [3],
    );
    // ⚠️ El «de 14» del bulto mide lo mismo que el cliente (es la MITAD del
    // número): se reconoce el cliente por su margen izquierdo.
    expect(
      p.filter((x) => Math.abs(x.mayusculaMm - 5.5) < 0.01 && Math.abs(x.x - PAD_X) < 0.01),
    ).toHaveLength(2);
    const destino = p.filter((x) => Math.abs(x.mayusculaMm - 7.5) < 0.01);
    expect(destino.map((x) => x.texto)).toEqual(["ALBROOK,", "PASILLO DE", "DINOSAURIO"]);
    expect(destino.some((x) => x.cortado)).toBe(false);
  });
});

// ─── 4 · LO QUE EL AGRANDE NO TOCÓ ───────────────────────────────────────────

describe("lo que el agrande NO tocó", () => {
  it("el orden sigue siendo empresa · factura · cliente · destino · bulto", () => {
    expect(piezas(ETQ, [3]).map((p) => p.texto)).toEqual([
      "FASHION SHOES",
      "18 sept 2026",
      "Factura",
      "11-000002558",
      "Cliente",
      "NOVA LUX, S.A.",
      "Destino",
      "PASO CANOAS",
      "BULTO",
      "3",
      "de 14",
    ]);
  });

  it("el rótulo gris sigue ARRIBA de su dato, y los tres en el mismo margen", () => {
    const p = piezas(ETQ, [3]);
    const en = (t: string) => p.find((x) => x.texto === t)!;
    for (const [rotulo, dato] of [
      ["Factura", "11-000002558"],
      ["Cliente", "NOVA LUX, S.A."],
      ["Destino", "PASO CANOAS"],
    ]) {
      expect(en(rotulo).y).toBeLessThan(en(dato).y);
      expect(en(rotulo).x).toBeCloseTo(en(dato).x, 4);
      expect(en(rotulo).mayusculaMm).toBeLessThan(en(dato).mayusculaMm);
    }
  });

  it("sigue siendo carta vertical, 4 por hoja, con líneas de corte y UN generador", () => {
    expect(PDF).toContain('format: "letter"');
    expect(PDF).toContain('orientation: "portrait"');
    expect(PDF).toContain("setLineDashPattern");
    expect((PDF.match(/export function construirPdf\w*/g) ?? [])).toHaveLength(1);
    const doc = construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(14));
    expect(doc.getNumberOfPages()).toBe(4);
  });

  it("el bloque del bulto sigue anclado al borde de abajo, pase lo que pase arriba", () => {
    const corto = pieza(ETQ, "3");
    const largo = pieza(
      { ...ETQ, cliente_nombre: "Sistema Nacional De Proteccion Civil (Sinaproc)", destino: "ALBROOK, PASILLO DE DINOSAURIO" },
      "3",
    );
    expect(largo.y).toBe(corto.y);
    expect(corto.y).toBeCloseTo(CUARTO_H - PAD_Y, 4);
  });

  it("🔴 SIN transportista, SIN piezas, SIN código de barras", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/transportista/i);
    expect(sinComentarios).not.toMatch(/barcode|jsbarcode|bwip|qrcode|zpl/i);
  });
});
