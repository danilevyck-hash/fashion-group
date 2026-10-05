// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — MULTIFASHION › VENDEDORAS COMPARA CONTRA EL MISMO MES DEL AÑO
// PASADO (Daniel, 5-oct-2026). Antes comparaba contra el mes anterior.
//
//   1. `MultifashionView` prende `vsAnioPasado` (la regla de Comisiones ›
//      Multifashion): «Δ vs oct 2025», «Nueva» sin historia.
//   2. El pie dice «vs oct 2025, mismos días» con el mes en curso, y el % del
//      TOTAL es TIENDA contra TIENDA (toda la venta, sin filtro de vendedora).
//   3. Computadora y celular dicen lo mismo.
//   4. Con rango de fechas sigue `ComisionesVendedoresRango` (mismo período del
//      año pasado); «Todo el año» no pide el año pasado por mes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multifashion",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { VendedorasSubtab } from "@/components/multifashion/VendedorasSubtab";
import { notaTotalAnioPasado, ventaTienda } from "@/lib/multifashion/vendedoras-vs-anio";
import type { Periodo } from "@/lib/multifashion/periodo";
import type { VendedoraDetalle } from "@/components/ventas/types";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const fila = (nombre: string, ventas: number): VendedoraDetalle => ({
  nombre, tickets: 10, ventas, ticket_promedio: 40, comision: ventas / 100, manager: false,
  top: false, delta_ventas_pct: 0.5, delta_tickets_pct: null,
});

const OCT_2025 = {
  desde: "2025-10-01", hasta: "2025-10-04", parcial: true,
  por_vendedora: { "SHEYNEE BATISTA": 4000 },
  tienda: 10000, tienda_actual: 11200,
};

let urls: string[] = [];
async function pintar(periodo: Periodo) {
  urls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/multifashion/vendedoras")) {
      return {
        ok: true, status: 200, json: async () => ({
          vendedoras: [fila("SHEYNEE BATISTA", 5000), fila("ANA PEREZ", 3000)],
          total_vendedoras_periodo: 2, ventas_total: 8000, tickets_total: 20,
          ventas_total_prev: 0, tickets_total_prev: 0, fecha_corte: "2026-10-04", es_periodo_parcial: true,
          dia_corte_periodo_anterior: "2026-09-04",
          ...(url.includes("vsAnio=1") ? { anio_pasado: OCT_2025 } : {}),
        }),
      };
    }
    if (url.includes("/api/multifashion/bonos")) return { ok: true, status: 200, json: async () => ({ sin_data: true }) };
    return { ok: false, status: 404, json: async () => ({}) };
  }));
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <VendedorasSubtab selectedYear={2026} periodo={periodo} corte={{ anio: 2026, mes: 10 }} enCelular conTotalAPagar vsAnioPasado />
    </SWRConfig>,
  );
  await screen.findAllByText("Sheynee Batista");
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 Multifashion › Vendedoras: vs el mismo mes del año pasado", () => {
  it("el módulo prende la comparación contra el año pasado", () => {
    const view = leer("src/components/multifashion/MultifashionView.tsx");
    const montaje = view.slice(view.indexOf("<VendedorasSubtab"), view.indexOf("/>", view.indexOf("<VendedorasSubtab")));
    expect(montaje).toMatch(/\bvsAnioPasado\b/);
    // El rango sigue en la consulta por fechas (mismo período del año pasado).
    expect(view).toMatch(/periodo\.tipo === "rango" \?\s*\(\s*<ComisionesVendedoresRango/);
  });

  it("el total es tienda contra tienda", () => {
    expect(ventaTienda([
      { vendedor: "DEFAULT", vendedor_canonico: null, subtotal: 100 },
      { vendedor: "", vendedor_canonico: null, subtotal: "50" },
      { vendedor: "SHEY", vendedor_canonico: "SHEYNEE BATISTA", subtotal: 850 },
    ])).toBe(1000);
    expect(notaTotalAnioPasado(2026, 10, OCT_2025)).toBe("+12% vs oct 2025, mismos días");
    expect(notaTotalAnioPasado(2026, 9, { hasta: "2025-09-30", parcial: false, tienda: 1000, tienda_actual: 900 })).toBe("-10% vs sep 2025");
    // Sin historia o sin la venta de la tienda: solo la nota, nunca un % inventado.
    expect(notaTotalAnioPasado(2026, 10, { ...OCT_2025, tienda: 0 })).toBe("vs oct 2025, mismos días");
    expect(notaTotalAnioPasado(2026, 10, { hasta: "2025-10-04", parcial: true })).toBe("vs oct 2025, mismos días");
  });

  it("octubre en curso: «Δ vs oct 2025», «Nueva» y el pie, en computadora y celular", async () => {
    await pintar({ tipo: "mes", anio: 2026, mes: 10 });
    expect(urls.some((u) => u.includes("/api/multifashion/vendedoras") && u.includes("vsAnio=1"))).toBe(true);
    await screen.findByText("Δ vs oct 2025");
    const tabla = document.querySelector("[data-tabla-ordenada]")!;
    const tr = (n: string) => [...tabla.querySelectorAll("tbody tr")].find((t) => t.textContent!.includes(n))!;
    expect(tr("Ana Perez").querySelector("[data-celda='delta']")!.textContent).toBe("Nueva");
    expect(tr("Sheynee Batista").querySelector("[data-celda='delta']")!.textContent).toContain("+25%");
    await waitFor(() => expect(document.querySelector("[data-pie-vendedoras]")!.textContent).toContain("+12% vs oct 2025, mismos días"));
    // Celular: la misma línea y la misma «Nueva».
    expect(document.querySelector("[data-celular='vendedoras-subtitulo']")!.textContent).toContain("+12% vs oct 2025, mismos días");
    expect(document.querySelector("[data-vendedora='ANA PEREZ'] [data-celular='nueva']")).not.toBeNull();
    expect(document.querySelector("[data-vendedora='SHEYNEE BATISTA']")!.textContent).toContain("▲ 25 %");
  });

  it("«Todo el año» no pide el año pasado por mes", async () => {
    await pintar({ tipo: "anio", anio: 2026 } as Periodo);
    expect(urls.some((u) => u.includes("vsAnio=1"))).toBe(false);
  });
});
