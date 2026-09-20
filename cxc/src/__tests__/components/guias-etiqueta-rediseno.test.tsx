/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › ETIQUETAS — EL REDISEÑO DE LA ETIQUETA Y LA BARRA (18-sep-2026).
 *
 * Dos cambios de PANTALLA aprobados por Daniel. **Ninguno mueve un número.**
 *
 * 1 · LA ETIQUETA, con el mockup que hizo él:
 *     · 🔴 EL RÓTULO VA ARRIBA DEL DATO, chico y gris. Antes se leía
 *       «Factura 11-000002558» y «Destino: Paso Canoas» pegados en una línea.
 *     · 🔴 EL DESTINO SE LEE DE LEJOS. Quien recibe lee el cliente; quien
 *       carga el camión ordena por destino. (El 18-sep quedaron iguales; el
 *       20-sep-2026 el destino pasó a ser el más grande de los dos.)
 *     · 🔴 EL RÓTULO Y SU NÚMERO, SEPARADOS POR UNA RAYA y centrados abajo: el
 *       rótulo chico arriba y «3 de 14» enorme debajo. Antes era una sola
 *       línea «CAJA 1 de 4» flotando sin separador. (El rótulo dice «BULTO»
 *       desde el 20-sep-2026, y el número va partido en dos tamaños.)
 *     · 🔴 LA FECHA EN EL FORMATO DE LA CASA («18 sept 2026»), que sale de
 *       `fmtDate` — el mismo de todo el papel del sistema.
 *
 * 2 · LA BARRA DE ETIQUETAS TOMA LA FORMA DE GUÍAS. Daniel: *«siento que ambos
 *     tabs deben tener el mismo layout, que se sientan familia»*. Acciones
 *     arriba a la derecha, buscador y filtros en la fila de abajo — y el ORDEN
 *     de las pestañas NO cambia: Guías sigue primero.
 *
 * 🔑 EL PDF SE ARMA DE VERDAD ACÁ: no alcanza con leer el archivo. Un
 * `setCharSpace` que no existiera reventaría recién al tocar «Imprimir»,
 * delante de la secretaria. Se genera el papel y se lee el ORDEN de los bloques
 * en el propio flujo del PDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";

import EtiquetasView from "@/app/guias/components/EtiquetasView";
import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import {
  ROTULO_BULTO,
  cajasDelJuego,
  fechaDeLaEtiqueta,
  numeroDeCaja,
  partesDelNumeroDeBulto,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import { fmtDate } from "@/lib/format";

const raiz = process.cwd();
const leer = (p: string): string => fs.readFileSync(path.join(raiz, p), "utf8");
const PDF = leer("src/lib/guias/pdf-etiquetas.ts");
const VISTA = leer("src/app/guias/components/EtiquetasView.tsx");
const LISTA_GUIAS = leer("src/app/guias/components/GuiasList.tsx");

/** La etiqueta del ejemplo real: Nova Lux, 14 cajas, Paso Canoas. */
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

/**
 * El PAPEL DE VERDAD: se arma el PDF y se sacan los textos EN EL ORDEN en que
 * se dibujaron. jsPDF no comprime el flujo de texto, así que cada `doc.text`
 * queda como un literal `(…) Tj` en el mismo orden del dibujo.
 */
function textosDelPapel(etiqueta: EtiquetaFila, cajas: readonly number[]): string[] {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(etiqueta), cajas);
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  return (crudo.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g) ?? []).map((t) =>
    t.replace(/^\(/, "").replace(/\)\s*Tj$/, ""),
  );
}

/** Dónde quedó un texto en el papel. -1 = no se dibujó. */
function posicion(textos: readonly string[], texto: string): number {
  return textos.indexOf(texto);
}

/**
 * Las coordenadas de CADA texto del papel, en puntos PDF (el origen está abajo
 * a la izquierda de la hoja). jsPDF escribe `x y Td` justo antes de su `Tj`.
 */
function coordenadas(etiqueta: EtiquetaFila, cajas: readonly number[]): Map<string, { x: number; y: number }> {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(etiqueta), cajas);
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const mapa = new Map<string, { x: number; y: number }>();
  const re = /([-\d.]+)\s+([-\d.]+)\s+Td\s*\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo)) !== null) {
    if (!mapa.has(m[3])) mapa.set(m[3], { x: Number(m[1]), y: Number(m[2]) });
  }
  return mapa;
}

// ─── 1 · LA ETIQUETA ─────────────────────────────────────────────────────────

