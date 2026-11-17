// Error n.º 19 de los videos (16-nov-2026) — Ventas › Rango de fechas en el celular.
//
// A 390 px la tabla salía más ancha que la pantalla y «Margen» quedaba cortado:
// montos con centavos («$1,298,151.79») en una tabla de ancho automático. En el
// celular va como el Resumen del celular: `table-fixed` con anchos por columna y
// el monto sin centavos (`montoDeLaTabla`). La computadora no cambia.
// (jsdom no mide: se afirma la FORMA que garantiza que cabe.)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/components/ventas/celular/MenuVentasCelular", () => ({ FrescuraVentasCel: () => null }));
import { ResumenRango } from "@/components/ventas/ResumenRango";

const fila = (empresa_key: string, venta: number) =>
  ({ empresa_key, venta, ventaPrevio: venta * 0.8, utilidad: venta * 0.3, utilidadPrevio: venta * 0.2, margen: 0.3, margenPrevio: 0.25 });

function pintar(celular: boolean) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({
    desde: "2026-09-15", hasta: "2026-09-30", anterior: { desde: "2025-09-15", hasta: "2025-09-30" },
    corteCosto: "2026-09-30",
    filas: [fila("vistana", 1_298_151.79)],
    total: fila("total", 1_298_151.79),
  }))) as typeof fetch;
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ResumenRango desde="2026-09-15" hasta="2026-09-30" celular={celular} />
    </SWRConfig>,
  );
}
afterEach(cleanup);

describe("#19 · el rango cabe en el celular", () => {
  it("celular: tabla de ancho fijo, montos sin centavos y Margen presente", async () => {
    pintar(true);
    await screen.findByText("Vistana");
    const tabla = document.querySelector("[data-resumen-rango] table") as HTMLTableElement;
    expect(tabla.className).toMatch(/\btable-fixed\b/);
    expect(tabla.querySelectorAll("col").length).toBe(4);
    expect(screen.getAllByText("$1,298,152").length).toBe(2);
    expect(screen.queryByText("$1,298,151.79")).toBeNull();
    expect(screen.getByText("Margen")).toBeTruthy();
  });
  it("computadora: igual que antes (con centavos y con Utilidad)", async () => {
    pintar(false);
    await screen.findByText("Vistana");
    const tabla = document.querySelector("[data-resumen-rango] table") as HTMLTableElement;
    expect(tabla.className).not.toMatch(/\btable-fixed\b/);
    expect(screen.getAllByText("$1,298,151.79").length).toBe(2);
    expect(screen.getByText("Utilidad")).toBeTruthy();
  });
});
