// ============================================================================
// Candado de Multifashion como bucket INDEPENDIENTE del grupo de marcas.
//
// Lo que protege, en las dos direcciones:
//   - que los proyectos de Multifashion se reconozcan por CÓDIGO (D-108) y
//     también por el texto de la tienda, porque "Multifashion Holdings" no tiene
//     código de directorio y sin el respaldo por texto la separación tendría un
//     agujero;
//   - que NO se lleve por delante clientes ajenos (el riesgo del regex).
//
// Y sobre el Excel: que Multifashion salga en su propio bloque, que el TOTAL
// GRUPO la excluya y que el GRAN TOTAL la vuelva a sumar — si el gasto quedara
// fuera de los dos totales, plata real desaparecería del reporte.
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
  esMultifashion,
  MULTIFASHION_BUCKET,
  MULTIFASHION_CODIGOS,
  MULTIFASHION_LABEL,
} from "@/lib/marketing/multifashion";
import {
  buildResumenGastosWorkbook,
  type ClienteResumenXlsx,
} from "@/lib/marketing/zip-export";

function cellv(ws: XLSX.WorkSheet, addr: string): unknown {
  return (ws as Record<string, { v?: unknown }>)[addr]?.v;
}
/** Fila (1-based) cuya columna A vale `texto`. 0 si no está. */
function filaDe(ws: XLSX.WorkSheet, texto: string): number {
  const ref = ws["!ref"] as string;
  const max = XLSX.utils.decode_range(ref).e.r;
  for (let r = 0; r <= max; r++) {
    if (cellv(ws, `A${r + 1}`) === texto) return r + 1;
  }
  return 0;
}

describe("esMultifashion — quién queda fuera del grupo de marcas", () => {
  it("reconoce por código de directorio (la identidad estable)", () => {
    expect(esMultifashion({ tienda_codigo: "D-108", tienda: "Cualquier cosa" })).toBe(true);
    expect(esMultifashion({ tienda_codigo: "d-108", tienda: "x" })).toBe(true);
    expect(esMultifashion({ tienda_codigo: " D-108 ", tienda: "x" })).toBe(true);
    expect(MULTIFASHION_CODIGOS).toContain("D-108");
  });

  it("reconoce por texto de tienda cuando el proyecto NO tiene código", () => {
    // Caso REAL de la base: "Multifashion Holdings" nació sin tienda_codigo.
    expect(esMultifashion({ tienda_codigo: null, tienda: "Multifashion Holdings" })).toBe(true);
    expect(esMultifashion({ tienda_codigo: null, tienda: "Multifashion" })).toBe(true);
    expect(esMultifashion({ tienda_codigo: null, tienda: "Multi Fashion Holding" })).toBe(true);
    expect(esMultifashion({ tienda_codigo: null, tienda: "MULTI-FASHION" })).toBe(true);
  });

  it("NO se lleva clientes ajenos por delante", () => {
    for (const tienda of [
      "City Mall David",
      "Jerusalem Pasocanoa",
      "La Frontera Duty Free",
      "Hanna Calzados",
      "Boutique I - Fashion", // tiene "Fashion" pero no "Multi"
      "Fashion Wear",
      "Multiplaza", // tiene "Multi" pero no "Fashion"
      "",
    ]) {
      expect(esMultifashion({ tienda_codigo: null, tienda })).toBe(false);
    }
    expect(esMultifashion({ tienda_codigo: "D-107", tienda: "Otro" })).toBe(false);
    expect(esMultifashion({ tienda_codigo: "D-1080", tienda: "Otro" })).toBe(false);
  });

  it("el nombre del PROYECTO no cuenta (es 'Remodelacion', no el cliente)", () => {
    expect(
      esMultifashion({ tienda_codigo: null, tienda: "City Mall", nombre: "Multifashion" }),
    ).toBe(false);
  });

  it("el valor del parámetro de URL no puede chocar con 'legacy' ni con un uuid", () => {
    expect(MULTIFASHION_BUCKET).toBe("multifashion");
    expect(MULTIFASHION_BUCKET).not.toBe("legacy");
    expect(/^[0-9a-f-]{36}$/.test(MULTIFASHION_BUCKET)).toBe(false);
  });
});

