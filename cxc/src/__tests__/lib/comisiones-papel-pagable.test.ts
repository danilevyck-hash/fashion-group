// ═════════════════════════════════════════════════════════════════════════════
// 🔴 COMISIONES: EL PAPEL DEL VENDEDOR LLEVA SOLO LO PAGABLE, EL PDF Y EL EXCEL
//    LEEN LA MISMA FUNCIÓN, Y MULTIFASHION ABRE EN EL MES CERRADO (22-sep-2026)
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 Medido en los papeles reales de agosto 2026: el PDF de Reynaldo · Fashion
// Wear listaba 51 renglones de venta y el Excel 49 — dos facturas de City Mall
// David con utilidad ≤ 20 % salían como «$0.00» sin decir por qué; en el de
// Edwin, «De Moda · 11-000003024 · FA · $0.00» (utilidad 9,68 %). Y un recibo
// en cero («20 ago · Jerusalem De Panama · $0.00») salía en los dos papeles.
//
// Daniel: *«3. b) no salen»* · *«recibo $0.00: a) se quita del papel»* · *«7. a)»*
// (Multifashion abre en el último mes cerrado, igual que el grupo).
//
// 🔴 NINGÚN TOTAL SE MUEVE: agosto 2026 sigue dando $5.978,55 a pagar (medido
// contra producción con la RPC real antes y después, ver
// `scripts/_medir-comisiones-papel-pagable.mjs`). Acá se prueba lo mismo con
// datos fijos: el papel CON los renglones en cero y SIN ellos dice los mismos
// números.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PAPEL_SOLO_PAGABLE,
  cobrosDelPapel,
  renglonesDelPapel,
  ventasDelPapel,
} from "@/lib/comisiones/papel-pagable";
import { filasCobros, filasVentas, lineasDelCierre, totalesDelPapel, type HojaReporte } from "@/lib/comisiones/reporte-comision";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { buildComisionDetalleSheet, ventasPagables, type ComisionDetalle } from "@/lib/ventas/comisionExcel";
import {
  MULTIFASHION_CON_EL_PERIODO_DEL_GRUPO,
  corteParaMultifashion,
  periodoParaMultifashion,
} from "@/lib/comisiones/multifashion-periodo";
import { ultimoMesCerrado } from "@/lib/comisiones/mes-inicial";
import { MES_TODO_EL_ANIO } from "@/lib/comisiones/periodo";
import {
  ACCION_DESCARGA_EXCEL,
  ACCION_DESCARGA_PDF,
  MODULO_ACTIVIDAD_COMISIONES,
  alcanceDeVendedor,
  detalleDeDescarga,
} from "@/lib/comisiones/rastro";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const plano = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(doc.output("arraybuffer")),
    useSystemFonts: true,
  }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto.replace(/\s+/g, " ");
}

// ── Los datos: las filas REALES de agosto 2026 que motivaron el cambio ───────
const FACTURA_SIN_COMISION = {
  fecha: "2026-08-05", cliente: "De Moda", secuencial: "11-000003024", tipo: "Factura", subtotal: 0, pct_utilidad: 9.68,
};
const RECIBO_EN_CERO = { fecha: "2026-08-20", cliente: "Jerusalem De Panama", monto: 0 };

/** El reporte SIN renglones en cero. */
const LIMPIO: ComisionDetalle = {
  empresa_key: "vistana",
  year: 2026,
  mes: 8,
  vendedor: "EDWIN",
  tasa_venta: 0.005,
  tasa_cobro: 0.005,
  ventas: [
    { fecha: "2026-08-03", cliente: "City Mall", secuencial: "11-000003022", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 },
    { fecha: "2026-08-11", cliente: "City Mall", secuencial: "11-000003044", tipo: "Nota de Crédito", subtotal: -250, pct_utilidad: null },
  ],
  cobros: [{ fecha: "2026-08-20", cliente: "City Mall", monto: 800 }],
  ventas_base: 750,
  cobros_base: 800,
  comision_venta: 3.75,
  comision_cobro: 4,
  comision_total: 7.75,
};

/** El MISMO reporte, como lo manda el RPC: con la factura en $0 y el recibo en cero. */
const CON_CEROS: ComisionDetalle = {
  ...LIMPIO,
  ventas: [LIMPIO.ventas[0], FACTURA_SIN_COMISION, LIMPIO.ventas[1]],
  cobros: [RECIBO_EN_CERO, ...LIMPIO.cobros],
};

