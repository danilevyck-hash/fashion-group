/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS — TAMBIÉN EN ETIQUETA 4×6 PULGADAS (30-sep-2026)
 *
 * La oficina tiene una impresora de ETIQUETAS de 4×6 pulgadas (101,6 × 152,4
 * mm) y el PDF carta —4 por hoja con líneas de corte— no sirve ahí. Oficina,
 * textual: *«Hay que configurar para tamaño 4x6 pulgadas»*; aprobado por Daniel.
 *
 * 🔴 LO QUE ESTE CANDADO EXIGE:
 *   1. En 4×6: páginas de 101,6 × 152,4 mm, UNA etiqueta por página y SIN
 *      líneas de corte.
 *   2. Es la MISMA etiqueta: los milímetros de mayúscula que pidió Daniel no se
 *      tocan (bulto 11 · destino 7,5 · cliente 5,5 · factura 4).
 *   3. Con lo más largo de producción y el bulto «300 de 300», nada se sale de
 *      la página, nada pisa la raya del bulto y el destino no se corta.
 *   4. Carta sigue igual: 4 por hoja, con líneas de corte, y es el default.
 *   5. El botón dice páginas en 4×6 y hojas en carta; el archivo lleva «-4x6».
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";

import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import {
  AYUDA_FORMATO,
  FORMATO_POR_DEFECTO,
  OPCIONES_FORMATO,
  cajasDelJuego,
  nombreArchivoEtiquetas,
  textoImprimir,
  type EtiquetaFila,
  type FormatoEtiquetas,
} from "@/lib/guias/etiquetas";

const MM = 0.3527777778;
const ALTURA_DE_MAYUSCULA = 0.718;
const W = 101.6;
const H = 152.4;
const PAD_X = 8.6;
const PAD_Y = 9.1;
const Y_RAYA = H - PAD_Y - 14.0 - 4.6;

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
  pt: number;
  mayusculaMm: number;
  x: number;
  y: number;
  derecha: number;
  cortado: boolean;
}

/** El papel de verdad, leído del flujo de texto (misma lectura que `agrande`). */
function piezas(e: EtiquetaFila, cajas: readonly number[], formato: FormatoEtiquetas = "4x6"): Pieza[] {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(e), cajas, formato);
  const altoPt = (formato === "4x6" ? H : 279.4) / MM;
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
    const cortado = /\\205|\u0085|…/.test(bruto);
    const texto = bruto.replace(/\\(\d{3})/g, "~").replace(/\\([()\\])/g, "$1");
    doc.setFont("helvetica", estilo);
    doc.setFontSize(pt);
    const x = Number(m[3]) * MM;
    out.push({
      texto,
      pt,
      mayusculaMm: pt * ALTURA_DE_MAYUSCULA * MM,
      x,
      y: (altoPt - Number(m[4])) * MM,
      derecha: x + doc.getTextWidth(texto),
      cortado,
    });
  }
  return out;
}

const tieneLineasDeCorte = (formato: FormatoEtiquetas): boolean => {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(4), formato);
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  return /\[[\d. ]+\] [\d.]+ d/.test(crudo);
};

describe("🔴 1. en 4×6: una etiqueta por página de 101,6 × 152,4, sin líneas de corte", () => {
  it("14 bultos son 14 páginas, todas de 4×6 y paradas", () => {
    const doc = construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(14), "4x6");
    expect(doc.getNumberOfPages()).toBe(14);
    for (let i = 1; i <= 14; i++) {
      doc.setPage(i);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(W, 2);
      expect(doc.internal.pageSize.getHeight()).toBeCloseTo(H, 2);
    }
  });

  it("cada página lleva SU bulto, y uno solo", () => {
    const numeros = piezas(ETQ, cajasDelJuego(14)).filter((p) => Math.abs(p.mayusculaMm - 11) < 0.01);
    expect(numeros.map((p) => p.texto)).toEqual(cajasDelJuego(14).map(String));
    expect(piezas(ETQ, [7]).filter((p) => p.texto === "BULTO")).toHaveLength(1);
  });

  it("sin líneas de corte en 4×6; carta las sigue teniendo", () => {
    expect(tieneLineasDeCorte("4x6")).toBe(false);
    expect(tieneLineasDeCorte("carta")).toBe(true);
  });
});

