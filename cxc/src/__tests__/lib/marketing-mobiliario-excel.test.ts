// ============================================================================
// Candado del mobiliario en el Excel de gastos + separación de tokens.
//
// 🩸 El problema que arregla el código que esto protege (medido en producción):
// las 21 entregas de mobiliario ($70.725,00) salían con "N° Factura" en blanco y
// la columna del link en "—", porque una entrega de muebles NO tiene factura de
// proveedor y `mk_adjuntos` no tiene `entrega_id` donde colgarle un PDF. Ahora
// el sistema genera un COMPROBANTE de entrega y la fila lo enlaza.
//
// Los dos casos que hay que cubrir, porque el segundo es el que se rompe solo:
//   - mobiliario CON comprobante → número ME-XXXXXXXX + link "Ver comprobante";
//   - mobiliario SIN comprobante (la generación falló) → la fila sigue estando
//     con su monto, no desaparece del Excel ni descuadra el total.
// ============================================================================
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: false }));
vi.mock("sharp", () => ({ default: () => ({}) }));

import XLSX from "xlsx-js-style";
import {
  buildResumenGastosWorkbook,
  type ClienteResumenXlsx,
  type GastoXlsx,
} from "@/lib/marketing/zip-export";
import {
  signEntregaToken,
  verifyEntregaToken,
  signFacturasToken,
  verifyFacturasToken,
  signGalleryToken,
  verifyGalleryToken,
} from "@/lib/marketing/gallery-token";

interface CellLike {
  v?: unknown;
  t?: string;
  l?: { Target?: string };
}
function cell(ws: XLSX.WorkSheet, addr: string): CellLike {
  return (ws as Record<string, CellLike>)[addr] ?? {};
}

const LINK_COMPROBANTE =
  "https://www.fashiongr.com/api/marketing/entregas-pdf/abc?t=xyz";

const facturaNormal: GastoXlsx = {
  fecha: "2026-05-25",
  concepto: "Letrero",
  proveedor: "Impreco",
  marca: "Tommy Hilfiger",
  numero: "0000064327",
  subtotal: 66.6,
  partes: [{ codigo: "TH", monto: 66.6 }],
  total: 71.26,
  signed: "https://example.com/f.pdf",
};

const muebleConComprobante: GastoXlsx = {
  fecha: "2026-06-19",
  concepto: "Entrega de muebles",
  proveedor: "Mobiliario",
  marca: "Calvin Klein 100%",
  numero: "ME-AD3C1932",
  subtotal: 2695,
  partes: [{ codigo: "CK", monto: 2695 }],
  total: 2695,
  signed: LINK_COMPROBANTE,
  etiquetaLink: "Ver comprobante",
};

const muebleSinComprobante: GastoXlsx = {
  ...muebleConComprobante,
  numero: "",
  signed: undefined,
  etiquetaLink: "Ver comprobante",
};

const cliente = (gastos: GastoXlsx[]): ClienteResumenXlsx[] => [
  { nombre: "Hanna Calzados", codigo: "D-71", marcas: "TH, CK", gastos, fotos: [] },
];

