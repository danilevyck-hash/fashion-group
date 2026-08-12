// ============================================================================
// I11 — Homogeneización de exports Excel: familia Marketing.
// Valida que los 4 constructores (zip-export resumen_gastos, generar-zip
// respaldo, inventario global, reportes) producen workbooks legibles
// (XLSX.write → XLSX.read) con las mismas hojas/columnas, links intactos,
// moneda numérica y paleta de la casa (navy 1B3A5C + Calibri).
// ============================================================================
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // Los módulos importan supabase-server/gallery-token al cargar; stubs mínimos.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: false }));
vi.mock("sharp", () => ({ default: () => ({}) }));

import XLSX from "xlsx-js-style";
import { CASA_PALETTE } from "@/lib/excel-export";
import { buildResumenGastosWorkbook } from "@/lib/marketing/zip-export";
import { buildRespaldoWorkbook, type FacturaConMarcas } from "@/lib/marketing/generar-zip";
import { exportarExcelGlobal } from "@/lib/marketing/inventario-excel";
import { exportarExcelReporte } from "@/lib/marketing/reportes";
import type {
  EntregaConItems,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
} from "@/lib/marketing/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundTrip(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return XLSX.read(buf, { type: "array" });
}

interface CellLike {
  v?: unknown;
  t?: string;
  l?: { Target?: string };
  s?: { fill?: { fgColor?: { rgb?: string } }; font?: { name?: string; color?: { rgb?: string } } };
}

function cell(ws: XLSX.WorkSheet, addr: string): CellLike {
  return (ws as Record<string, CellLike>)[addr] ?? {};
}

/** Busca en la hoja alguna celda con hyperlink cuyo Target sea `target`. */
function tieneLink(ws: XLSX.WorkSheet, target: string): boolean {
  return Object.keys(ws)
    .filter((k) => !k.startsWith("!"))
    .some((k) => cell(ws, k).l?.Target === target);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const marca = {
  id: "m1",
  nombre: "Tommy Hilfiger",
  codigo: "TH",
  empresa_codigo: "fashion_wear",
  tipo: "externa",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
} as MkMarca;

const proyecto = {
  id: "pr1",
  nombre: "Remodelación",
  tienda: "Tienda Centro",
  tienda_codigo: "D-101",
  fecha_inicio: "2026-04-01",
  estado: "abierto",
  fecha_enviado: "2026-04-15T00:00:00Z",
  created_at: "2026-04-01T00:00:00Z",
} as unknown as MkProyecto;

// ── zip-export: resumen_gastos.xlsx ──────────────────────────────────────────

describe("buildResumenGastosWorkbook (zip-export)", () => {
  const clientes = [
    {
      nombre: "Cliente Uno",
      codigo: "D-101",
      marcas: "TH",
      gastos: [
        {
          fecha: "2026-04-01",
          periodo: "1–15 abr 2026",
          concepto: "Letrero",
          proveedor: "Prov SA",
          marca: "Tommy Hilfiger",
          numero: "F-001",
          subtotal: 93.46,
          partes: [{ codigo: "TH", monto: 93.46 }],
          total: 100,
          signed: "https://example.com/f1.pdf",
        },
        {
          fecha: "2026-04-02",
          concepto: "Entrega de muebles",
          proveedor: "Mobiliario",
          marca: "Tommy Hilfiger 100%",
          numero: "ME-ABCD1234",
          subtotal: 50,
          partes: [{ codigo: "TH", monto: 50 }],
          total: 50,
          signed: "https://example.com/entrega.pdf",
          etiquetaLink: "Ver comprobante",
        },
      ],
      fotos: [{ archivo: "foto1.jpg", signed: "https://example.com/foto1.jpg" }],
    },
    {
      nombre: "Sin cliente",
      codigo: null,
      marcas: "—",
      gastos: [],
      fotos: [{ archivo: "foto2.jpg", signed: "https://example.com/foto2.jpg" }],
    },
  ];

  it("conserva estructura de hojas: Resumen + 1 pestaña por cliente", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    // SIN hoja "Cómo leer esto": el Excel son números y nada más. El documento
    // que Daniel pedía era el comprobante de mobiliario, no una hoja de ayuda.
    expect(wb.SheetNames).toEqual(["Resumen", "Cliente Uno", "Sin cliente"]);
  });

  it("Resumen: mismas columnas, moneda numérica y fila TOTAL", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    const ws = wb.Sheets["Resumen"];
    expect(cell(ws, "A1").v).toBe("Cliente");
    expect(cell(ws, "B1").v).toBe("Marcas");
    // Calvin / Tommy / Otras / Subtotal, y ahí se acaba: NO hay columna "Total"
    // con ITBMS (pedido de Daniel: *"dame subtotal solamente, no total"*).
    expect(cell(ws, "E1").v).toBe("Calvin Klein");
    expect(cell(ws, "F1").v).toBe("Tommy Hilfiger");
    expect(cell(ws, "G1").v).toBe("Subtotal (sin ITBMS)");
    // "Otras marcas" se quitó: daba $0.00 en todas las filas.
    expect(ws["H1"]).toBeUndefined();
    
    // Subtotal de Cliente Uno = 93.46 + 50, numérico (no string "$143.46").
    expect(cell(ws, "G2").t).toBe("n");
    expect(cell(ws, "G2").v).toBe(143.46);
    // Fila TOTAL al pie: suma subtotales, no totales con ITBMS.
    expect(cell(ws, "A4").v).toBe("TOTAL");
    expect(cell(ws, "G4").v).toBe(143.46);
    expect(ws["H4"]).toBeUndefined();
  });

  it("pestaña de cliente: link al PDF de la factura intacto (.l.Target)", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    const ws = wb.Sheets["Cliente Uno"];
    // Layout: r0 GASTOS, r1 "Ver todas las facturas", r2 headers, r3.. gastos.
    expect(cell(ws, "A3").v).toBe("Fecha");
    expect(cell(ws, "B3").v).toBe("Período");
    // Sin la columna "Total", el Subtotal queda en J y el link en K.
    expect(cell(ws, "I3").v).toBe("Subtotal (sin ITBMS)");
    expect(cell(ws, "J3").v).toBe("Comprobante");
    expect(cell(ws, "J4").l?.Target).toBe("https://example.com/f1.pdf");
    expect(cell(ws, "I4").t).toBe("n");
    expect(cell(ws, "I4").v).toBe(93.46);
    // Con código de cliente hay link de galería (1 por cliente), no por foto.
    expect(tieneLink(ws, "https://example.com/foto1.jpg")).toBe(false);
  });

  it("cliente sin código: links individuales por foto", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    expect(tieneLink(wb.Sheets["Sin cliente"], "https://example.com/foto2.jpg")).toBe(true);
  });

  it("estilo de la casa: header navy PRI + Calibri (antes F2F2F2/Arial)", () => {
    const wb = buildResumenGastosWorkbook(clientes); // sin round-trip: estilos crudos
    const a1 = cell(wb.Sheets["Resumen"], "A1");
    expect(a1.s?.fill?.fgColor?.rgb).toBe(CASA_PALETTE.pri);
    expect(a1.s?.font?.name).toBe("Calibri");
    // Link azul 1155CC conservado en la pestaña del cliente.
    const l4 = cell(wb.Sheets["Cliente Uno"], "J4");
    expect(l4.s?.font?.color?.rgb).toBe("1155CC");
  });

  it("columna Período: el rango trabajado sale en el Excel; sin período, '—'", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    const ws = wb.Sheets["Cliente Uno"];
    expect(cell(ws, "B4").v).toBe("1–15 abr 2026");
    expect(cell(ws, "B5").v).toBe("—");
  });

  it("el Subtotal sigue cuadrando con la columna corrida", () => {
    const wb = roundTrip(buildResumenGastosWorkbook(clientes));
    const ws = wb.Sheets["Cliente Uno"];
    // r3/r4 gastos (93.46 + 50), r5 = fila de totales.
    expect(cell(ws, "F6").v).toBe("TOTALES");
    expect(cell(ws, "I6").v).toBe(143.46);
  });
});