describe("🔴 2. es la MISMA etiqueta: los milímetros de Daniel no se tocan", () => {
  it("bulto 11 · destino 7,5 · cliente 5,5 · factura 4, igual que en carta", () => {
    const p = piezas(ETQ, [3]);
    const en = (t: string) => p.find((x) => x.texto === t)!;
    expect(en("3").mayusculaMm).toBeCloseTo(11.0, 2);
    expect(en("PASO CANOAS").mayusculaMm).toBeCloseTo(7.5, 2);
    expect(en("NOVA LUX, S.A.").mayusculaMm).toBeCloseTo(5.5, 2);
    expect(en("11-000002558").mayusculaMm).toBeCloseTo(4.0, 2);
    // Y el mismo orden y los mismos tamaños que la de carta, pieza por pieza.
    const carta = piezas(ETQ, [3], "carta");
    expect(p.map((x) => [x.texto, x.pt])).toEqual(carta.map((x) => [x.texto, x.pt]));
  });

  it("arriba como en carta: el encabezado arranca en el mismo sitio y el bulto se ancla abajo", () => {
    const p = piezas(ETQ, [3]);
    const carta = piezas(ETQ, [3], "carta");
    expect(p[0].y).toBeCloseTo(carta[0].y, 4);
    expect(p.find((x) => x.texto === "3")!.y).toBeCloseTo(H - PAD_Y, 4);
  });
});

// Los extremos de producción que ya usan `agrande` y `destino-entero`.
const CLIENTES = [
  "Nova Lux, S.A.",
  "Sistema Nacional De Proteccion Civil (Sinaproc)",
  "Grup M.E.L. International, S.A.(Aguas)",
  "Comerciales La Nueva Reina, S.A.",
];
const DESTINOS = [
  "Paso Canoas",
  "Calle 19 Central, al lado de la joyería Super Oro",
  "Albrook Pasillo del tigre fenre al costo",
  "ALBROOK, PASILLO DE DINOSAURIO",
  "CALIDONIA (ENTREGA EN SPORTCORNER)",
  "TIENDA 6 WESTLAND MALL",
];
const EMPRESAS = ["Vistana International", "Confecciones Boston", "Fashion Shoes"];

describe("🔴 3. con lo más largo y el bulto «300 de 300», nada se corta ni se sale", () => {
  const casos = EMPRESAS.flatMap((empresa) =>
    CLIENTES.flatMap((cliente_nombre) =>
      DESTINOS.map((destino) => ({ ...ETQ, empresa, cliente_nombre, destino, cajas: 300 })),
    ),
  );

  it("todo dentro del margen de la página 4×6", () => {
    for (const e of casos) {
      for (const p of piezas(e, [300])) {
        const donde = `«${p.texto}» con ${e.empresa} / ${e.cliente_nombre} / ${e.destino}`;
        expect(p.x, donde).toBeGreaterThanOrEqual(PAD_X - 0.05);
        expect(p.derecha, donde).toBeLessThanOrEqual(W - PAD_X + 0.05);
        expect(p.y, donde).toBeLessThanOrEqual(H - PAD_Y + 0.05);
      }
    }
  });

  it("la empresa no se encima con la fecha (nombres cortos)", () => {
    // ⚠️ 30-sep-2026: «VISTANA INTERNATIONAL» y «CONFECCIONES BOSTON» miden
    // 84 mm a 4,8 mm de mayúscula y se enciman con la fecha YA EN CARTA (12 mm
    // de más) — no lo trajo el 4×6. Pendiente de Daniel: cómo acomodarlo.
    for (const empresa of ["Fashion Shoes", "Fashion Wear", "Active Shoes", "Active Wear", "Joystep"]) {
      const [emp, fecha] = piezas({ ...ETQ, empresa }, [3]);
      expect(emp.derecha, empresa).toBeLessThan(fecha.x - 2);
    }
  });

  it("ningún campo pisa la raya del bulto, y el destino nunca se corta", () => {
    for (const e of casos) {
      const p = piezas(e, [300]);
      const desde = p.findIndex((x) => x.texto === "Destino");
      const hasta = p.findIndex((x) => x.texto === "BULTO");
      for (const x of p.slice(0, hasta)) expect(x.y, `«${x.texto}» / ${e.destino}`).toBeLessThan(Y_RAYA);
      expect(p.slice(desde + 1, hasta).some((x) => x.cortado), e.destino).toBe(false);
    }
  });

  it("«300 de 300» cabe y queda centrado", () => {
    const p = piezas({ ...ETQ, cajas: 300 }, [300]);
    const numero = p.find((x) => x.texto === "300")!;
    const de = p.find((x) => x.texto === "de 300")!;
    expect(numero.x).toBeGreaterThan(PAD_X);
    expect(de.derecha).toBeLessThan(W - PAD_X);
    expect(Math.abs((numero.x + de.derecha) / 2 - W / 2)).toBeLessThan(0.6);
  });
});

