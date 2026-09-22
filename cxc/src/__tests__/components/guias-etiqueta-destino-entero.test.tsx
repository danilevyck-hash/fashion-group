/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS — EL DESTINO LARGO SALE ENTERO (22-sep-2026)
 *
 * Daniel, textual: *«los destino largos que se hagan en dos filas o achicar la
 * letra»*. 🔴 **EN ESE ORDEN: PRIMERO LAS FILAS, DESPUÉS LA LETRA.**
 *
 * 🩸 LO QUE ESTABA MAL, medido contra producción el 22-sep-2026 sobre los 94
 * destinos REALES —`guias_destino_lista` (18) + `guias_destino_cliente` (36) +
 * la dirección escrita en `guia_items` (611 renglones)— cruzados con los 148
 * clientes de `switch_clientes` de las 6 del grupo: **TRES destinos salían
 * cortados con «…»**, y el que carga el camión se quedaba sin la referencia.
 *
 *   | destino                                            | dibujaba | necesita | falta   |
 *   | «Calle 19 Central, al lado de la joyería Super Oro» | 3 líneas | 5        | 23 mm   |
 *   | «Calle 19 central al lado de la joyeria super oro»  | 3 líneas | 5        | 23 mm   |
 *   | «Albrook Pasillo del tigre fenre al costo»          | 3 líneas | 4        | 11,5 mm |
 *
 * Salía «CALLE 19 / CENTRAL, AL / LADO DE LA…»: se perdía la joyería, que es
 * justo por lo que se encuentra el sitio.
 *
 * 🔴 LO QUE ESTE CANDADO EXIGE, y por lo que existe:
 *   1. Los tres salen ENTEROS, y ninguno de los 94 se corta.
 *   2. NADA se sale del cuarto de hoja ni le pisa la raya al bulto.
 *   3. El destino se parte SOLO por espacio: nunca a mitad de palabra.
 *   4. DOS FILAS ANTES QUE ACHICAR — un destino que entra en dos o tres filas a
 *      7,5 mm se queda en 7,5 mm exactos; solo el que NO entra baja de tamaño,
 *      y baja lo mínimo: un décimo más grande ya no cabría.
 *   5. El piso es `MAY_DESTINO_MINIMO` = 3,4 mm, y tiene porqué: la regla de la
 *      casa es ~1 mm de altura de mayúscula por cada 30 cm de lectura cómoda, y
 *      la etiqueta se lee PARADO, A UN METRO (100 ÷ 30 = 3,34 → 3,4).
 *   6. Los otros tres tamaños —bulto 11 · cliente 5,5 · factura 4— NO se tocan.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import {
  MAY_DESTINO_MINIMO,
  PASO_DEL_ACHIQUE,
  acomodarDestino,
  lineasQueCaben,
  partirPorEspacio,
  type MedidasDelDestino,
} from "@/lib/guias/etiqueta-destino";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";

const PDF = fs.readFileSync(path.join(process.cwd(), "src/lib/guias/pdf-etiquetas.ts"), "utf8");
const DESTINO_TS = fs.readFileSync(
  path.join(process.cwd(), "src/lib/guias/etiqueta-destino.ts"),
  "utf8",
);

const MM = 0.3527777778;
const ALTURA_DE_MAYUSCULA = 0.718;
const CUARTO_W = 215.9 / 2;
const CUARTO_H = 279.4 / 2;
const PAD_X = 8.6;
const PAD_Y = 9.1;
const HOJA_ALTO_PT = 279.4 / MM;
/** La raya del bulto: el piso de los campos (borde − pad − 14,0 − 4,6). */
const Y_RAYA = CUARTO_H - PAD_Y - 14.0 - 4.6;
const DERECHA = CUARTO_W - PAD_X;

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

