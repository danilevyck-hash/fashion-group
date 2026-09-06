// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES — LA FORMA, MONTADA (6-sep-2026). Los cambios que solo se ven
// pintando la pantalla: el detalle ABAJO en vez de encima, el total ARRIBA, los
// que no se pagan detrás de «Ver todos», el guion en la celda vacía y el
// desglose del descuento.
//
// Ninguno mueve un número: las 27 celdas de 2026 (3 personas × 9 meses) siguen
// dando $67.815,75 — el candado de eso vive en `comisiones-forma.test.ts` y en
// la medición contra producción.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/comisiones",
}));

import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";
import { ComisionesDetalleModal } from "@/components/ventas/ComisionesDetalleModal";

const REYNALDO = "REYNALDO ESPINOSA";

/** Septiembre 2026 medido contra producción: la fila que motivó tres cambios. */
const CONSOLIDADO = {
  empresas: [
    {
      empresa_key: "fashion_shoes",
      vendedores: [
        // bruto $60,00 · descuento $1.573,08 · neto −$1.513,08
        { vendedor: REYNALDO, base: 12000, base_cobro: 0, comision_total: -1513.08, descuento: 1573.08, se_paga: true },
      ],
    },
    {
      empresa_key: "active_shoes",
      // El mismo vendedor, con la celda en CERO: es lo que mezclaba `—` y `$0.00`.
      vendedores: [{ vendedor: REYNALDO, base: 0, base_cobro: 0, comision_total: 0, descuento: 0, se_paga: true }],
    },
    {
      empresa_key: "vistana",
      vendedores: [
        { vendedor: "EDWIN", base: 8000, base_cobro: 0, comision_total: 41.77, descuento: 0, se_paga: true },
        { vendedor: "DEFAULT", base: 1000, base_cobro: 0, comision_total: 8.6, descuento: 0, se_paga: false },
        { vendedor: "DANIEL LEVY", base: 500, base_cobro: 0, comision_total: 4, descuento: 0, se_paga: false },
      ],
    },
  ],
};

const DETALLE = {
  empresa_key: "vistana", year: 2026, mes: 8, vendedor: "EDWIN",
  tasa_venta: 0.005, tasa_cobro: 0.005,
  ventas: [{ fecha: "2026-08-03", cliente: "City Mall", secuencial: "11-000003022", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 }],
  cobros: [{ fecha: "2026-08-20", cliente: "City Mall", monto: 800 }],
  ventas_base: 1000, cobros_base: 800,
  comision_venta: 345.27, comision_cobro: 307.15, comision_total: 652.42,
};

const almacenReal = () => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => { datos.set(k, String(v)); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  } as unknown as Storage;
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacenReal(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "admin");
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    const u = String(url);
    const cuerpo = u.includes("/consolidado")
      ? CONSOLIDADO
      : u.includes("/detalle")
        ? DETALLE
        : u.includes("/descuentos")
          ? { descuentos: [] }
          : {};
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═══ 3 y 14 · La celda: el guion y el desglose ══════════════════════════════

describe("🔴 la celda de la matriz", () => {
  it("dice «—» donde no hay nada, sin mezclar con $0.00", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const tabla = await screen.findByRole("table");
    const fila = within(tabla).getByText("Reynaldo Espinosa").closest("tr")!;
    const celdas = within(fila).getAllByRole("cell").map((c) => c.textContent ?? "");
    // Ni una celda dice $0.00: las cinco que no tienen nada dicen «—».
    expect(celdas.some((c) => c.trim() === "$0.00")).toBe(false);
    expect(celdas.filter((c) => c.trim() === "—").length).toBeGreaterThan(0);
  });

  it("🔴 y donde hay descuento MUESTRA el desglose, sin cambiar el número", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const tabla = await screen.findByRole("table");
    const fila = within(tabla).getByText("Reynaldo Espinosa").closest("tr")!;
    const texto = fila.textContent ?? "";
    // El número que se paga sigue siendo el que mandó el servidor…
    // ⚠️ El menos es TIPOGRÁFICO (−), diccionario § 0.
    expect(texto).toContain("−$1,513.08");
    // …y ahora la celda dice por qué.
    expect(texto).toContain("$60.00 − $1,573.08");
  });
});

// ═══ 20 · Los que no se pagan ═══════════════════════════════════════════════

describe("🔴 los que no se pagan, detrás de «Ver los que no se pagan»", () => {
  it("arrancan escondidos y lo VISIBLE suma exactamente el «Total a pagar»", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByText("Oficina (DEFAULT)")).toBeNull();
    expect(within(tabla).queryByText("Daniel Levy")).toBeNull();

    // Lo que se ve: Reynaldo (−1.513,08) + Edwin (41,77) = −1.471,31, que es
    // exactamente el pie.
    const pie = within(tabla).getByText("Total a pagar").closest("tr")!;
    expect(pie.textContent).toContain("−$1,471.31");

    fireEvent.click(within(tabla).getByRole("button", { name: "Ver los que no se pagan (2)" }));
    expect(within(tabla).getByText("Oficina (DEFAULT)")).toBeTruthy();
    expect(within(tabla).getByText("Daniel Levy")).toBeTruthy();
    // Y el total NO se movió al mostrarlos: se calcula igual que siempre.
    expect(within(tabla).getByText("Total a pagar").closest("tr")!.textContent).toContain("−$1,471.31");
    expect(within(tabla).getByRole("button", { name: "Ver menos" })).toBeTruthy();
  });
});