// ⚠️ 1-oct-2026: el default de la PANTALLA es 4×6 (`FORMATO_POR_DEFECTO`, ver
// el bloque 5). Lo que este bloque fija es el default de la FUNCIÓN, que sigue
// siendo carta para que los candados del dibujo de carta midan la carta.
describe("🔴 4. carta sigue igual y es el default de la función", () => {
  it("sin formato = carta: 4 por hoja, hoja carta", () => {
    const doc = construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(14));
    expect(doc.getNumberOfPages()).toBe(4);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(215.9, 1);
    // El default y "carta" dibujan lo mismo, byte a byte (salvo la fecha del PDF).
    const sinFecha = (f?: FormatoEtiquetas) =>
      construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(6), f)
        .output()
        .replace(/\/CreationDate \([^)]*\)/g, "")
        .replace(/\/ID \[[^\]]*\]/g, "");
    expect(sinFecha()).toBe(sinFecha("carta"));
  });
});

describe("🔴 5. el botón, la ayuda y el archivo", () => {
  it("carta dice hojas; 4×6 dice páginas", () => {
    expect(textoImprimir(4)).toBe("Imprimir 4 etiquetas · 1 hoja");
    expect(textoImprimir(4, "carta")).toBe("Imprimir 4 etiquetas · 1 hoja");
    expect(textoImprimir(4, "4x6")).toBe("Imprimir 4 etiquetas · 4 páginas");
    expect(textoImprimir(1, "4x6")).toBe("Imprimir 1 etiqueta · 1 página");
  });

  it("las dos opciones y su ayuda", () => {
    // 🔄 1-oct-2026 — Daniel: *«Se imprimirá SIEMPRE en 4 de ancho y 6 de alto
    // pulgadas, vertical. Y ponlo como default, no la de 4 por hoja carta.»* El
    // 4×6 va PRIMERO y es el que sale sin nada recordado; carta queda segunda.
    expect(OPCIONES_FORMATO.map((o) => o.label)).toEqual(["Etiqueta 4×6", "Hoja carta · 4 por hoja"]);
    expect(FORMATO_POR_DEFECTO).toBe("4x6");
    expect(AYUDA_FORMATO.carta).toBe("Hoja carta, 4 etiquetas por hoja, con líneas de corte.");
    expect(AYUDA_FORMATO["4x6"]).toBe("Una etiqueta por página de 4×6 pulgadas, para la impresora de etiquetas.");
  });

  it("el archivo 4×6 lleva «-4x6»; el de carta, como siempre", () => {
    expect(nombreArchivoEtiquetas(ETQ)).toBe("Etiquetas-11-000002558.pdf");
    expect(nombreArchivoEtiquetas(ETQ, null, "4x6")).toBe("Etiquetas-11-000002558-4x6.pdf");
    expect(nombreArchivoEtiquetas(ETQ, 7, "4x6")).toBe("Etiquetas-11-000002558-bulto-7-4x6.pdf");
  });
});