/** El papel de verdad: se arma el PDF y se leen las piezas del flujo de texto. */
function piezas(e: EtiquetaFila): Pieza[] {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(e), [3]);
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
    const cortado = /\\205/.test(bruto) || bruto.includes(String.fromCharCode(0x85));
    // Los acentos viajan en octal de WinAnsi: se devuelven a su letra para poder
    // comparar contra el destino tal como está escrito en la base.
    const texto = bruto
      .replace(/\\351/g, "é")
      .replace(/\\355/g, "í")
      .replace(/\\363/g, "ó")
      .replace(/\\372/g, "ú")
      .replace(/\\341/g, "á")
      .replace(/\\361/g, "ñ")
      .replace(/\\(\d{3})/g, "~")
      .replace(/\\([()\\])/g, "$1");
    doc.setFont("helvetica", estilo);
    doc.setFontSize(pt);
    const x = Number(m[3]) * MM;
    out.push({
      texto,
      pt,
      mayusculaMm: pt * ALTURA_DE_MAYUSCULA * MM,
      x,
      y: (HOJA_ALTO_PT - Number(m[4])) * MM,
      derecha: x + doc.getTextWidth(texto),
      cortado,
    });
  }
  return out;
}

/** Las líneas que se dibujaron para el DESTINO: lo que va después de su rótulo. */
function lineasDelDestino(e: EtiquetaFila): Pieza[] {
  const todas = piezas(e);
  const desde = todas.findIndex((p) => p.texto === "Destino");
  expect(desde, "el papel no dibujó el rótulo «Destino»").toBeGreaterThanOrEqual(0);
  return todas
    .slice(desde + 1)
    .filter((p) => p.texto !== "BULTO" && p.texto !== "3" && !p.texto.startsWith("de "));
}

/**
 * Los destinos REALES de producción, medidos el 22-sep-2026. Van los TRES que
 * se cortaban y los extremos del resto: es lo que el papel tiene que aguantar.
 */
const LOS_TRES_QUE_SE_CORTABAN = [
  "Calle 19 Central, al lado de la joyería Super Oro",
  "Calle 19 central al lado de la joyeria super oro",
  "Albrook Pasillo del tigre fenre al costo",
];
const DESTINOS_REALES = [
  ...LOS_TRES_QUE_SE_CORTABAN,
  "ALBROOK 2 (ENTREGA EN SPORTCORNER)",
  "CALIDONIA (ENTREGA EN SPORTCORNER)",
  "LOS ANDES (ENTREGA EN SPORTCORNER)",
  "WESTLAND (ENTREGA EN SPORTCORNER)",
  "ALBROOK, PASILLO DE DINOSAURIO",
  "Albrook Pasillo de Canguro",
  "TIENDA 6 WESTLAND MALL",
  "Sport Corner Calidonia",
  "Changuinola",
  "Paso Canoas",
  "David",
];
/** Un cliente que entra en UNA línea y uno que entra en DOS (55 de los 148 lo están). */
const CLIENTES_REALES = [
  "Nova Lux, S.A.",
  "Sistema Nacional De Proteccion Civil (Sinaproc)",
  "Comerciales La Nueva Reina, S.A.",
  "Zappattos Holding, S.A.",
];

// ─── 1 · LOS TRES SALEN ENTEROS ──────────────────────────────────────────────

describe("🔴 1. los tres destinos que se cortaban salen ENTEROS", () => {
  for (const destino of LOS_TRES_QUE_SE_CORTABAN) {
    for (const cliente_nombre of CLIENTES_REALES) {
      it(`«${destino}» entero, con «${cliente_nombre}»`, () => {
        const lineas = lineasDelDestino({ ...ETQ, destino, cliente_nombre });
        expect(lineas.some((p) => p.cortado), "salió con «…»").toBe(false);
        // Las líneas, pegadas con un espacio, son el destino COMPLETO.
        expect(lineas.map((p) => p.texto).join(" ")).toBe(destino.toUpperCase());
      });
    }
  }

  it("🩸 y ninguno de los destinos reales se corta, con ningún cliente", () => {
    for (const destino of DESTINOS_REALES) {
      for (const cliente_nombre of CLIENTES_REALES) {
        const lineas = lineasDelDestino({ ...ETQ, destino, cliente_nombre });
        expect(
          lineas.some((p) => p.cortado),
          `«${destino}» se corta con «${cliente_nombre}»`,
        ).toBe(false);
      }
    }
  });
});

