// ─────────────────────────────────────────────────────────────────────────────
// Los DOS bugs de plata de Reclamos, congelados. Los dos salen del sistema
// hacia un proveedor, y los dos le cuestan plata a Fashion Group.
//
// ── BUG 1: el rótulo del ITBMS mentía en el papel ────────────────────────────
//
// El cuadro decía «ITBMS (7%)» y el monto estaba calculado al 7.7%. En $1.000
// el PDF que recibe el proveedor imprimía:  ITBMS (7%)  $77.00
// El proveedor saca 7% de $1.000 = $70 y reclama los $7 de diferencia por cada
// $1.000. 🔴 EL MONTO ESTÁ BIEN y NO SE TOCA (TASA_ITBMS = 0.077 es decisión de
// negocio, documentada y con test propio en reclamos-tax.test.ts); lo único que
// mentía era el rótulo. Ahora el rótulo se DERIVA de la misma constante que
// hace la cuenta (itbmsLabel → reclamoTaxes().itbmsRate → TASA_ITBMS), así que
// no puede volver a separarse del monto.
//
// Eran CINCO lugares, no tres: ReclamoDetail, ReclamoForm, el PDF por
// proveedor, el Excel por reclamo y el encabezado del CSV global.
//
// ── BUG 2: los botones de bajar traían los reclamos YA PAGADOS ───────────────
//
// En la pantalla de empresas la tarjeta muestra solo lo PENDIENTE, pero ↓Excel
// y ↓PDF bajaban TODOS los reclamos de la empresa: reclamos que el proveedor YA
// PAGÓ. Mandárselo es cobrarle dos veces.
//
// Medido contra producción (24-ago-2026, solo lectura, `deleted = false` como
// la propia pantalla): 33 reclamos vivos, 5 ya Pagados colándose, $5,306.62 de
// doble cobro. Fashion Shoes era el peor: la tarjeta decía "$2,245.19
// pendiente" (1 reclamo) y el archivo bajaba 5 por $6,128.11 — 2,7 veces la
// tarjeta, con $3,882.92 que ya estaban cobrados.
//
// ── POR QUÉ ESTE ARCHIVO NO ES UN BARRIDO DE TEXTO ──────────────────────────
//
// Un grep no ve un rótulo mal impreso. Acá se GENERA el PDF de verdad y se lee
// con `pdftotext`, se ARMA el Excel de verdad y se leen sus celdas, y se PINTA
// la pantalla de verdad y se hace clic en los botones para mirar qué ids salen
// en el cuerpo del POST. Lo único estático es el encabezado del CSV, y ese
// barrido BORRA LOS COMENTARIOS PRIMERO: este repo ya pagó cuatro veces el
// candado que se cumple con su propia explicación.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import XLSX from "xlsx-js-style";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// excel-bulk/excel-reclamo importan supabase-server (crea el cliente al cargar).
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: {
    storage: { from: () => ({ createSignedUrls: async (p: string[]) => ({ data: p.map((x) => ({ path: x, signedUrl: `https://s/${x}` })), error: null }), createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
}));

import { pctLabel, itbmsLabel, impLabel, reclamoTaxes, TASA_ITBMS } from "@/lib/reclamos/tax";
import { esPendiente, soloPendientes, ESTADO_PAGADO } from "@/lib/reclamos/pendientes";
import { buildBulkReclamosPdf } from "@/lib/reclamos/pdf-bulk";
import { buildReclamoSheet } from "@/lib/excel-reclamo";
import EmpresaSelector from "@/app/reclamos/components/EmpresaSelector";

beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos"; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Un reclamo de $1.000 exactos: el ejemplo del bug (ITBMS = $77.00). */
const RECLAMO_MIL = {
  id: "aaaaaaaa-1111-2222-3333-444444444444",
  nro_reclamo: "R-MIL",
  empresa: "Fashion Wear",
  proveedor: "American Fashion Wear",
  marca: "Tommy Hilfiger",
  nro_factura: "F-1000",
  nro_orden_compra: "OC-1",
  fecha_reclamo: "2026-08-01",
  estado: "Creado",
  notas: "",
  reclamo_items: [{ referencia: "REF-A", descripcion: "Camisa", talla: "M", genero: "Men", cantidad: 10, precio_unitario: 100, motivo: "Faltante" }],
  reclamo_fotos: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// BUG 1 — el rótulo dice la tasa REAL, derivada de la constante
// ═══════════════════════════════════════════════════════════════════════════

describe("BUG 1 · el rótulo del ITBMS sale de la MISMA constante que el monto", () => {
  it("pctLabel: redondo sin decimales, 7.7 con el decimal", () => {
    expect(pctLabel(0.077)).toBe("7.7%");
    expect(pctLabel(0.10)).toBe("10%");
    expect(pctLabel(0.15)).toBe("15%");
    expect(pctLabel(0.07)).toBe("7%");
    expect(pctLabel(0)).toBe("0%");
  });

  it("itbmsLabel/impLabel se derivan de reclamoTaxes, no de un texto a mano", () => {
    expect(itbmsLabel("Fashion Wear")).toBe("7.7%");
    expect(itbmsLabel("Fashion Wear")).toBe(pctLabel(reclamoTaxes("Fashion Wear", 0).itbmsRate));
    expect(itbmsLabel("Fashion Wear")).toBe(pctLabel(TASA_ITBMS));
    expect(impLabel("Fashion Wear")).toBe("10%");
    expect(impLabel("Active Shoes")).toBe("15%");
  });

  it("🩸 el rótulo NUNCA puede decir 7% mientras la cuenta use 7.7%", () => {
    // Este es el bug entero en una línea: el número del rótulo, leído como
    // porcentaje, tiene que reproducir el monto que se imprime al lado.
    const tx = reclamoTaxes("Fashion Wear", 1000);
    const delRotulo = 1000 * (parseFloat(itbmsLabel("Fashion Wear")) / 100);
    expect(tx.itbms).toBeCloseTo(77, 6);
    expect(delRotulo).toBeCloseTo(tx.itbms, 6);
  });

  it("el MONTO no se movió: $1.000 → imp $100 + ITBMS $77.00 = $1,177.00", () => {
    const tx = reclamoTaxes("Fashion Wear", 1000);
    expect(tx.importacion).toBeCloseTo(100, 6);
    expect(tx.itbms).toBeCloseTo(77, 6);
    expect(tx.total).toBeCloseTo(1177, 6);
  });
});

describe("BUG 1 · EL PAPEL: el PDF que recibe el proveedor, generado y leído", () => {
  it("dice «ITBMS 7.7%» junto a los $77.00 — y ya no dice «ITBMS 7%»", async () => {
    const doc = await buildBulkReclamosPdf([RECLAMO_MIL as never], "Fashion Wear");
    const dir = mkdtempSync(path.join(tmpdir(), "reclamos-pdf-"));
    const pdfPath = path.join(dir, "reclamo.pdf");
    writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));

    // pdftotext -layout: el texto tal cual se ve en la hoja, no el orden interno.
    execFileSync("pdftotext", ["-layout", pdfPath, path.join(dir, "reclamo.txt")]);
    const texto = readFileSync(path.join(dir, "reclamo.txt"), "utf8");

    // Lo que el proveedor lee, palabra por palabra (los cuadros van en versal).
    expect(texto).toContain("ITBMS 7.7%");
    expect(texto).toContain("$77.00");
    expect(texto).toContain("IMPORTACIÓN 10%");
    expect(texto).toContain("$1,177.00");

    // 🔴 el rótulo viejo NO puede sobrevivir en ninguna parte del papel.
    expect(texto).not.toMatch(/ITBMS\s*\(?7%/i);

    // Y el rótulo tiene que quedar SOBRE su propio monto: los cuadros ponen el
    // título en un renglón y la plata en el de abajo, así que un "7.7%" que
    // caiga encima de OTRA columna vuelve a mentir igual. Se compara la
    // posición de la columna en el texto con -layout (mismo cuadro = misma x).
    const lineas = texto.split("\n");
    const iRotulo = lineas.findIndex((l) => l.includes("ITBMS 7.7%"));
    expect(iRotulo).toBeGreaterThan(-1);
    const iMonto = lineas.findIndex((l, i) => i > iRotulo && l.includes("$77.00"));
    expect(iMonto).toBeGreaterThan(-1);
    const xRotulo = lineas[iRotulo].indexOf("ITBMS 7.7%");
    const xMonto = lineas[iMonto].indexOf("$77.00");
    expect(Math.abs(xRotulo - xMonto)).toBeLessThanOrEqual(12);
  });

  it("Active Shoes: sin cuadro de ITBMS y con importación 15%", async () => {
    const doc = await buildBulkReclamosPdf([{ ...RECLAMO_MIL, empresa: "Active Shoes", nro_reclamo: "R-AS" } as never], "Active Shoes");
    const dir = mkdtempSync(path.join(tmpdir(), "reclamos-pdf-as-"));
    const pdfPath = path.join(dir, "as.pdf");
    writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
    execFileSync("pdftotext", ["-layout", pdfPath, path.join(dir, "as.txt")]);
    const texto = readFileSync(path.join(dir, "as.txt"), "utf8");
    expect(texto).toContain("IMPORTACIÓN 15%");
    expect(texto).not.toMatch(/ITBMS/i);
    expect(texto).toContain("$1,150.00");
  });
});

describe("BUG 1 · EL EXCEL por reclamo, armado y leído celda por celda", () => {
  function celdas(empresa: string, subtotal: number) {
    const wb = XLSX.utils.book_new();
    const ws = buildReclamoSheet(
      { ...RECLAMO_MIL, empresa },
      [{ referencia: "REF-A", descripcion: "Camisa", talla: "M", genero: "Men", cantidad: subtotal / 100, precio_unitario: 100, motivo: "Faltante" }],
      [],
    );
    XLSX.utils.book_append_sheet(wb, ws, "R");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const leido = XLSX.read(buf, { type: "buffer", cellStyles: true });
    return leido.Sheets["R"];
  }

  it("la etiqueta dice «ITBMS (7.7%):» y la celda de al lado vale 77", () => {
    const ws = celdas("Fashion Wear", 1000);
    const todas = Object.keys(ws).filter((k) => !k.startsWith("!"));
    const etiqueta = todas.find((k) => typeof ws[k].v === "string" && String(ws[k].v).includes("ITBMS"));
    expect(etiqueta).toBeDefined();
    expect(String(ws[etiqueta!].v)).toBe("ITBMS (7.7%):");

    // El valor vive en la columna de al lado (labels col 6, valores col 7).
    const { r, c } = XLSX.utils.decode_cell(etiqueta!);
    const valor = ws[XLSX.utils.encode_cell({ r, c: c + 1 })];
    expect(valor.t).toBe("n");
    expect(valor.v).toBeCloseTo(77, 6);

    // Ninguna celda del Excel puede seguir diciendo el 7% viejo.
    for (const k of todas) {
      if (typeof ws[k].v === "string") expect(String(ws[k].v)).not.toMatch(/ITBMS\s*\(?7%/);
    }
  });
});

describe("BUG 1 · NINGÚN archivo de Reclamos escribe el porcentaje a mano", () => {
  // Las dos pantallas (ReclamoDetail y ReclamoForm) no imprimen papel, pero el
  // mismo rótulo se ve ahí y era una de las cinco copias. Este barrido cubre
  // TODO el módulo de una vez, y BORRA LOS COMENTARIOS PRIMERO: el comentario
  // de arriba de este archivo dice «ITBMS (7%)» textual, y sin borrarlo el
  // candado se cumpliría con su propia explicación. Cuarta vez que este repo
  // paga lo mismo — ver el revalidateOnFocus de Reclamos en CLAUDE.md.
  const ARCHIVOS = [
    "src/app/reclamos/components/ReclamoDetail.tsx",
    "src/app/reclamos/components/ReclamoForm.tsx",
    "src/app/reclamos/components/constants.ts",
    "src/lib/reclamos/pdf-bulk.ts",
    "src/lib/reclamos/excel-bulk.ts",
    "src/lib/excel-reclamo.ts",
    "src/app/api/reclamos/export/route.ts",
  ];
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it.each(ARCHIVOS)("%s: si dice ITBMS con un %%, es porque lo derivó", (rel) => {
    const codigo = sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));
    let i = codigo.indexOf("ITBMS");
    while (i !== -1) {
      const trozo = codigo.slice(i, i + 40);
      const conNumero = /\d+(\.\d+)?\s*%/.test(trozo);
      if (conNumero) {
        // Un porcentaje pegado a "ITBMS" solo vale si salió de itbmsLabel().
        expect(trozo).toContain("itbmsLabel");
      }
      i = codigo.indexOf("ITBMS", i + 1);
    }
  });

  it("las dos pantallas piden el rótulo a itbmsLabel, no a un texto", () => {
    for (const rel of ["src/app/reclamos/components/ReclamoDetail.tsx", "src/app/reclamos/components/ReclamoForm.tsx"]) {
      const codigo = sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));
      expect(codigo).toMatch(/ITBMS \(\{itbmsLabel\(/);
    }
  });
});

describe("BUG 1 · el CSV global no promete un porcentaje que cambia por fila", () => {
  it("el encabezado dice «Importación» y «ITBMS», sin porcentaje (código sin comentarios)", () => {
    // Barrido estático con los COMENTARIOS BORRADOS PRIMERO: el comentario que
    // explica este candado contiene las mismas palabras que busca, y sin esto
    // el candado se daría por satisfecho con su propia explicación.
    const crudo = readFileSync(path.join(process.cwd(), "src/app/api/reclamos/export/route.ts"), "utf8");
    const codigo = crudo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(codigo).toContain('"Importación", "ITBMS"');
    expect(codigo).not.toContain("ITBMS (7%)");
    expect(codigo).not.toContain("Importación (10%)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 2 — bajar trae SOLO lo pendiente
// ═══════════════════════════════════════════════════════════════════════════

describe("BUG 2 · la regla de «pendiente» vive en un solo lugar", () => {
  it("esPendiente / soloPendientes", () => {
    expect(ESTADO_PAGADO).toBe("Pagado");
    expect(esPendiente({ estado: "Creado" })).toBe(true);
    expect(esPendiente({ estado: "En proceso" })).toBe(true);
    expect(esPendiente({ estado: "Pagado" })).toBe(false);
    expect(soloPendientes([{ estado: "Creado" }, { estado: "Pagado" }, { estado: "En proceso" }])).toHaveLength(2);
  });
});

describe("BUG 2 · LA PANTALLA: se hace clic en ↓Excel y ↓PDF y se mira el POST", () => {
  // Réplica del peor caso medido en producción (Fashion Shoes: 4 ya pagados
  // arrastrándose detrás de lo pendiente). La tarjeta dice el total de los
  // pendientes; el archivo tiene que traer esos y nada más.
  const mk = (n: string, estado: string, precio: number) => ({
    id: `id-${n}`, nro_reclamo: n, empresa: "Fashion Shoes", proveedor: "P", marca: "M",
    nro_factura: `F-${n}`, nro_orden_compra: "OC", fecha_reclamo: "2026-08-01", estado, notas: "",
    reclamo_items: [{ cantidad: 1, precio_unitario: precio }], reclamo_fotos: [],
  });
  const RECS = [
    mk("R-1", "Creado", 100), mk("R-2", "En proceso", 200), mk("R-3", "Creado", 300),
    mk("R-P1", "Pagado", 1000), mk("R-P2", "Pagado", 2000), mk("R-P3", "Pagado", 3000), mk("R-P4", "Pagado", 4000),
  ];

  function pintar() {
    const fetchSpy = vi.fn(async () => ({
      ok: true, blob: async () => new Blob(["x"]), json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => {};
    // El <a>.click() de la descarga no hace nada útil en jsdom; se neutraliza.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <EmpresaSelector
        role="admin" reclamos={RECS as never} loading={false} contactos={[]}
        globalSearch="" setGlobalSearch={() => {}}
        expandedHistorial={{}} setExpandedHistorial={() => {}}
        totalPendiente={0} pendientes={[] as never} alertas={0}
        onNewReclamo={() => {}} onSelectEmpresa={() => {}} onLoadDetail={() => {}}
      />,
    );
    return fetchSpy as unknown as ReturnType<typeof vi.fn>;
  }

  /** Los botones de la tarjeta de Fashion Shoes (hay una tarjeta por empresa). */
  function botonesDeFashionShoes() {
    // La tarjeta de la empresa, subiendo desde su propio nombre.
    const tarjeta = screen.getByText("Fashion Shoes").closest("div.rounded-lg")!;
    const btns = Array.from(tarjeta.querySelectorAll("button"));
    return {
      excel: btns.find((b) => b.textContent?.includes("Excel"))!,
      pdf: btns.find((b) => b.textContent?.includes("PDF"))!,
    };
  }

  it("↓Excel manda SOLO los 3 pendientes — los 4 Pagados no viajan", async () => {
    const f = pintar();
    fireEvent.click(botonesDeFashionShoes().excel);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/export-zip");
    const ids = JSON.parse(String(init.body)).reclamo_ids as string[];
    expect(ids.sort()).toEqual(["id-R-1", "id-R-2", "id-R-3"]);
    expect(ids).not.toContain("id-R-P1");
    expect(ids).toHaveLength(3);
  });

  it("↓PDF manda SOLO los 3 pendientes — el mismo criterio que el Excel", async () => {
    const f = pintar();
    fireEvent.click(botonesDeFashionShoes().pdf);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/export-pdf");
    const ids = JSON.parse(String(init.body)).reclamo_ids as string[];
    expect(ids.sort()).toEqual(["id-R-1", "id-R-2", "id-R-3"]);
    expect(ids).toHaveLength(3);
  });

  it("🩸 el archivo CUADRA con la tarjeta: mismo conjunto, mismo total", async () => {
    // Esta es la promesa que el bug rompía. La tarjeta dice "$X pendiente";
    // el archivo tiene que sumar exactamente eso, ni un centavo más.
    const f = pintar();
    const totalTarjeta = soloPendientes(RECS).reduce(
      (s, r) => s + reclamoTaxes(r.empresa, r.reclamo_items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0)).total, 0);
    expect(screen.getAllByText(`$${totalTarjeta.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).length).toBeGreaterThan(0);

    fireEvent.click(botonesDeFashionShoes().excel);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const ids = JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body)).reclamo_ids as string[];
    const totalArchivo = RECS.filter((r) => ids.includes(r.id)).reduce(
      (s, r) => s + reclamoTaxes(r.empresa, r.reclamo_items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0)).total, 0);
    expect(totalArchivo).toBeCloseTo(totalTarjeta, 6);
  });

  it("el nombre del archivo DICE que trae solo lo pendiente", async () => {
    const f = pintar();
    const bajado: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, "download");
    Object.defineProperty(HTMLAnchorElement.prototype, "download", {
      configurable: true, set(v: string) { bajado.push(v); }, get() { return bajado[bajado.length - 1]; },
    });
    try {
      fireEvent.click(botonesDeFashionShoes().excel);
      await waitFor(() => expect(bajado.length).toBeGreaterThan(0));
      expect(bajado[0]).toContain("Reclamos-pendientes-Fashion Shoes");
      expect(bajado[0]).toMatch(/\.xlsx$/);
    } finally {
      if (desc) Object.defineProperty(HTMLAnchorElement.prototype, "download", desc);
      else delete (HTMLAnchorElement.prototype as unknown as Record<string, unknown>).download;
    }
    expect(f).toHaveBeenCalled();
  });

  it("empresa sin nada pendiente: no baja un archivo vacío, lo DICE", async () => {
    const f = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]), json: async () => ({}) })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", f);
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <EmpresaSelector
        role="admin" reclamos={[mk("R-P9", "Pagado", 500)] as never} loading={false} contactos={[]}
        globalSearch="" setGlobalSearch={() => {}} expandedHistorial={{}} setExpandedHistorial={() => {}}
        totalPendiente={0} pendientes={[] as never} alertas={0}
        onNewReclamo={() => {}} onSelectEmpresa={() => {}} onLoadDetail={() => {}}
      />,
    );
    fireEvent.click(botonesDeFashionShoes().excel);
    await screen.findByText("Fashion Shoes no tiene reclamos pendientes");
    expect(f).not.toHaveBeenCalled();
  });
});
