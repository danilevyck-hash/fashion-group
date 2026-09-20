// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PAPEL Y EL EXCEL DE LA CARTERA CIERRAN CON EL MISMO TOTAL QUE LA
// PANTALLA (20-sep-2026, pedido de Daniel).
//
// 🩸 QUÉ PASABA, medido contra producción: el papel decía **$4.244.028,67** y la
// pantalla **$4.242.821,12**. La diferencia son **$1.207,55**: los **5 clientes
// con saldo a favor**, que la pantalla muestra en su bloque «SALDO A FAVOR (5)»
// al pie de la lista y que del papel y del Excel DESAPARECÍAN sin que nada lo
// dijera. Dos números para la misma cartera, el mismo día, y ninguno de los dos
// explicaba por qué no coincidían.
//
// Ahora los dos formatos llevan su propio bloque de saldo a favor, y cierran con
// el número de la pantalla:
//
//     …los que se cobran…
//     Total por cobrar      4.244.028,67
//     Saldo a favor (5)
//     …los cinco…
//     Total general         4.242.821,12   ← el de la pantalla
//
// ⚠️ NO CAMBIA A QUIÉN SE LE COBRA. `lib/cxc/cobrable.ts` sigue igual: al saldo
// a favor no se le manda correo, no tiene botón «Cobrar» ni casilla de lote, y
// no entra a la lista de cobro. Lo que cambia es que ahora SE VE en el archivo.
//
// ⚠️ Y SIN NADIE A FAVOR el archivo sale EXACTAMENTE como antes: sus filas y una
// sola fila «Total». Por eso este candado prueba las dos formas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { B2B_COMPANIES } from "@/lib/companies";
import { seLeCobra } from "@/lib/cxc/cobrable";
import {
  ROTULO_TOTAL_GENERAL,
  ROTULO_TOTAL_POR_COBRAR,
  bloquesPorCompania,
  bloquesSaldoAFavor,
  clientesConSaldoAFavor,
  filasSaldoAFavor,
  filasTotalPorCliente,
  rotuloSaldoAFavor,
  totalDeLasFilas,
  totalGeneral,
} from "@/lib/cxc/descargas";
import { libroPorCompania, libroTotalPorCliente } from "@/lib/cxc/excel-cartera";
import { pdfPorCompania, pdfTotalPorCliente } from "@/lib/pdf-cxc";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

// ── La cartera de prueba ─────────────────────────────────────────────────────

function empresa(codigo: string, nombre: string, buckets: Partial<Record<string, number>>) {
  const base = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };
  const b = { ...base, ...buckets };
  return {
    nombre, codigo, ...b,
    total: b.d0_30 + b.d31_60 + b.d61_90 + b.d91_120 + b.d121_180 + b.d181_270 + b.d271_365 + b.mas_365,
    ultimoPagoFecha: null, ultimoPagoMonto: null, ultimaCompraFecha: null, ultimaCompraMonto: null,
  };
}

function cliente(llave: string, companies: Record<string, ReturnType<typeof empresa>>): ConsolidatedClient {
  let current = 0, watch = 0, overdue = 0, total = 0;
  for (const co of Object.values(companies)) {
    current += co.d0_30 + co.d31_60 + co.d61_90;
    watch += co.d91_120;
    overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
    total += co.total;
  }
  return {
    nombre_normalized: llave, companies,
    correo: "", telefono: "", celular: "", contacto: "",
    total, current, watch, overdue,
    d0_30: 0, d31_60: 0, d61_90: 0, d91_120: watch, d121_plus: overdue,
  } as unknown as ConsolidatedClient;
}

const CITY = cliente("CITY MALL PASO CANOA", {
  vistana: empresa("D-25", "City Mall Paso Canoa", { d0_30: 1000, d91_120: 200 }),
  fashion_wear: empresa("D-25", "City Mall Paso Canoa", { d121_180: 500 }),
});
// Los dos del bloque aparte. El mayor medido en producción es Viva Panama con
// −$1.147,52; el mostrador «Ventas Local» tenía −$19,00.
const VIVA = cliente("VIVA PANAMA DUTTY FREE", {
  vistana: empresa("D-139", "Viva Panama Dutty Free", { d0_30: -1147.52 }),
});
const LOCAL = cliente("VENTAS LOCAL", {
  fashion_wear: empresa("TCKCTA", "Ventas Local", { d0_30: -19 }),
});

const CARTERA = [CITY, VIVA, LOCAL];
const SOLO_DEUDA = [CITY];

const DOS: Company[] = B2B_COMPANIES.filter((c) => c.key === "vistana" || c.key === "fashion_wear");

/** Lo que dice la PANTALLA al pie: la suma de TODAS las filas, a favor incluido. */
const TOTAL_DE_LA_PANTALLA = CARTERA.reduce((s, c) => s + c.total, 0); // 1700 − 1166,52