// ─── 2 · NADA SE SALE DEL CUARTO ─────────────────────────────────────────────

describe("🔴 2. nada se sale del cuarto de hoja ni le pisa la raya al bulto", () => {
  it("ninguna pieza pasa del margen ni sube por encima del izquierdo", () => {
    for (const destino of DESTINOS_REALES) {
      for (const cliente_nombre of CLIENTES_REALES) {
        for (const p of piezas({ ...ETQ, destino, cliente_nombre })) {
          expect(p.derecha, `«${p.texto}» se sale con ${destino}`).toBeLessThanOrEqual(
            DERECHA + 0.05,
          );
          expect(p.x).toBeGreaterThanOrEqual(PAD_X - 0.05);
        }
      }
    }
  });

  it("🔴 ninguna línea del destino baja de la raya del bulto", () => {
    for (const destino of DESTINOS_REALES) {
      for (const cliente_nombre of CLIENTES_REALES) {
        for (const p of lineasDelDestino({ ...ETQ, destino, cliente_nombre })) {
          expect(p.y, `«${p.texto}» pisa la raya con ${destino}`).toBeLessThan(Y_RAYA);
        }
      }
    }
  });

  it("el bloque del bulto sigue anclado al borde de abajo, achique o no", () => {
    const corto = piezas(ETQ).find((p) => p.texto === "3")!;
    const largo = piezas({
      ...ETQ,
      destino: "Calle 19 Central, al lado de la joyería Super Oro",
      cliente_nombre: "Sistema Nacional De Proteccion Civil (Sinaproc)",
    }).find((p) => p.texto === "3")!;
    expect(largo.y).toBe(corto.y);
    expect(corto.y).toBeCloseTo(CUARTO_H - PAD_Y, 4);
  });
});

// ─── 3 · SE PARTE POR ESPACIO, NUNCA A MITAD DE PALABRA ──────────────────────

describe("🔴 3. se parte por ESPACIO, nunca a mitad de palabra", () => {
  it("cada línea del destino son palabras completas del original", () => {
    for (const destino of DESTINOS_REALES) {
      for (const cliente_nombre of CLIENTES_REALES) {
        const lineas = lineasDelDestino({ ...ETQ, destino, cliente_nombre });
        const palabras = destino.toUpperCase().split(/\s+/).filter(Boolean);
        const partidas = lineas.flatMap((p) => p.texto.split(/\s+/)).filter(Boolean);
        expect(partidas, `«${destino}» se partió a mitad de palabra`).toEqual(palabras);
      }
    }
  });

  it("🔴 `partirPorEspacio` devuelve NULL si una palabra sola no cabe — no la parte", () => {
    const ancho = (t: string) => t.length;
    expect(partirPorEspacio("ABCDEFGHIJ", 5, 1, ancho)).toBeNull();
    expect(partirPorEspacio("AB CD EF", 5, 1, ancho)).toEqual(["AB CD", "EF"]);
  });

  it("🩸 y una palabra que no cabe se resuelve ACHICANDO, no cortándola", () => {
    const m = medidas({ ancho: 70 });
    // «SUPERCALIFRAGILISTICO» a 7,5 mm no entra en 70 mm de ancho; achicada, sí.
    const a = acomodarDestino("SUPERCALIFRAGILISTICO", 7.5, m);
    expect(a.cortado).toBe(false);
    expect(a.lineas).toEqual(["SUPERCALIFRAGILISTICO"]);
    expect(a.mayuscula).toBeLessThan(7.5);
    expect(a.mayuscula).toBeGreaterThanOrEqual(MAY_DESTINO_MINIMO);
  });
});

