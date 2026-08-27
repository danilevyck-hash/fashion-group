// Tests del export Excel de Reclamos tras la homogeneización I11:
// - buildReclamoSheet (ficha por reclamo) — src/lib/excel-reclamo.ts
// - buildBulkReclamosExcel (Resumen + 1 hoja por reclamo) — src/lib/reclamos/excel-bulk.ts
// Round-trip XLSX.write → XLSX.read: hojas, título, hipervínculos (.l.Target)
// y celdas de moneda como NÚMERO real con MONEY_FMT.
import { describe, it, expect, beforeAll, vi } from "vitest";
import XLSX from "xlsx-js-style";
import { MONEY_FMT } from "@/lib/excel-export";

// El módulo excel-bulk importa supabase-server (crea el cliente al cargar) —
// se mockea para no requerir env de Supabase. createSignedUrls firma "en seco"
// para que adjuntarFacturaUrls produzca factura_pdf_url determinística.
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })),
          error: null,
        }),
      }),
    },
  },
}));

import { buildReclamoSheet } from "@/lib/excel-reclamo";
import { buildBulkReclamosExcel } from "@/lib/reclamos/excel-bulk";

beforeAll(() => {
  // reclamoGaleriaUrl (link "Ver fotos") firma con HMAC — lee el secret al llamar.
  process.env.SESSION_SECRET = "test-secret-excel";
});

const items = [
  { referencia: "REF-1", descripcion: "Zapato deportivo", talla: "42", genero: "Hombre", cantidad: 2, precio_unitario: 10.5, motivo: "Dañado" },
  { referencia: "REF-2", descripcion: "Camisa", talla: "M", genero: "Dama", cantidad: 1, precio_unitario: 5, motivo: "Faltante" },
];
const fotos = [{ storage_path: "reclamos/r1/foto1.jpg" }];

const rec1 = {
  id: "11111111-2222-3333-4444-555555555555",
  nro_reclamo: "R-001",
  empresa: "Fashion Wear",
  proveedor: "Proveedor X",
  nro_factura: "F-100",
  nro_orden_compra: "OC-9",
  fecha_reclamo: "2026-06-01",
  estado: "Creado",
  factura_pdf_path: "r1/factura.pdf",
  reclamo_items: items,
  reclamo_fotos: fotos,
};

const rec2 = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nro_reclamo: "R-002",
  empresa: "Active Shoes",
  proveedor: "Proveedor Y",
  nro_factura: "F-200",
  fecha_reclamo: "2026-06-15",
  estado: "En proceso",
  reclamo_items: [{ referencia: "REF-3", descripcion: "Tenis", cantidad: 3, precio_unitario: 8, motivo: "Cambio" }],
  reclamo_fotos: [],
};

/** Targets de todos los hipervínculos (.l.Target) de una hoja. */
function linkTargets(ws: XLSX.WorkSheet): string[] {
  return Object.keys(ws)
    .filter((k) => !k.startsWith("!") && (ws[k] as { l?: { Target: string } }).l)
    .map((k) => (ws[k] as { l: { Target: string } }).l.Target);
}

function roundTrip(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return XLSX.read(buf, { type: "buffer", cellNF: true });
}

describe("buildReclamoSheet (ficha por reclamo)", () => {
  it("round-trip: título, hipervínculos y moneda numérica", () => {
    const ws = buildReclamoSheet(
      { ...rec1, factura_pdf_url: "https://signed.example/r1/factura.pdf" },
      items as unknown as Record<string, unknown>[],
      fotos,
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "R-001");
    const rt = roundTrip(wb);

    expect(rt.SheetNames).toEqual(["R-001"]);
    const sheet = rt.Sheets["R-001"];

    // Bandas de título/subtítulo
    expect(sheet.A1?.v).toBe("FASHION GROUP");
    expect(sheet.A2?.v).toBe("Reclamo a Proveedor");

    // Hipervínculos web: factura firmada + galería de fotos
    const targets = linkTargets(sheet);
    expect(targets).toContain("https://signed.example/r1/factura.pdf");
    expect(targets.some((t) => t.includes("/reclamos/galeria/"))).toBe(true);

    // Item 1 en fila 11 (título+sub+sep+5 meta+sep+header). Precio col F: número
    // real con MONEY_FMT; subtotal col G = 2 × 10.50.
    expect(sheet.F11?.t).toBe("n");
    expect(sheet.F11?.v).toBe(10.5);
    expect(sheet.F11?.z).toBe(MONEY_FMT);
    expect(sheet.G11?.v).toBe(21);
  });
});

describe("buildBulkReclamosExcel (Resumen + hojas por reclamo)", () => {
  it("round-trip con 2 reclamos: hoja Resumen + una por reclamo", async () => {
    const buf = await buildBulkReclamosExcel(
      [rec1, rec2] as unknown as Parameters<typeof buildBulkReclamosExcel>[0],
      "Fashion Wear",
      null,
    );
    const rt = XLSX.read(buf, { type: "buffer", cellNF: true });

    expect(rt.SheetNames).toEqual(["Resumen", "R-001", "R-002"]);
    const resumen = rt.Sheets["Resumen"];

    // Encabezados en la fila 1: nada arriba de ellos.
    expect(resumen.A1?.v).toBe("N° Reclamo");
    expect(resumen.K1?.v).toBe("Fotos");

    // Fila de datos del rec1 (fila 2): subtotal 2×10.50 + 1×5 = 26, número real
    expect(resumen.A2?.v).toBe("R-001");
    expect(resumen.E2?.t).toBe("n");
    expect(resumen.E2?.v).toBe(26);
    expect(resumen.E2?.z).toBe(MONEY_FMT);

    // Hipervínculos del Resumen: factura firmada (col J) + galería (col K)
    const targets = linkTargets(resumen);
    expect(targets).toContain("https://signed.example/r1/factura.pdf");
    expect(targets.some((t) => t.includes(`/reclamos/galeria/${rec1.id}`))).toBe(true);

    // rec2 sin factura ni fotos → "—" en ambas columnas de links
    expect(resumen.J3?.v).toBe("—");
    expect(resumen.K3?.v).toBe("—");
  });

  it("con 1 solo reclamo no genera hoja Resumen", async () => {
    const buf = await buildBulkReclamosExcel(
      [rec2] as unknown as Parameters<typeof buildBulkReclamosExcel>[0],
      "Active Shoes",
      null,
    );
    const rt = XLSX.read(buf, { type: "buffer" });
    expect(rt.SheetNames).toEqual(["R-002"]);
  });
});