// ── generar-zip: respaldo.xlsx ───────────────────────────────────────────────

describe("buildRespaldoWorkbook (generar-zip)", () => {
  const factura = {
    id: "f1",
    proyecto_id: "pr1",
    numero_factura: "F-001",
    fecha_factura: "2026-04-01",
    proveedor: "Prov SA",
    concepto: "Letrero",
    subtotal: 100,
    itbms: 7,
    total: 107,
    anulado_en: null,
    marcas: [{ marca, porcentaje: 100 }],
  } as unknown as FacturaConMarcas;

  it("hoja Facturas: columnas fijas + gasto por marca + moneda numérica", () => {
    const wb = roundTrip(buildRespaldoWorkbook(proyecto, [factura], [marca]));
    expect(wb.SheetNames).toEqual(["Facturas"]);
    const ws = wb.Sheets["Facturas"];
    expect(cell(ws, "A1").v).toBe("Mes ejecución");
    expect(cell(ws, "E1").v).toBe("Monto factura dólares");
    expect(cell(ws, "F1").v).toBe("Gasto Tommy Hilfiger");
    expect(cell(ws, "G1").v).toBe("Comentarios");
    expect(cell(ws, "A2").v).toBe("abril 2026");
    expect(cell(ws, "E2").t).toBe("n");
    expect(cell(ws, "E2").v).toBe(107);
    expect(cell(ws, "F2").v).toBe(107); // 1 marca al 100% = total completo
    expect(cell(ws, "C3").v).toBe("TOTALES");
  });

  it("estilo de la casa: header y TOTALES en banda navy PRI + Calibri (antes 1F1F1F/Arial)", () => {
    const wb = buildRespaldoWorkbook(proyecto, [factura], [marca]);
    const ws = wb.Sheets["Facturas"];
    expect(cell(ws, "A1").s?.fill?.fgColor?.rgb).toBe(CASA_PALETTE.pri);
    expect(cell(ws, "A1").s?.font?.name).toBe("Calibri");
    expect(cell(ws, "C3").s?.fill?.fgColor?.rgb).toBe(CASA_PALETTE.pri); // TOTALES
  });
});