// ─── 4 · DOS FILAS ANTES QUE ACHICAR ─────────────────────────────────────────

/** Un medidor de mentira, lineal y predecible: cada letra mide 0,6 × el tamaño. */
function medidas(over: Partial<MedidasDelDestino> = {}): MedidasDelDestino {
  return {
    ancho: 50,
    desdeY: 0,
    hastaY: 40,
    bajoElRotulo: (mm) => mm + 2.1,
    interlinea: (mm) => mm * 1.53,
    anchoDeTexto: (t, mm) => t.length * mm * 0.6,
    ...over,
  };
}

describe("🔴 4. DOS FILAS ANTES QUE ACHICAR — en ese orden, no al revés", () => {
  it("🔴 en el papel real: «ALBROOK, PASILLO DE DINOSAURIO» usa TRES filas a 7,5 mm exactos", () => {
    const lineas = lineasDelDestino({ ...ETQ, destino: "ALBROOK, PASILLO DE DINOSAURIO" });
    expect(lineas.map((p) => p.texto)).toEqual(["ALBROOK,", "PASILLO DE", "DINOSAURIO"]);
    for (const p of lineas) expect(p.mayusculaMm).toBeCloseTo(7.5, 2);
  });

  it("🔴 y «TIENDA 6 WESTLAND MALL» también: tres filas, y NI UN DÉCIMO más chico", () => {
    const lineas = lineasDelDestino({ ...ETQ, destino: "TIENDA 6 WESTLAND MALL" });
    expect(lineas.map((p) => p.texto)).toEqual(["TIENDA 6", "WESTLAND", "MALL"]);
    for (const p of lineas) expect(p.mayusculaMm).toBeCloseTo(7.5, 2);
  });

  it("un destino de una sola línea no se achica ni se parte", () => {
    const lineas = lineasDelDestino(ETQ);
    expect(lineas.map((p) => p.texto)).toEqual(["PASO CANOAS"]);
    expect(lineas[0].mayusculaMm).toBeCloseTo(7.5, 2);
  });

  it("🔴 lo que entra en más filas NO se achica: la letra es lo último", () => {
    // Caben 5 filas de sobra: el texto se parte en cuatro y se queda en 7,5.
    const m = medidas({ hastaY: 80 });
    const a = acomodarDestino("UNO DOS TRES CUATRO CINCO SEIS SIETE OCHO", 7.5, m);
    expect(a.mayuscula).toBe(7.5);
    expect(a.lineas.length).toBeGreaterThanOrEqual(2);
    expect(a.cortado).toBe(false);
  });

  it("🔴 y cuando SÍ hay que achicar, se achica LO MÍNIMO: un décimo más grande ya no entra", () => {
    const casos: Array<[string, MedidasDelDestino]> = [
      ["UNO DOS TRES CUATRO CINCO SEIS SIETE OCHO NUEVE DIEZ ONCE DOCE", medidas()],
      ["CALLE 19 CENTRAL, AL LADO DE LA JOYERIA SUPER ORO", medidas({ ancho: 40, hastaY: 30 })],
    ];
    for (const [texto, m] of casos) {
      const a = acomodarDestino(texto, 7.5, m);
      expect(a.cortado, texto).toBe(false);
      expect(a.mayuscula, texto).toBeLessThan(7.5);
      // Un paso más grande NO cabe: por eso se quedó en éste y no más abajo.
      const masGrande = Math.round((a.mayuscula + PASO_DEL_ACHIQUE) * 1000) / 1000;
      const partidas = partirPorEspacio(texto, m.ancho, masGrande, m.anchoDeTexto);
      const entra = partidas !== null && partidas.length <= lineasQueCaben(masGrande, m);
      expect(entra, `${texto} entraba a ${masGrande} mm y se achicó de más`).toBe(false);
    }
  });

  it("🔴 y el achique es FINO: se baja de a un décimo de milímetro, no a saltos", () => {
    // 🩸 Este número va ESCRITO acá a propósito, no importado: preguntarle al
    // propio módulo de cuánto es su paso hace que la prueba se mueva con él y
    // un salto de un milímetro entero —que deja el destino más chico de lo que
    // el papel aguanta— pase desapercibido.
    const FINO = 0.1;
    expect(PASO_DEL_ACHIQUE).toBeLessThanOrEqual(FINO);
    const m = medidas({ ancho: 40, hastaY: 30 });
    const texto = "CALLE 19 CENTRAL, AL LADO DE LA JOYERIA SUPER ORO";
    const a = acomodarDestino(texto, 7.5, m);
    expect(a.mayuscula).toBeLessThan(7.5);
    // Entre el tamaño elegido y el máximo, de a un décimo, NADA entra: si algo
    // entraba, el destino salió más chico de lo necesario.
    for (let mm = Math.round((a.mayuscula + FINO) * 1000) / 1000; mm <= 7.5 + 1e-9; mm += FINO) {
      const redondo = Math.round(mm * 1000) / 1000;
      const partidas = partirPorEspacio(texto, m.ancho, redondo, m.anchoDeTexto);
      const entra = partidas !== null && partidas.length <= lineasQueCaben(redondo, m);
      expect(entra, `entraba a ${redondo} mm y salió a ${a.mayuscula} mm`).toBe(false);
    }
  });

  it("🔴 el orden vive en el código: se recorre del MÁS GRANDE al más chico", () => {
    const sinComentarios = DESTINO_TS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).toMatch(
      /for \(let mm = maxMayuscula; mm >= minMayuscula[^;]*; mm -= PASO_DEL_ACHIQUE\)/,
    );
    // Y se devuelve el PRIMERO que entra, que por el orden es el más grande.
    expect(sinComentarios).toMatch(/if \(lineas\.length <= lineasQueCaben\(mayuscula, m\)\) return/);
  });
});