describe("mobiliario en la hoja de detalle", () => {
  it("CON comprobante: número ME-XXXX y link 'Ver comprobante'", () => {
    const ws = buildResumenGastosWorkbook(
      cliente([facturaNormal, muebleConComprobante]),
    ).Sheets["Hanna Calzados"];
    // r0 GASTOS, r1 "Ver todas las facturas", r2 headers, r3 factura, r4 mueble.
    expect(cell(ws, "F5").v).toBe("ME-AD3C1932");
    expect(cell(ws, "L5").v).toBe("Ver comprobante");
    expect(cell(ws, "L5").l?.Target).toBe(LINK_COMPROBANTE);
    // La factura de proveedor conserva su propia etiqueta.
    expect(cell(ws, "L4").v).toBe("Ver factura");
  });

  it("el mueble no lleva ITBMS: Subtotal === Total en su fila", () => {
    const ws = buildResumenGastosWorkbook(
      cliente([facturaNormal, muebleConComprobante]),
    ).Sheets["Hanna Calzados"];
    expect(cell(ws, "J5").v).toBe(2695); // Subtotal (sin ITBMS)
    expect(cell(ws, "K5").v).toBe(2695); // Total
    // La factura sí tiene diferencia (ITBMS).
    expect(cell(ws, "J4").v).toBe(66.6);
    expect(cell(ws, "K4").v).toBe(71.26);
  });

  it("SIN comprobante: la fila SIGUE con su monto (no desaparece)", () => {
    const ws = buildResumenGastosWorkbook(
      cliente([facturaNormal, muebleSinComprobante]),
    ).Sheets["Hanna Calzados"];
    expect(cell(ws, "F5").v).toBe("—"); // número vacío se muestra como guion
    expect(cell(ws, "L5").v).toBe("—"); // sin link
    expect(cell(ws, "K5").v).toBe(2695); // el monto sigue ahí
    expect(cell(ws, "F6").v).toBe("TOTALES");
    expect(cell(ws, "K6").v).toBe(2766.26); // 71.26 + 2695
  });

  it("un cliente con SOLO mobiliario igual tiene su hoja y su total", () => {
    const wb = buildResumenGastosWorkbook(cliente([muebleConComprobante]));
    expect(wb.SheetNames).toContain("Hanna Calzados");
    const res = wb.Sheets["Resumen"];
    expect(cell(res, "E2").v).toBe(2695); // Calvin Klein
    expect(cell(res, "H2").v).toBe(2695); // Subtotal
    expect(cell(res, "I2").v).toBe(2695); // Total
  });

  it("'Ver todas las facturas (N)' NO cuenta los comprobantes de mobiliario", () => {
    // El PDF combinado del cliente une adjuntos `pdf_factura`; los comprobantes
    // se generan al vuelo y no están ahí. Contarlos prometería páginas que no trae.
    const ws = buildResumenGastosWorkbook(
      cliente([facturaNormal, muebleConComprobante]),
    ).Sheets["Hanna Calzados"];
    expect(cell(ws, "A2").v).toBe("Ver todas las facturas (1)");
  });

  it("la hoja 'Cómo leer esto' explica por qué el mobiliario no tiene factura", () => {
    const ws = buildResumenGastosWorkbook(cliente([muebleConComprobante])).Sheets[
      "Cómo leer esto"
    ];
    const texto = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String(cell(ws, k).v ?? ""))
      .join(" | ");
    expect(texto).toContain("Entregas de mobiliario");
    expect(texto).toContain("no hay un tercero que nos cobre");
    expect(texto).toContain("comprobante de entrega");
  });
});

describe("tokens: cada scope abre SOLO lo suyo", () => {
  const id = "a1e6b971-2f4c-4a9e-9b71-0c1d2e3f4a5b";

  it("el token de entrega abre esa entrega", () => {
    expect(verifyEntregaToken(id, signEntregaToken(id))).toBe(true);
  });

  it("NO abre otra entrega", () => {
    expect(verifyEntregaToken("otra-entrega", signEntregaToken(id))).toBe(false);
  });

  it("un token de facturas o de galería NO sirve como token de entrega", () => {
    expect(verifyEntregaToken(id, signFacturasToken(id))).toBe(false);
    expect(verifyEntregaToken(id, signGalleryToken(id))).toBe(false);
  });

  it("y al revés: el de entrega no abre el PDF combinado ni la galería", () => {
    expect(verifyFacturasToken(id, signEntregaToken(id))).toBe(false);
    expect(verifyGalleryToken(id, signEntregaToken(id))).toBe(false);
  });

  it("fail-closed: sin token no valida", () => {
    expect(verifyEntregaToken(id, null)).toBe(false);
    expect(verifyEntregaToken(id, "")).toBe(false);
    expect(verifyEntregaToken(id, "basura")).toBe(false);
  });
});