// ═══ 8 y 7 · El detalle: abajo, y con el total arriba ═══════════════════════

describe("🔴 el detalle se abre ABAJO de la tabla, no encima", () => {
  it("tocar una celda dibuja el detalle inline y resalta la celda tocada", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const tabla = await screen.findByRole("table");
    expect(document.querySelector('[data-comision-detalle="inline"]')).toBeNull();

    const fila = within(tabla).getByText("Edwin").closest("tr")!;
    const celda = within(fila).getAllByRole("cell").find((c) => c.textContent?.includes("$41.77"))!;
    await act(async () => { fireEvent.click(celda); });

    await waitFor(() => expect(document.querySelector('[data-comision-detalle="inline"]')).toBeTruthy());
    // Y NO es un modal: la matriz que estabas mirando sigue a la vista.
    expect(document.querySelector('[data-comision-detalle="modal"]')).toBeNull();
    expect(celda.getAttribute("aria-current")).toBe("true");
  });

  it("🔴 el total va ARRIBA, con sus dos componentes debajo en gris", async () => {
    render(
      <ComisionesDetalleModal
        inline
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={8}
        vendedor="EDWIN"
        onClose={() => {}}
      />,
    );
    const panel = await waitFor(() => document.querySelector('[data-comision-detalle="inline"]') as HTMLElement);
    await waitFor(() => expect(within(panel).getAllByText("$652.42").length).toBeGreaterThan(0));
    // Los dos componentes, medidos: Edwin en Vistana, agosto 2026.
    expect(panel.textContent).toContain("Ventas $345.27 · Cobros $307.15");
    // Y está ARRIBA: aparece antes que la tabla de Ventas.
    const html = panel.innerHTML;
    expect(html.indexOf("$652.42")).toBeLessThan(html.indexOf("TOTAL VENTAS"));
  });

  it("🔴 el modal SE QUEDA — es lo que se imprime — y las dos formas son el MISMO componente", async () => {
    render(
      <ComisionesDetalleModal
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={8}
        vendedor="EDWIN"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('[data-comision-detalle="modal"]')).toBeTruthy());
    // La hoja de impresión existe en las dos formas (va en un portal a <body>).
    await waitFor(() => expect(document.querySelector("[data-cds-print]")).toBeTruthy());
    expect(document.querySelector("#print-document")).toBeTruthy();
  });

  it("🔴 1 · en pantalla la factura va corta; el papel la lleva completa", async () => {
    render(
      <ComisionesDetalleModal
        inline
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={8}
        vendedor="EDWIN"
        onClose={() => {}}
      />,
    );
    const panel = await waitFor(() => document.querySelector('[data-comision-detalle="inline"]') as HTMLElement);
    await within(panel).findByText("3022");
    expect(panel.textContent).not.toContain("11-000003022");
    // El mismo documento, completo, en la hoja que se imprime.
    const papel = document.querySelector("#print-document")!;
    expect(papel.textContent).toContain("11-000003022");
  });

  it("🔴 6 · la columna «Tipo» no está en pantalla, y sí en el papel", async () => {
    render(
      <ComisionesDetalleModal
        inline
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={8}
        vendedor="EDWIN"
        onClose={() => {}}
      />,
    );
    const panel = await waitFor(() => document.querySelector('[data-comision-detalle="inline"]') as HTMLElement);
    await waitFor(() => expect(within(panel).getAllByRole("columnheader").length).toBeGreaterThan(0));
    const encabezados = within(panel).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(encabezados).not.toContain("Tipo");
    expect(encabezados).toContain("Factura");
    expect(document.querySelector("#print-document")!.textContent).toContain("Tipo");
  });

  it("🔴 19 · el botón dice que descarga EL DETALLE", async () => {
    render(
      <ComisionesDetalleModal
        inline
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={8}
        vendedor="EDWIN"
        onClose={() => {}}
      />,
    );
    const panel = await waitFor(() => document.querySelector('[data-comision-detalle="inline"]') as HTMLElement);
    expect(within(panel).getByRole("button", { name: /Descargar el detalle/ })).toBeTruthy();
  });
});

// ═══ 15 · «Todo el año» apaga el detalle, y lo dice ═════════════════════════

describe("🔴 con «Todo el año» la celda no promete un detalle que no existe", () => {
  it("el pie dice qué hacer en vez de ofrecer un botón que no lleva a nada", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={0} />);
    await screen.findByRole("table");
    expect(screen.getByText("Elige un mes para ver el detalle")).toBeTruthy();
    expect(screen.queryByText("Toca para ver el detalle")).toBeNull();
  });

  it("y con un mes elegido vuelve a decir que se toque", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    await screen.findByRole("table");
    expect(screen.getByText("Toca para ver el detalle")).toBeTruthy();
  });
});