// ─── 4b · EL ACHIQUE ARRASTRA TODO EL BLOQUE ─────────────────────────────────

/**
 * 🔴 Cuando el destino se achica, el DIBUJO tiene que achicarse con él: el
 * salto del rótulo a la primera línea y el salto entre líneas salen del tamaño
 * que SE DIBUJÓ, no del de siempre. 🩸 Si no, el bloque queda flotando más abajo
 * de donde el acomodo lo calculó y se acerca a la raya del bulto por un hueco
 * que nadie midió.
 *
 * Las dos reglas, tal como el papel las define:
 *   · rótulo → primera línea = altura de mayúscula + 2,1 mm de aire
 *   · línea → línea = altura de mayúscula × 1,10 ÷ 0,718 (la interlínea propia
 *     del tamaño, sobre la `CapHeight` de la Helvetica)
 */
const AIRE_BAJO_EL_ROTULO = 2.1;
const INTERLINEA_DE = (mayusculaMm: number): number => (mayusculaMm * 1.1) / ALTURA_DE_MAYUSCULA;

describe("🔴 4b. el achique arrastra el bloque entero, no solo la letra", () => {
  const casos: Array<[string, string]> = [
    ["sin achique", "ALBROOK, PASILLO DE DINOSAURIO"],
    ["achicado", "Calle 19 Central, al lado de la joyería Super Oro"],
    ["achicado y con el cliente en dos líneas", "Albrook Pasillo del tigre fenre al costo"],
  ];

  for (const [que, destino] of casos) {
    it(`${que}: el salto del rótulo y la interlínea siguen al tamaño dibujado`, () => {
      const cliente_nombre = que.includes("dos líneas")
        ? "Sistema Nacional De Proteccion Civil (Sinaproc)"
        : ETQ.cliente_nombre;
      const todas = piezas({ ...ETQ, destino, cliente_nombre });
      const rotulo = todas.find((p) => p.texto === "Destino")!;
      const lineas = lineasDelDestino({ ...ETQ, destino, cliente_nombre });
      const mm = lineas[0].mayusculaMm;
      expect(lineas[0].y - rotulo.y).toBeCloseTo(mm + AIRE_BAJO_EL_ROTULO, 2);
      for (let i = 1; i < lineas.length; i++) {
        expect(lineas[i].y - lineas[i - 1].y, `línea ${i + 1} de «${destino}»`).toBeCloseTo(
          INTERLINEA_DE(mm),
          2,
        );
      }
    });
  }
});