// El generador termina en `doc.save(archivo)`, que en Node escribe de verdad:
// se le manda a la carpeta temporal del sistema para no ensuciar el repo.
const OPTS = {
  subtitulo: "x",
  archivo: path.join(os.tmpdir(), "cxc-cartera-candado.pdf"),
  hoy: "2026-09-20",
};

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto.replace(/\s+/g, " ");
}

/** El valor de una celda de la hoja, sea número, texto o celda con estilo. */
function celda(ws: Record<string, { v?: unknown }>, ref: string): unknown {
  return ws[ref]?.v;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La división: los que se cobran y los de saldo a favor
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · la cartera se parte en dos, como la pantalla", () => {
  it("los que se cobran y los de saldo a favor, sin que se pierda nadie", () => {
    expect(filasTotalPorCliente(CARTERA).map((f) => f.codigo)).toEqual(["D-25"]);
    expect(filasSaldoAFavor(CARTERA).map((f) => f.codigo)).toEqual(["D-139", "TCKCTA"]);
    // Ni uno se queda afuera de los dos bloques.
    expect(filasTotalPorCliente(CARTERA).length + filasSaldoAFavor(CARTERA).length).toBe(CARTERA.length);
  });

  it("la división la decide el SALDO, con la regla de siempre", () => {
    expect(clientesConSaldoAFavor(CARTERA).every((c) => !seLeCobra(c.total))).toBe(true);
    expect(seLeCobra(-19)).toBe(false);
  });

  it("y lo mismo en el detallado por compañía", () => {
    expect(bloquesPorCompania(CARTERA, DOS).map((b) => b.codigo)).toEqual(["D-25"]);
    expect(bloquesSaldoAFavor(CARTERA, DOS).map((b) => b.codigo)).toEqual(["D-139", "TCKCTA"]);
    // El bloque a favor conserva su desglose por empresa, como cualquier otro.
    expect(bloquesSaldoAFavor(CARTERA, DOS)[0].empresas).toHaveLength(1);
  });

  it("🔴 el total general es el de la pantalla, no el de lo que se cobra", () => {
    const porCobrar = filasTotalPorCliente(CARTERA);
    const aFavor = filasSaldoAFavor(CARTERA);
    expect(totalDeLasFilas(porCobrar).total).toBe(1700);
    expect(totalGeneral(porCobrar, aFavor).total).toBeCloseTo(TOTAL_DE_LA_PANTALLA, 2);
    expect(totalGeneral(porCobrar, aFavor).total).toBeCloseTo(533.48, 2);
  });

  it("el rótulo del bloque es el MISMO que el de la pantalla", () => {
    expect(rotuloSaldoAFavor(5)).toBe("Saldo a favor (5)");
    expect(plano("src/app/cxc/components/ClientTable.tsx")).toContain("Saldo a favor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El PDF
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · el papel lleva su bloque y cierra con el total de la pantalla", () => {
  it("«Total por cliente»: el bloque, sus filas y el Total general", async () => {
    const doc = pdfTotalPorCliente(filasTotalPorCliente(CARTERA), filasSaldoAFavor(CARTERA), OPTS);
    const texto = await textoDelPdf(doc);
    expect(texto).toContain(ROTULO_TOTAL_POR_COBRAR);
    expect(texto).toContain(rotuloSaldoAFavor(2));
    expect(texto).toContain("Viva Panama Dutty Free");
    expect(texto).toContain("Ventas Local");
    expect(texto).toContain(ROTULO_TOTAL_GENERAL);
    // Los DOS números, cada uno una vez: lo que se cobra y el de la pantalla.
    expect(texto).toContain("$1,700.00");
    expect(texto).toContain("$533.48");
  });

  it("«Detallado por compañía»: lo mismo, con las empresas adentro", async () => {
    const doc = pdfPorCompania(bloquesPorCompania(CARTERA, DOS), bloquesSaldoAFavor(CARTERA, DOS), OPTS);
    const texto = await textoDelPdf(doc);
    expect(texto).toContain(rotuloSaldoAFavor(2));
    expect(texto).toContain("Total Viva Panama Dutty Free");
    expect(texto).toContain(ROTULO_TOTAL_GENERAL);
    expect(texto).toContain("$533.48");
  });

  it("⚠️ sin nadie a favor el papel sale como siempre: una sola fila «Total»", async () => {
    const doc = pdfTotalPorCliente(filasTotalPorCliente(SOLO_DEUDA), filasSaldoAFavor(SOLO_DEUDA), OPTS);
    const texto = await textoDelPdf(doc);
    expect(texto).not.toContain("Saldo a favor");
    expect(texto).not.toContain(ROTULO_TOTAL_GENERAL);
    expect(texto).not.toContain(ROTULO_TOTAL_POR_COBRAR);
    expect(texto).toContain("$1,700.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El Excel
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · la hoja lleva su bloque y cierra con el total de la pantalla", () => {
  it("«Total por cliente»: fila de cobro, subtotal, rótulo, los dos a favor y el total general", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), filasSaldoAFavor(CARTERA), "x").Sheets["Cartera"];
    // 3 encabezados · 4 el único que se cobra · 5 «Total por cobrar» · 6 el
    // rótulo del bloque · 7 y 8 los dos a favor.
    expect(celda(ws, "A4")).toBe("D-25");
    expect(celda(ws, "B5")).toBe(ROTULO_TOTAL_POR_COBRAR);
    expect(celda(ws, "F5")).toBe(1700);
    expect(celda(ws, "B6")).toBe(rotuloSaldoAFavor(2));
    expect(celda(ws, "A7")).toBe("D-139");
    expect(celda(ws, "A8")).toBe("TCKCTA");
  });

  it("🔴 el Total general es NÚMERO, con su formato, y vale lo de la pantalla", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), filasSaldoAFavor(CARTERA), "x").Sheets["Cartera"];
    // La fila de totales va después de un espaciador (la deja `buildReportSheet`).
    const filaTotal = Object.keys(ws)
      .filter((k) => /^B\d+$/.test(k))
      .find((k) => ws[k]?.v === ROTULO_TOTAL_GENERAL);
    expect(filaTotal, "no está la fila «Total general»").toBeDefined();
    const n = filaTotal!.replace("B", "");
    expect(ws[`F${n}`]?.t).toBe("n");
    expect(ws[`F${n}`]?.v).toBeCloseTo(533.48, 2);
    expect(ws[`F${n}`]?.z).toBe("$#,##0.00");
  });

  it("«Detallado por compañía»: el bloque cae en su columna y el total cuadra", () => {
    const ws = libroPorCompania(bloquesPorCompania(CARTERA, DOS), bloquesSaldoAFavor(CARTERA, DOS), "x")
      .Sheets["Cartera por compañía"];
    expect(celda(ws, "C6")).toBe(ROTULO_TOTAL_POR_COBRAR);
    expect(celda(ws, "C7")).toBe(rotuloSaldoAFavor(2));
    expect(celda(ws, "A8")).toBe("D-139");
    const filaTotal = Object.keys(ws)
      .filter((k) => /^C\d+$/.test(k))
      .find((k) => ws[k]?.v === ROTULO_TOTAL_GENERAL);
    expect(filaTotal).toBeDefined();
    expect(ws[`G${filaTotal!.replace("C", "")}`]?.v).toBeCloseTo(533.48, 2);
  });

  it("⚠️ sin nadie a favor la hoja sale como siempre", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(SOLO_DEUDA), filasSaldoAFavor(SOLO_DEUDA), "x").Sheets["Cartera"];
    expect(ws["!autofilter"]).toEqual({ ref: "A3:F4" });
    const textos = Object.values(ws).map((c) => (c as { v?: unknown })?.v).filter((v) => typeof v === "string");
    expect(textos).toContain("Total");
    expect(textos).not.toContain(ROTULO_TOTAL_GENERAL);
    expect(textos.some((t) => String(t).startsWith("Saldo a favor"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · La pantalla se lo pasa de verdad, y el cobro no cambió
// ─────────────────────────────────────────────────────────────────────────────

describe("🔑 4 · la pantalla le pasa los dos bloques al archivo", () => {
  it("el hook arma los dos y se los da a los cuatro generadores", () => {
    const hook = plano("src/app/cxc/hooks/useDescargasCartera.ts");
    expect(hook).toContain("filasSaldoAFavor(filtered)");
    expect(hook).toContain("bloquesSaldoAFavor(filtered, companias)");
    expect(hook).toContain("pdfTotalPorCliente(filas, aFavor,");
    expect(hook).toContain("libroTotalPorCliente(filas, aFavor, titulo)");
    expect(hook).toContain("pdfPorCompania(bloques, bloquesAFavor,");
    expect(hook).toContain("libroPorCompania(bloques, bloquesAFavor, titulo)");
  });

  it("⚠️ al saldo a favor SIGUE sin cobrársele: la regla no se tocó", () => {
    expect(seLeCobra(1200)).toBe(true);
    expect(seLeCobra(-1147.52)).toBe(false);
    expect(seLeCobra(0)).toBe(false);
    // Y la lista de cobro del archivo sigue siendo solo la de los positivos.
    expect(filasTotalPorCliente(CARTERA).every((f) => f.total > 0)).toBe(true);
  });

  it("⚠️ el mostrador TCKCTA no se retira por serlo: lo decide su saldo", () => {
    expect(plano("src/lib/cxc/descargas.ts")).not.toContain("TCKCTA");
  });
});