// ── inventario-excel: export global ──────────────────────────────────────────

describe("exportarExcelGlobal (inventario-excel)", () => {
  const producto = {
    id: "p1",
    nombre: "Panel LED",
    precio: 100,
    stock_total: 10,
    created_at: "",
    updated_at: "",
  } as MkInventarioProducto;

  const entrega = {
    id: "e1",
    proyecto_id: "pr1",
    total: 200,
    total_por_marca: { m1: 200 },
    total_por_empresa_interna: {},
    notas: null,
    created_at: "",
    updated_at: "",
    items: [
      {
        id: "i1",
        entrega_id: "e1",
        producto_id: "p1",
        reparto: [{ marca_id: "m1", empresa: "fashion_wear", cantidad: 2 }],
        cantidad_por_marca: { m1: 2 },
        precio_unitario: 100,
        created_at: "",
      },
    ],
  } as unknown as EntregaConItems;

  it("hoja Resumen + hoja por tienda, montos numéricos y fila TOTAL", () => {
    const out = exportarExcelGlobal({
      productos: [producto],
      entregas: [entrega],
      proyectos: [proyecto],
      marcas: [marca],
    });
    const wb = XLSX.read(out, { type: "array" });
    expect(wb.SheetNames).toEqual(["Resumen", "Tienda Centro"]);

    const res = wb.Sheets["Resumen"];
    expect(cell(res, "A1").v).toBe("Cliente");
    expect(cell(res, "C1").v).toBe("$ Tommy Hilfiger");
    expect(cell(res, "C2").t).toBe("n");
    expect(cell(res, "C2").v).toBe(200);
    expect(cell(res, "A3").v).toBe("TOTAL");

    const det = wb.Sheets["Tienda Centro"];
    expect(cell(det, "A1").v).toBe("Producto");
    expect(cell(det, "D2").t).toBe("n");
    expect(cell(det, "D2").v).toBe(200);
  });
});

// ── reportes: exportarExcelReporte (buildReportSheet) ────────────────────────

describe("exportarExcelReporte (reportes)", () => {
  async function readBlob(blob: Blob): Promise<XLSX.WorkBook> {
    return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
  }

  it("por marca: banda de título casa + headers + gasto numérico", async () => {
    const blob = exportarExcelReporte("marca", [
      { marca, gasto: 123.45 },
    ]);
    const wb = await readBlob(blob);
    expect(wb.SheetNames).toEqual(["Por marca"]);
    const ws = wb.Sheets["Por marca"];
    // buildReportSheet: r0 título, r1 separador, r2 headers, r3.. datos.
    expect(String(cell(ws, "A1").v)).toContain("FASHION GROUP");
    expect(cell(ws, "A3").v).toBe("Marca");
    expect(cell(ws, "B3").v).toBe("Código");
    expect(cell(ws, "C3").v).toBe("Gasto");
    expect(cell(ws, "A4").v).toBe("Tommy Hilfiger");
    expect(cell(ws, "C4").t).toBe("n");
    expect(cell(ws, "C4").v).toBe(123.45);
  });

  it("por tienda: columnas dinámicas de marca conservadas", async () => {
    const blob = exportarExcelReporte("tienda", [
      { tienda: "Tienda Centro", porMarca: { "Tommy Hilfiger": 200 }, total: 200 },
    ]);
    const ws = (await readBlob(blob)).Sheets["Por tienda"];
    expect(cell(ws, "A3").v).toBe("Tienda");
    expect(cell(ws, "B3").v).toBe("Tommy Hilfiger");
    expect(cell(ws, "C3").v).toBe("Gasto");
    expect(cell(ws, "B4").t).toBe("n");
    expect(cell(ws, "B4").v).toBe(200);
  });

  it("por proyecto: 5 columnas (sin Estado) y gasto numérico", async () => {
    // La columna "Estado" se retiró el 11-ago-2026 junto con "Cerrar
    // proyecto": sin escritor del estado solo podía decir "Abierto".
    const blob = exportarExcelReporte("proyecto", [
      {
        proyecto: {
          id: "pr1",
          nombre: "Remodelación",
          tienda: "Tienda Centro",
          fecha_inicio: "2026-04-01",
        },
        marcas: [{ nombre: "Tommy Hilfiger" }],
        gastoTotal: 350.5,
      },
    ]);
    const ws = (await readBlob(blob)).Sheets["Por proyecto"];
    expect(cell(ws, "A3").v).toBe("Proyecto");
    expect(cell(ws, "E3").v).toBe("Gasto real");
    expect(cell(ws, "A4").v).toBe("Remodelación");
    expect(cell(ws, "D4").v).toBe("Tommy Hilfiger");
    expect(cell(ws, "E4").t).toBe("n");
    expect(cell(ws, "E4").v).toBe(350.5);
    // Ninguna celda del encabezado dice "Estado".
    for (const col of ["A", "B", "C", "D", "E", "F"]) {
      const c = ws[`${col}3`];
      if (c) expect(c.v).not.toBe("Estado");
    }
  });
});