const hoja = (data: ComisionDetalle): HojaReporte => ({
  data,
  descuentos: [{ id: "d1", concepto: "Anticipo", monto: 1.5, activo: true }],
  empresaNombre: "Vistana",
  vendedor: data.vendedor,
  year: data.year,
  mes: data.mes,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LA FUNCIÓN QUE DECIDE
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 renglonesDelPapel: solo lo pagable", () => {
  it("el interruptor está PRENDIDO", () => {
    expect(PAPEL_SOLO_PAGABLE).toBe(true);
  });

  it("una factura con utilidad ≤ 20 % (aporte $0) NO va al papel", () => {
    const { ventas } = renglonesDelPapel(CON_CEROS);
    expect(ventas.map((v) => v.secuencial)).toEqual(["11-000003022", "11-000003044"]);
    expect(ventas.some((v) => v.secuencial === "11-000003024")).toBe(false);
  });

  it("un recibo en $0.00 NO va al papel", () => {
    const { cobros } = renglonesDelPapel(CON_CEROS);
    expect(cobros).toEqual(LIMPIO.cobros);
  });

  it("🔴 la nota de crédito (negativa) SÍ se queda: resta, no vale cero", () => {
    const { ventas } = renglonesDelPapel(CON_CEROS);
    expect(ventas.find((v) => v.tipo === "Nota de Crédito")?.subtotal).toBe(-250);
  });

  it("conserva el orden del RPC y no muta lo que recibe", () => {
    const copia = structuredClone(CON_CEROS);
    renglonesDelPapel(copia);
    expect(copia).toEqual(CON_CEROS);
    expect(ventasDelPapel(CON_CEROS.ventas).map((v) => v.secuencial)).toEqual(["11-000003022", "11-000003044"]);
    expect(cobrosDelPapel(CON_CEROS.cobros).map((c) => c.cliente)).toEqual(["City Mall"]);
  });

  it("🔴 con el interruptor en `false` va TODO lo que trajo el RPC (como antes)", () => {
    const todo = renglonesDelPapel(CON_CEROS, false);
    expect(todo.ventas).toEqual(CON_CEROS.ventas);
    expect(todo.cobros).toEqual(CON_CEROS.cobros);
  });

  it("`ventasPagables` del Excel es la MISMA regla (no una segunda copia)", () => {
    expect(ventasPagables(CON_CEROS.ventas)).toEqual(ventasDelPapel(CON_CEROS.ventas));
    const excel = plano(leer("src/lib/ventas/comisionExcel.ts"));
    expect(excel).toMatch(/export function ventasPagables[^}]*return ventasDelPapel\(ventas\);/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL PDF Y EL EXCEL LEEN LA MISMA FUNCIÓN
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el PDF y el Excel comparten la función de renglones", () => {
  const reporte = plano(leer("src/lib/comisiones/reporte-comision.ts"));
  const excel = plano(leer("src/lib/ventas/comisionExcel.ts"));

  it("los dos importan `renglonesDelPapel` de `papel-pagable`", () => {
    expect(reporte).toMatch(/import \{ renglonesDelPapel \} from "@\/lib\/comisiones\/papel-pagable"/);
    expect(excel).toMatch(/import \{[^}]*renglonesDelPapel[^}]*\} from "@\/lib\/comisiones\/papel-pagable"/);
  });

  it("🔴 el PDF ya no recorre `data.ventas` ni `data.cobros` por su cuenta", () => {
    expect(reporte).toContain("renglonesDelPapel(data).ventas.map(");
    expect(reporte).toContain("renglonesDelPapel(data).cobros.map(");
    expect(reporte).not.toMatch(/\(data\.ventas \?\? \[\]\)\.map/);
    expect(reporte).not.toMatch(/\(data\.cobros \?\? \[\]\)\.map/);
  });

  it("🔴 el Excel arma VENTAS y COBROS desde `renglonesDelPapel(d)`", () => {
    expect(excel).toContain("const renglones = renglonesDelPapel(d);");
    expect(excel).toContain("const ventasExcel = ventasPagables(renglones.ventas);");
    expect(excel).toContain("const cobrosExcel = renglones.cobros;");
    expect(excel).toContain("cobrosExcel.forEach(");
    expect(excel).not.toContain("d.cobros.forEach(");
  });

  it("las filas del PDF son las mismas que las del Excel (con y sin ceros)", () => {
    expect(filasVentas(CON_CEROS)).toEqual(filasVentas(LIMPIO));
    expect(filasCobros(CON_CEROS)).toEqual(filasCobros(LIMPIO));
    expect(filasVentas(CON_CEROS).map((f) => f.celdas[2])).toEqual(ventasPagables(CON_CEROS.ventas).map((v) => v.secuencial));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · NINGÚN TOTAL SE MUEVE
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 quitar los renglones en cero no cambia un centavo", () => {
  it("las líneas del cierre y los totales del papel son idénticos con y sin ceros", () => {
    expect(lineasDelCierre(CON_CEROS, hoja(CON_CEROS).descuentos)).toEqual(lineasDelCierre(LIMPIO, hoja(LIMPIO).descuentos));
    expect(totalesDelPapel(CON_CEROS)).toEqual(totalesDelPapel(LIMPIO));
  });

  it("🔴 el PDF con los ceros del RPC es el MISMO PDF que sin ellos: ni «De Moda» ni «Jerusalem»", async () => {
    const conCeros = await textoDelPdf(construirPdfComision([hoja(CON_CEROS)]));
    const limpio = await textoDelPdf(construirPdfComision([hoja(LIMPIO)]));
    expect(conCeros).toBe(limpio);
    expect(conCeros).not.toContain("De Moda");
    expect(conCeros).not.toContain("11-000003024");
    expect(conCeros).not.toContain("Jerusalem");
    // Lo que SÍ tiene que estar: la NC en negativo y los totales del RPC.
    expect(conCeros).toContain("11-000003044");
    expect(conCeros).toContain("TOTAL VENTAS $750.00");
    expect(conCeros).toContain("TOTAL COBROS $800.00");
    expect(conCeros).toContain("Total a pagar $6.25");
  });

  it("🔴 el Excel tampoco lista el recibo en cero ni la factura en $0, y sus totales son los del RPC", async () => {
    const ws = await buildComisionDetalleSheet(CON_CEROS, "Vistana", hoja(CON_CEROS).descuentos);
    const wsLimpio = await buildComisionDetalleSheet(LIMPIO, "Vistana", hoja(LIMPIO).descuentos);
    const textos = (w: Record<string, unknown>) =>
      Object.entries(w)
        .filter(([k]) => /^[A-Z]+\d+$/.test(k))
        .map(([, c]) => String((c as { v?: unknown }).v ?? ""));
    expect(textos(ws as Record<string, unknown>)).toEqual(textos(wsLimpio as Record<string, unknown>));
    const todo = textos(ws as Record<string, unknown>).join(" | ");
    expect(todo).not.toContain("Jerusalem De Panama");
    expect(todo).not.toContain("11-000003024");
    expect(todo).toContain("11-000003044");
    expect(todo).toContain("Total ventas | 750");
    expect(todo).toContain("Total cobros | 800");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · MULTIFASHION ABRE EN EL MES CERRADO, CON EL SELECTOR DEL GRUPO
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 Multifashion dentro de Comisiones abre en el último mes cerrado", () => {
  const shell = plano(leer("src/components/comisiones/ComisionesView.tsx"));

  it("el interruptor está PRENDIDO", () => {
    expect(MULTIFASHION_CON_EL_PERIODO_DEL_GRUPO).toBe(true);
  });

  it("el período del grupo se traduce al de Multifashion: mes → mes, «Todo el año» → año", () => {
    const cerrado = ultimoMesCerrado("2026-09-22");
    expect(periodoParaMultifashion(cerrado.year, cerrado.mes)).toEqual({ tipo: "mes", anio: 2026, mes: 8 });
    expect(periodoParaMultifashion(2026, MES_TODO_EL_ANIO)).toEqual({ tipo: "anio", anio: 2026 });
    expect(corteParaMultifashion("2026-09-22")).toEqual({ anio: 2026, mes: 9 });
    expect(corteParaMultifashion("2027-01-02")).toEqual({ anio: 2027, mes: 1 });
  });

  it("🔴 el shell le pasa a la vista de Multifashion el MISMO `year`/`mes` del selector (que arranca en el mes cerrado)", () => {
    expect(shell).toContain("useState<number>(inicial.mes)");
    expect(shell).toContain("periodoInicial(hoyPanama()");
    expect(shell).toContain("periodo={multifashionConPeriodo ? periodoParaMultifashion(year, mes) : undefined}");
    expect(shell).toContain("corte={multifashionConPeriodo ? corteParaMultifashion(hoyPanama()) : undefined}");
  });

  it("el selector de período se dibuja también en Multifashion (y solo con el interruptor)", () => {
    expect(shell).toContain("const multifashionConPeriodo = enMultifashion && MULTIFASHION_CON_EL_PERIODO_DEL_GRUPO;");
    expect(shell).toContain("const conPeriodo = !(enConfig && hayConfig) && (!enMultifashion || multifashionConPeriodo);");
  });

  it("⚠️ Multifashion no tiene papel: los botones de descarga no se dibujan ahí (no se inventa una descarga)", () => {
    expect(shell).toContain("const conDescarga = conPeriodo && !enMultifashion;");
    expect(shell).not.toContain("conMetas");
  });

  it("🔴 el cálculo de Multifashion no se toca: sigue siendo la MISMA vista importada", () => {
    expect(shell).toContain('import("@/components/multifashion/VendedorasSubtab")');
    expect(leer("src/components/multifashion/VendedorasSubtab.tsx")).toContain("const conControlPropio = periodo == null");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · QUEDA RASTRO
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 cada descarga y cada cambio de configuración dejan rastro", () => {
  it("el detalle de una descarga dice formato, alcance, vendedor, empresa y período", () => {
    expect(detalleDeDescarga("pdf", { alcance: "vendedor", vendedor: "EDWIN", empresa: "vistana", year: 2026, mes: 8 })).toEqual({
      formato: "pdf", alcance: "vendedor", vendedor: "EDWIN", empresa: "vistana", year: 2026, mes: 8,
    });
    expect(alcanceDeVendedor(1)).toBe("vendedor");
    expect(alcanceDeVendedor(3)).toBe("vendedor-todas");
    expect(MODULO_ACTIVIDAD_COMISIONES).toBe("comisiones");
    // El Excel se anota con el MISMO nombre que en Ventas.
    expect(ACCION_DESCARGA_EXCEL).toBe("descarga_excel");
    expect(ACCION_DESCARGA_PDF).toBe("descarga_pdf");
  });

  it("las cuatro puertas de descarga anotan", () => {
    for (const rel of [
      "src/components/comisiones/comisiones-detalle/useDescargaComision.tsx",
      "src/components/comisiones/ComisionesDetalleModal.tsx",
      "src/components/comisiones/ComisionesConsolidadoView.tsx",
      "src/components/comisiones/ComisionesPorEmpresaView.tsx",
    ]) {
      const src = plano(leer(rel));
      expect(src, rel).toContain('from "@/lib/comisiones/rastro"');
      expect(src, rel).toContain("anotarDescargaComision(");
      // Y anotan los DOS formatos: un `anotar("pdf")` sin su `anotar("excel")`
      // (o al revés) deja media puerta sin rastro.
      expect(src, rel).toMatch(/anotar\("pdf"/);
      expect(src, rel).toMatch(/anotar\("excel"/);
    }
    // La flechita tiene DOS caminos de Excel (una empresa · todas) y uno de PDF.
    const flecha = plano(leer("src/components/comisiones/comisiones-detalle/useDescargaComision.tsx"));
    expect(flecha.match(/anotar\("excel", empresas, vendedor\)/g)?.length).toBe(2);
    expect(flecha.match(/anotar\("pdf", empresas, vendedor\)/g)?.length).toBe(1);
  });

  it("las cuatro rutas de configuración anotan en el SERVIDOR, con quién lo hizo", () => {
    for (const [rel, accion] of [
      ["src/app/api/ventas/comisiones/config/route.ts", "ACCION_CONFIG_TASA"],
      ["src/app/api/ventas/comisiones/exclusiones/route.ts", "ACCION_CONFIG_CLIENTE_SIN_COMISION"],
      ["src/app/api/ventas/comisiones/descuentos-fijos/route.ts", "ACCION_CONFIG_DESCUENTO"],
      ["src/app/api/ventas/comisiones/descuentos/route.ts", "ACCION_CONFIG_DESCUENTO_MES"],
    ] as const) {
      const src = plano(leer(rel));
      expect(src, rel).toContain('from "@/lib/comisiones/rastro-server"');
      expect(src, rel).toContain(`anotarConfigComision(auth, ${accion},`);
    }
    // Quitar y agregar anotan por separado (exclusiones y descuentos).
    expect(plano(leer("src/app/api/ventas/comisiones/exclusiones/route.ts")).match(/anotarConfigComision\(/g)?.length).toBe(3);
    expect(plano(leer("src/app/api/ventas/comisiones/descuentos-fijos/route.ts")).match(/anotarConfigComision\(/g)?.length).toBe(4);
  });

  it("el rastro del servidor nunca tira la ruta: `logActivity` va dentro de un try", () => {
    const src = plano(leer("src/lib/comisiones/rastro-server.ts"));
    expect(src).toMatch(/try \{\s*await logActivity\(/);
  });
});
