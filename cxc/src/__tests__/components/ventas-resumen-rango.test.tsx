// 🔴 Ventas › Resumen con «Rango de fechas»: el número grande, una fila por empresa y el pie gris.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/components/ventas/celular/MenuVentasCelular", () => ({ FrescuraVentasCel: () => null }));
import { ResumenRango } from "@/components/ventas/ResumenRango";

const fila = (empresa_key: string, venta: number, ventaPrevio: number) =>
  ({ empresa_key, venta, ventaPrevio, utilidad: venta * 0.3, utilidadPrevio: ventaPrevio * 0.25, margen: 0.3, margenPrevio: 0.25 });

describe("ResumenRango", () => {
  it("dibuja el rango contra los mismos días del año pasado", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      desde: "2026-09-15", hasta: "2026-09-30", anterior: { desde: "2025-09-15", hasta: "2025-09-30" },
      corteCosto: "2026-09-29",
      filas: [fila("vistana", 1000, 800)],
      total: fila("total", 1000, 800),
    }))) as typeof fetch;
    render(<SWRConfig value={{ provider: () => new Map() }}><ResumenRango desde="2026-09-15" hasta="2026-09-30" celular={false} /></SWRConfig>);
    expect(await screen.findByText("Vistana")).toBeTruthy();
    expect(screen.getByText("vs 2025")).toBeTruthy();
    expect(screen.getAllByText("▲ +25%").length).toBeGreaterThan(0);
    expect(screen.getByText(/vs 15–30 sep 2025, mismos días · utilidad y margen hasta el 29 sep/)).toBeTruthy();
  });
});