// ─── 5 · EL PISO, CON SU PORQUÉ ──────────────────────────────────────────────

describe("🔴 5. el piso: 3,4 mm, y no se baja de ahí", () => {
  it("la constante existe, vale 3,4 y dice por qué", () => {
    expect(MAY_DESTINO_MINIMO).toBe(3.4);
    expect(DESTINO_TS).toContain("export const MAY_DESTINO_MINIMO = 3.4;");
    // La regla de señalización de la casa: ~1 mm de mayúscula por cada 30 cm.
    expect(DESTINO_TS).toMatch(/30 cm/);
    expect(DESTINO_TS).toMatch(/UN METRO|100 cm/);
  });

  it("🔴 ni el destino más imposible baja del piso: ahí vuelve el «…»", () => {
    const m = medidas({ ancho: 12, hastaY: 14 });
    const a = acomodarDestino("UNA DIRECCION LARGUISIMA QUE NO ENTRA NI DE CASUALIDAD", 7.5, m);
    expect(a.mayuscula).toBe(MAY_DESTINO_MINIMO);
    expect(a.cortado).toBe(true);
    // 🩸 Y el corte CABE: el «…» no puede empujar la línea fuera del cuarto.
    for (const l of a.lineas) expect(m.anchoDeTexto(l, a.mayuscula)).toBeLessThanOrEqual(m.ancho);
    expect(a.lineas.length).toBeLessThanOrEqual(lineasQueCaben(a.mayuscula, m));
  });

  it("y el papel se lo pide con la constante, no con un número escrito a mano", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).toContain("achicarHasta: MAY_DESTINO_MINIMO,");
  });
});

// ─── 6 · LO QUE ESTO NO TOCÓ ─────────────────────────────────────────────────

describe("lo que el arreglo del destino NO tocó", () => {
  it("🔴 los otros tres tamaños siguen clavados: bulto 11 · cliente 5,5 · factura 4", () => {
    const p = piezas(ETQ);
    const en = (t: string) => p.find((x) => x.texto === t)!;
    expect(en("3").mayusculaMm).toBeCloseTo(11.0, 2);
    expect(en("NOVA LUX, S.A.").mayusculaMm).toBeCloseTo(5.5, 2);
    expect(en("11-000002558").mayusculaMm).toBeCloseTo(4.0, 2);
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const [nombre, mm] of [
      ["MAY_BULTO", "11.0"],
      ["MAY_DESTINO", "7.5"],
      ["MAY_CLIENTE", "5.5"],
      ["MAY_FACTURA", "4.0"],
    ]) {
      expect(sinComentarios).toContain(`const ${nombre} = ${mm};`);
    }
  });

  it("el orden sigue siendo empresa · factura · cliente · destino · bulto", () => {
    expect(piezas(ETQ).map((p) => p.texto)).toEqual([
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

  it("⚠️ el CLIENTE no se achica: Daniel pidió el destino, y solo el destino", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect((sinComentarios.match(/achicarHasta:/g) ?? [])).toHaveLength(1);
  });

  it("sigue siendo carta vertical, 4 por hoja, con líneas de corte y UN generador", () => {
    expect(PDF).toContain('format: "letter"');
    expect((PDF.match(/export function construirPdf\w*/g) ?? [])).toHaveLength(1);
  });
});
