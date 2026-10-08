// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL ESTADO DE CUENTA SALE DEL GRUPO, Y ES EL QUE SALE POR OMISIÓN (7-oct-2026)
//
// Daniel: Novedades El Dollar le debe a Fashion Wear, Fashion Shoes y Active
// Shoes a la vez. Para Daniel son tres empresas; **para el cliente es una sola
// deuda**. El PDF que se descarga abre con una hoja de GRUPO —el total arriba
// y el desglose por empresa, con los MISMOS tres tramos de la pantalla (0-90 ·
// 91-120 · +120)— antes de las hojas de siempre, una por empresa.
//
// Con una sola empresa, esa hoja NO se dibuja: un «grupo» de un solo renglón
// no se lee natural. Y el nombre del archivo lo dice, con el de la empresa.
//
// 🔑 Candado de CONDUCTA: se arma el PDF real con `buildEstadoCuentaPDF` y se
// lee su texto con pdfjs, igual que `cxc-estado-cuenta-forma-switch.test.ts`.
//
// ⚠️ PROPUESTA, interruptor `ESTADO_CUENTA_UN_BOTON_2026_10` hoy APAGADO: este
// candado prende el interruptor con un mock del módulo, para medir el
// resultado que Daniel todavía no aprobó sin tocar el valor real en
// producción.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cxc/estado-cuenta-un-boton-2026-10", () => ({ ESTADO_CUENTA_UN_BOTON_2026_10: true }));

import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta, EstadoEmpresa, EstadoDocumento } from "@/lib/cxc/estado-cuenta-tipos";

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

function doc(numero: string, dias: number, saldo: number): EstadoDocumento {
  return {
    numero, fecha: "2026-06-16", tipo: "Factura", monto: saldo, saldo,
    dias, debito: saldo, credito: 0, plazoCredito: 90, numeroFiscal: null,
  };
}

function empresa(key: string, nombre: string, documentos: EstadoDocumento[]): EstadoEmpresa {
  const subtotal = documentos.reduce((s, d) => s + d.saldo, 0);
  return { empresa_key: key, empresa_nombre: nombre, documentos, subtotal, saldoSwitch: null };
}

const CLIENTE_GRUPO: EstadoCuenta = {
  codigo: "D-900",
  clienteNombre: "Novedades El Dollar",
  cliente: { nombre: "Novedades El Dollar", identificacion: "", telefono: "", email: "", direccion: "", limiteCredito: null, tiempoMorosidad: null },
  empresas: [
    empresa("fashion_wear", "Fashion Wear", [doc("F-1", 30, 1000)]),
    empresa("fashion_shoes", "Fashion Shoes", [doc("F-2", 95, 500)]),
    empresa("active_shoes", "Active Shoes", [doc("F-3", 130, 250)]),
  ],
  total: 1750,
  generadoEn: "2026-10-07T12:00:00.000Z",
};

const CLIENTE_UNA_EMPRESA: EstadoCuenta = {
  ...CLIENTE_GRUPO,
  codigo: "D-901",
  empresas: [empresa("fashion_wear", "Fashion Wear", [doc("F-9", 30, 1000)])],
  total: 1000,
};

describe("🔴 el estado de cuenta sale del grupo por omisión", () => {
  it("con varias empresas, abre con el total del grupo y el desglose por empresa (0-90 · 91-120 · +120)", async () => {
    const { doc: pdf } = buildEstadoCuentaPDF(CLIENTE_GRUPO, "Novedades El Dollar");
    const texto = await textoDelPdf(pdf);
    expect(texto).toContain("TOTAL GENERAL");
    expect(texto).toContain("1,750.00");
    expect(texto).toContain("DESGLOSE POR EMPRESA (3)");
    expect(texto).toContain("Fashion Wear");
    expect(texto).toContain("Fashion Shoes");
    expect(texto).toContain("Active Shoes");
  });

  it("nada contable cambia: cada hoja por empresa sigue con su propio total", async () => {
    const { doc: pdf } = buildEstadoCuentaPDF(CLIENTE_GRUPO, "Novedades El Dollar");
    const texto = await textoDelPdf(pdf);
    expect(texto).toContain("Total General: 1,000.00");
    expect(texto).toContain("Total General: 500.00");
    expect(texto).toContain("Total General: 250.00");
  });

  it("el nombre del archivo dice el cliente y la fecha legible", () => {
    // 🩸 7-oct-2026: sin reloj fijo esta prueba se puso roja a las 19:00 de
    // Panamá (00:00 UTC, la hora de la máquina de GitHub). Se fija el día.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    try {
      const { filename } = buildEstadoCuentaPDF(CLIENTE_GRUPO, "Novedades El Dollar");
      expect(filename).toBe("Estado de cuenta - Novedades El Dollar - 7 oct 2026.pdf");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("🔴 una sola empresa no se ve como un «grupo» de un renglón", () => {
  it("con una sola empresa NO se dibuja la hoja de grupo", async () => {
    const { doc: pdf } = buildEstadoCuentaPDF(CLIENTE_UNA_EMPRESA, "Novedades El Dollar");
    const texto = await textoDelPdf(pdf);
    expect(texto).not.toContain("DESGLOSE POR EMPRESA");
    expect(texto).not.toContain("TOTAL GENERAL");
  });

  it("el nombre del archivo de una sola empresa lo dice", () => {
    // `unaEmpresaElegida: true` — el caso del selector, cuando se pide el PDF
    // de UNA empresa a propósito. Un cliente que NATURALMENTE debe en una
    // sola (sin elegir nada) sigue con el nombre limpio: ver
    // `cxc-nombre-de-archivo-del-pdf.test.ts`.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    try {
      const { filename } = buildEstadoCuentaPDF(CLIENTE_UNA_EMPRESA, "Novedades El Dollar", { unaEmpresaElegida: true });
      expect(filename).toBe("Estado de cuenta - Novedades El Dollar - Fashion Wear - 7 oct 2026.pdf");
    } finally {
      vi.useRealTimers();
    }
  });
});