describe("🔴 1. la etiqueta: el rótulo ARRIBA del dato", () => {
  it("el papel se arma de verdad y trae los ocho textos, en el orden del mockup", () => {
    const textos = textosDelPapel(ETQ, [3]);
    // ⚠️ 20-sep-2026: el rótulo pasó a «BULTO» y el número se parte en «3» y
    // «de 14», dos tamaños en la MISMA línea. El orden no cambió.
    expect(textos).toEqual([
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

  it("🔴 cada rótulo se dibuja ANTES de su dato — arriba, no al lado", () => {
    const t = textosDelPapel(ETQ, [3]);
    expect(posicion(t, "Factura")).toBeLessThan(posicion(t, "11-000002558"));
    expect(posicion(t, "Cliente")).toBeLessThan(posicion(t, "NOVA LUX, S.A."));
    expect(posicion(t, "Destino")).toBeLessThan(posicion(t, "PASO CANOAS"));
    expect(posicion(t, ROTULO_BULTO)).toBeLessThan(posicion(t, "3"));
  });

  it("🩸 y ya NO existen las líneas pegadas de antes: «Factura 11-…», «Destino: …»", () => {
    const t = textosDelPapel(ETQ, [3]);
    for (const linea of t) {
      expect(linea).not.toMatch(/^Factura .+/);
      expect(linea).not.toMatch(/^Destino: /);
      // La línea vieja del pie: «CAJA 3 de 14» en un solo renglón.
      expect(linea).not.toMatch(/^CAJA .+ de .+/);
      // 🔴 Y NUNCA «3/14»: con la etiqueta sucia la rayita se pierde y se lee «314».
      expect(linea).not.toMatch(/^\d+\/\d+$/);
    }
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain("`Factura ${");
    expect(sinComentarios).not.toContain("`Destino: ${");
  });

  it("🔴 los tres campos salen de UNA sola función: nadie puede pegar un rótulo en uno solo", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const usos = sinComentarios.match(/bloqueDeCampo\(/g) ?? [];
    // La definición + los tres campos.
    expect(usos).toHaveLength(4);
    for (const rotulo of ['"Factura"', '"Cliente"', '"Destino"']) {
      expect(sinComentarios).toContain(`bloqueDeCampo(doc, ${rotulo},`);
    }
  });
});

// ⚠️ CAMBIÓ DE DIRECCIÓN EL 20-sep-2026. El 18-sep el destino quedó del MISMO
// tamaño que el cliente; hoy es MÁS GRANDE que él, porque se lee desde más
// lejos. Los milímetros exactos los fija `guias-etiqueta-agrande.test.ts`.
describe("🔴 2. el destino, tan grande como hace falta", () => {
  it("🔴 es MÁS grande que el cliente, y los dos salen de la misma regla", () => {
    expect(PDF).toContain("const MAY_DESTINO = 7.5;");
    expect(PDF).toContain("const MAY_CLIENTE = 5.5;");
    expect(PDF).toContain("const F_DESTINO = PT_PARA_MAYUSCULA(MAY_DESTINO);");
  });

  it("🩸 y el destino ya no es más chico que el cliente (era 2,2 % contra 3,3 %)", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/const F_DESTINO = PT\(0/);
    // Y ya nadie escribe un tamaño como porcentaje del ancho de la hoja.
    expect(sinComentarios).not.toMatch(/const F_\w+ = PT\(0\.\d+ \* HOJA_W\)/);
  });

  it("el cliente y el destino se escriben en MAYÚSCULAS, como la empresa", () => {
    const t = textosDelPapel(
      { ...ETQ, cliente_nombre: "Nova Lux, S.A.", destino: "Paso Canoas" },
      [1],
    );
    expect(t).toContain("NOVA LUX, S.A.");
    expect(t).toContain("PASO CANOAS");
  });
});

describe("🔴 3. «BULTO» y su número, separados por una raya", () => {
  it("son DOS textos, no una línea: el rótulo y el número viven aparte", () => {
    expect(ROTULO_BULTO).toBe("BULTO");
    expect(numeroDeCaja(3, 14)).toBe("3 de 14");
    expect(numeroDeCaja(1, 1)).toBe("1 de 1");
    expect(partesDelNumeroDeBulto(1, 4)).toEqual({ numero: "1", total: "de 4" });
  });

  it("🔴 se dibuja una RAYA antes del bloque, y los dos textos van CENTRADOS", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).toMatch(
      /doc\.line\(izq, yRaya, der, yRaya\);[\s\S]{0,400}ROTULO_BULTO, centro[^,]*, yRotulo, \{ align: "center" \}/,
    );
    // El número ya no se centra con `align`: son dos piezas de distinto tamaño
    // que se centran como UN bloque (`xNumero`).
    expect(sinComentarios).toContain("partesDelNumeroDeBulto(caja, d.cajas)");
    expect(sinComentarios).toContain("doc.text(numero, xNumero, yNumero);");
  });

  it("🔴 el número se ancla al BORDE DE ABAJO: no se mueve aunque el nombre lleve dos líneas", () => {
    const corto = coordenadas(ETQ, [3]);
    const largo = coordenadas(
      { ...ETQ, cliente_nombre: "Comercializadora Internacional de Calzado y Accesorios del Istmo" },
      [3],
    );
    // El nombre largo SÍ empuja lo suyo hacia abajo…
    expect(largo.get("Destino")!.y).toBeLessThan(corto.get("Destino")!.y);
    // …y el número del bulto NO se mueve ni un punto.
    expect(largo.get("3")!.y).toBe(corto.get("3")!.y);
    expect(largo.get("de 14")!.y).toBe(corto.get("de 14")!.y);
    expect(largo.get("BULTO")!.y).toBe(corto.get("BULTO")!.y);
    expect(PDF).toContain("const yNumero = y0 + CUARTO_H - PAD_Y;");
  });

  it("🔴 «BULTO» va ENCIMA del número, y los dos CENTRADOS en el mismo eje", () => {
    const c = coordenadas(ETQ, [3]);
    const rotulo = c.get("BULTO")!;
    const numero = c.get("3")!;
    // Encima: en PDF la `y` crece hacia arriba.
    expect(rotulo.y).toBeGreaterThan(numero.y);
    // Y el «de 14» comparte la base con el número.
    expect(c.get("de 14")!.y).toBe(numero.y);
    // El eje: el centro del cuarto (107,95 mm ÷ 2) en puntos.
    const centro = (107.95 / 2) / 0.3527777778;
    expect(Math.abs(rotulo.x + 15 - centro)).toBeLessThan(6);
  });

  it("🔴 y los tres datos arrancan en el MISMO margen izquierdo, uno debajo del otro", () => {
    const c = coordenadas(ETQ, [3]);
    const xs = ["Factura", "11-000002558", "Cliente", "NOVA LUX, S.A.", "Destino", "PASO CANOAS"].map(
      (t) => c.get(t)!.x,
    );
    expect(new Set(xs.map((x) => x.toFixed(4))).size).toBe(1);
    // Y cada dato queda DEBAJO de su rótulo, no al lado.
    expect(c.get("11-000002558")!.y).toBeLessThan(c.get("Factura")!.y);
    expect(c.get("NOVA LUX, S.A.")!.y).toBeLessThan(c.get("Cliente")!.y);
    expect(c.get("PASO CANOAS")!.y).toBeLessThan(c.get("Destino")!.y);
  });

  it("y el número es lo MÁS GRANDE del papel", () => {
    const tam = (nombre: string): number => {
      const m = PDF.match(new RegExp(`const MAY_${nombre} = ([\\d.]+);`));
      return m ? Number(m[1]) : 0;
    };
    const bulto = tam("BULTO");
    expect(bulto).toBeGreaterThan(tam("DESTINO"));
    expect(bulto).toBeGreaterThan(tam("CLIENTE"));
    expect(bulto).toBeGreaterThan(tam("EMPRESA"));
    expect(bulto).toBeGreaterThan(tam("BULTO_ROTULO"));
    // Y el rótulo gris es lo más chico.
    expect(tam("ROTULO")).toBeLessThan(tam("FACTURA"));
    expect(tam("ROTULO")).toBeLessThan(tam("FECHA") + 0.001);
  });
});

describe("🔴 4. la fecha, en el formato de la casa", () => {
  it("«18 sept 2026», el MISMO `fmtDate` de todo el papel del sistema", () => {
    expect(fechaDeLaEtiqueta("2026-09-18")).toBe(fmtDate("2026-09-18"));
    expect(fechaDeLaEtiqueta("2026-09-18")).toBe("18 sept 2026");
    expect(fechaDeLaEtiqueta("2026-01-05")).toBe("5 ene 2026");
  });

  it("🩸 y ya NO se arma a mano el DD-MM-AAAA de antes", () => {
    const puro = leer("src/lib/guias/etiquetas.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(puro).toContain('import { fmtDate } from "@/lib/format"');
    expect(puro).not.toContain("return `${d}-${m}-${y}`;");
    expect(fechaDeLaEtiqueta("2026-09-18")).not.toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  it("⚠️ la validación se queda: lo que no es una fecha calendario sale VACÍO", () => {
    expect(fechaDeLaEtiqueta("")).toBe("");
    expect(fechaDeLaEtiqueta("2026-13-01")).toBe("");
    expect(fechaDeLaEtiqueta("mañana")).toBe("");
    // Y nunca se imprime un «Invalid Date» encima de una caja.
    const t = textosDelPapel({ ...ETQ, fecha_factura: "no-es-fecha" }, [1]);
    expect(t.join(" ")).not.toContain("Invalid");
  });
});

describe("lo que el rediseño NO tocó", () => {
  it("sigue siendo jsPDF, carta vertical, cuatro por hoja y con líneas de corte", () => {
    expect(PDF).toContain('from "jspdf"');
    expect(PDF).toContain('format: "letter"');
    expect(PDF).toContain('orientation: "portrait"');
    expect(PDF).toContain("setLineDashPattern");
    const doc = construirPdfEtiquetas(datosDeEtiqueta(ETQ), cajasDelJuego(14));
    expect(doc.getNumberOfPages()).toBe(4);
    expect((doc.output("arraybuffer") as ArrayBuffer).byteLength).toBeGreaterThan(2000);
  });

  it("🔴 UN SOLO generador, y la empresa sigue arriba con su raya", () => {
    expect((PDF.match(/export function construirPdf\w*/g) ?? [])).toHaveLength(1);
    const t = textosDelPapel(ETQ, [3]);
    expect(t[0]).toBe("FASHION SHOES");
    expect(t[1]).toBe("18 sept 2026");
  });

  it("🔴 SIN transportista, SIN piezas, SIN código de barras", () => {
    const sinComentarios = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/transportista/i);
    expect(sinComentarios).not.toMatch(/barcode|jsbarcode|bwip|qrcode|zpl/i);
  });
});

// ─── 2 · LA BARRA DE ETIQUETAS, CON LA FORMA DE GUÍAS ────────────────────────

const FILAS = [
  { ...ETQ },
  {
    ...ETQ,
    id: 2,
    empresa_key: "vistana",
    empresa: "Vistana International",
    switch_factura_id: 43102,
    secuencial: "11-000003102",
    cliente_codigo: "D-55",
    cliente_nombre: "Golden Mall",
    destino: "David",
    cajas: 2,
    guia_numero: 259,
  },
];

function servir(respuesta: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/guias/etiquetas")) {
        return { ok: true, status: 200, json: async () => respuesta } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 5. las dos pestañas se sienten familia", () => {
  it("el botón negro vive en una fila PROPIA, arriba y a la derecha — como en Guías", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    const boton = await screen.findByRole("button", { name: /Etiquetar una factura/ });
    const fila = boton.parentElement as HTMLElement;
    expect(fila.className).toContain("justify-end");
    // 🔴 LA MISMA FORMA que la fila de acciones de Guías.
    expect(LISTA_GUIAS).toContain('className="flex items-center justify-end mb-6 flex-wrap gap-4"');
    expect(VISTA).toContain('className="flex items-center justify-end mb-4 flex-wrap gap-4"');
  });

  it("🩸 y el buscador ya NO comparte fila con el botón negro (eran cinco cosas en una)", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    const boton = await screen.findByRole("button", { name: /Etiquetar una factura/ });
    const buscador = screen.getByLabelText("Buscar factura o cliente");
    expect(buscador.parentElement).not.toBe(boton.parentElement);
  });

  it("el buscador y los DOS filtros viven juntos en la fila de abajo", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    const buscador = await screen.findByLabelText("Buscar factura o cliente");
    const filaDeAbajo = buscador.parentElement as HTMLElement;
    expect(filaDeAbajo.textContent).toContain("Pendientes de guía");
    expect(filaDeAbajo.textContent).toContain("Todas");
    // El buscador se estira, con el mismo tope que el de Guías.
    expect(buscador.className).toContain("flex-1");
    expect(buscador.className).toContain("max-w-sm");
  });

  it("y los filtros siguen contando: 1 pendiente de 2", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pendientes de guía · 1" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Todas · 2" })).toBeTruthy();
    });
  });

  /**
   * ⚠️ Daniel preguntó si Etiquetas debía ir de primero y quedamos en que NO: el
   * orden sigue lo que más se abre, y hoy son 257 guías contra una etiqueta.
   */
  it("⚠️ el ORDEN de las pestañas NO cambió: Guías sigue primero", () => {
    const pagina = leer("src/app/guias/page.tsx");
    const lista = pagina.slice(
      pagina.indexOf("const pestanas: Array<[Vista, string]> = ["),
      pagina.indexOf("// Al TOCAR Guías"),
    );
    expect(lista).toContain('["guias", "Guías"]');
    expect(lista.indexOf('"Guías"')).toBeLessThan(lista.indexOf('"Etiquetas"'));
    expect(lista.indexOf('"Etiquetas"')).toBeLessThan(lista.indexOf('"Configuración"'));
  });
});