describe("Excel: Multifashion en bloque aparte", () => {
  const gasto = (
    subtotal: number,
    total: number,
    codigoMarca: string,
  ) => ({
    fecha: "2026-05-07",
    concepto: "Adhesivo",
    proveedor: "Prov SA",
    marca: "x",
    numero: "F-1",
    subtotal,
    partes: [{ codigo: codigoMarca, monto: subtotal }],
    total,
  });

  const clientes: ClienteResumenXlsx[] = [
    {
      nombre: "City Mall David",
      codigo: "D-24",
      marcas: "TH",
      gastos: [gasto(100, 107, "TH")],
      fotos: [],
    },
    {
      nombre: "Multi Fashion Holding",
      codigo: "D-108",
      marcas: "OTR",
      gastos: [gasto(40, 42.8, "OTR")],
      fotos: [],
      esMultifashion: true,
    },
  ];

  it("hay una fila TOTAL GRUPO que EXCLUYE a Multifashion", () => {
    const ws = buildResumenGastosWorkbook(clientes).Sheets["Resumen"];
    const r = filaDe(ws, "TOTAL GRUPO");
    expect(r).toBeGreaterThan(0);
    expect(cellv(ws, `H${r}`)).toBe(100); // Subtotal sin ITBMS, solo el grupo
    expect(cellv(ws, `I${r}`)).toBeUndefined(); // ya no hay columna "Total"
  });

  it("hay un bloque con título propio y su TOTAL MULTIFASHION", () => {
    const ws = buildResumenGastosWorkbook(clientes).Sheets["Resumen"];
    const titulo = filaDe(
      ws,
      `${MULTIFASHION_LABEL} — marca independiente, fuera del grupo`,
    );
    const total = filaDe(ws, `TOTAL ${MULTIFASHION_LABEL.toUpperCase()}`);
    expect(titulo).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(titulo);
    expect(cellv(ws, `H${total}`)).toBe(40);
    expect(cellv(ws, `I${total}`)).toBeUndefined();
    // El título del bloque va DESPUÉS del total del grupo (no arriba de todo).
    expect(titulo).toBeGreaterThan(filaDe(ws, "TOTAL GRUPO"));
  });

  it("el GRAN TOTAL suma grupo + Multifashion: no se pierde ni un centavo", () => {
    const ws = buildResumenGastosWorkbook(clientes).Sheets["Resumen"];
    const r = filaDe(ws, "GRAN TOTAL (grupo + Multifashion)");
    expect(r).toBeGreaterThan(0);
    // El GRAN TOTAL suma SUBTOTALES (100 del grupo + 40 de Multifashion), no
    // totales con ITBMS: la columna "Total" ya no existe.
    expect(cellv(ws, `H${r}`)).toBe(140);
    expect(cellv(ws, `I${r}`)).toBeUndefined();
  });

  it("sin clientes Multifashion la hoja NO cambia de forma (dice TOTAL, sin bloque)", () => {
    const ws = buildResumenGastosWorkbook([clientes[0]]).Sheets["Resumen"];
    expect(filaDe(ws, "TOTAL")).toBeGreaterThan(0);
    expect(filaDe(ws, "TOTAL GRUPO")).toBe(0);
    expect(filaDe(ws, `TOTAL ${MULTIFASHION_LABEL.toUpperCase()}`)).toBe(0);
    expect(filaDe(ws, "GRAN TOTAL (grupo + Multifashion)")).toBe(0);
  });

  it("Multifashion queda al final: su pestaña va después de las del grupo", () => {
    const wb = buildResumenGastosWorkbook(clientes);
    expect(wb.SheetNames.indexOf("Multi Fashion Holding")).toBeGreaterThan(
      wb.SheetNames.indexOf("City Mall David"),
    );
  });
});
