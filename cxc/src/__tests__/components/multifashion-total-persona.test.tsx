// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — EL TOTAL DE CADA PERSONA EN COMISIONES › MULTIFASHION
// (2-oct-2026, `MULTIFASHION_TOTAL_PERSONA_2026_10`). Daniel: «¿cómo harías aquí
// para que se vea el total de la persona?».
//
//   1. Septiembre 2026 cerrado: Sheynee $75.23 + $50 = $125.23 · Jennifer
//      $41.19 + $100 = $141.19 · total $363.51.
//   2. La fila dice lo MISMO que el Excel (Bono y Total a pagar).
//   3. El chip deja de decir el monto: solo el ícono.
//   4. Mes abierto: sin columnas de bono ni de total por persona.
//   5. Apagado: la pantalla de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const flags = vi.hoisted(() => ({ persona: true }));
vi.mock("@/lib/multifashion/bono-linea", async (orig) => {
  const real = await orig<typeof import("@/lib/multifashion/bono-linea")>();
  return {
    ...real,
    get MULTIFASHION_TOTAL_PERSONA_2026_10() {
      return flags.persona;
    },
  };
});
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/comisiones",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { VendedorasSubtab } from "@/components/multifashion/VendedorasSubtab";
import { filasExcelVendedoras } from "@/lib/multifashion/vendedoras-excel";
import { totalAPagarMultifashion, totalDeFila } from "@/lib/multifashion/bono-linea";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import type { BonosMultifashion, VendedoraDetalle } from "@/components/ventas/types";

const fila = (nombre: string, comision: number, manager = false): VendedoraDetalle => ({
  nombre, tickets: 100, ventas: comision * 200, ticket_promedio: 40, comision, manager,
  top: false, delta_ventas_pct: null, delta_tickets_pct: null,
});

// Septiembre 2026: $213.51 de comisiones + $150 de bonos = $363.51.
const FILAS = [
  fila("SHEYNEE BATISTA", 75.23),
  fila("ANA PEREZ", 50),
  fila("LUISA GOMEZ", 47.09),
  fila("JENNIFER MIRANDA", 41.19, true),
];

const SEP_CERRADO = {
  mes_evaluado: { year: 2026, mes: 9 }, es_elegible: true, fecha_max_data: "2026-10-01",
  ultimo_mes_elegible: { year: 2026, mes: 9 },
  gerente: { nombre: "JENNIFER MIRANDA", ventas_mes: 50000, ventas_mes_prev: 40000, delta_pct: 0.25, tiene_comparacion: true, bono: 100 },
  vendedoras: [
    { nombre: "SHEYNEE BATISTA", tickets: 1, ventas: 1, ticket_promedio: 1, manager: false, delta_ventas_pct: null, tiene_comparacion: false, bono_vendedora: true },
  ],
} as BonosMultifashion;
const SEP_ABIERTO = { ...SEP_CERRADO, es_elegible: false } as BonosMultifashion;

const respuesta = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

async function pintar(bonos: BonosMultifashion, conTotalAPagar = true) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/multifashion/vendedoras")) {
      return respuesta({
        vendedoras: FILAS, total_vendedoras_periodo: 4, ventas_total: 42702, tickets_total: 400,
        ventas_total_prev: 0, tickets_total_prev: 0, fecha_corte: "2026-09-30", es_periodo_parcial: false,
        dia_corte_periodo_anterior: "2026-08-31",
      });
    }
    if (url.includes("/api/multifashion/bonos")) return respuesta(bonos);
    return { ok: false, status: 404, json: async () => ({}) };
  }));
  const r = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <VendedorasSubtab
        selectedYear={2026}
        periodo={{ tipo: "mes", anio: 2026, mes: 9 }}
        corte={{ anio: 2026, mes: 10 }}
        conTotalAPagar={conTotalAPagar}
      />
    </SWRConfig>,
  );
  await screen.findAllByText("Sheynee Batista");
  // Se espera a que lleguen los bonos: sin esto «sin columnas» sería verde por llegar antes.
  if (bonos.es_elegible) {
    await waitFor(() => expect(document.querySelector("[data-chip-bono]")).not.toBeNull());
  } else {
    await screen.findByText(/se define al cerrar el mes/);
  }
  return r;
}

/** La fila de la tabla de la computadora de una persona. */
function filaDe(nombre: string): HTMLTableRowElement {
  const tabla = document.querySelector("[data-vista='tabla']")!;
  const tr = [...tabla.querySelectorAll("tbody tr")].find((t) => t.textContent!.includes(nombre));
  return tr as HTMLTableRowElement;
}
const celda = (tr: HTMLElement, c: string) => tr.querySelector(`[data-celda='${c}']`)?.textContent;

beforeEach(() => { flags.persona = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 1 · septiembre 2026: el total de cada persona", () => {
  it("las cuentas puras", () => {
    const sheynee = FILAS[0], jennifer = FILAS[3];
    expect(totalDeFila(sheynee, SEP_CERRADO).toFixed(2)).toBe("125.23");
    expect(totalDeFila(jennifer, SEP_CERRADO).toFixed(2)).toBe("141.19");
    expect(totalAPagarMultifashion(FILAS, SEP_CERRADO).total.toFixed(2)).toBe("363.51");
  });

  it("la pantalla: Bono y Total a pagar en la fila, y el pie bajo sus columnas", async () => {
    await pintar(SEP_CERRADO);
    const ths = [...document.querySelectorAll("[data-vista='tabla'] thead th")].map((t) => t.textContent);
    expect(ths.slice(-2)).toEqual(["Bono", "Total a pagar"]);
    expect(celda(filaDe("Sheynee Batista"), "bono")).toBe("$50.00");
    expect(celda(filaDe("Sheynee Batista"), "total-a-pagar")).toBe("$125.23");
    expect(celda(filaDe("Jennifer Miranda"), "bono")).toBe("$100.00");
    expect(celda(filaDe("Jennifer Miranda"), "total-a-pagar")).toBe("$141.19");
    expect(celda(filaDe("Ana Perez"), "bono")).toBe("—");
    const pie = [...document.querySelectorAll("[data-pie-total-persona] td")].map((t) => t.textContent);
    expect(pie).toEqual(["Total", "$213.51", "$150.00", "$363.51"]);
    expect(document.querySelector("[data-total-multifashion]")!.textContent).toContain("$363.51");
    // El desglose de la barra se esconde en la computadora: ya está en el pie.
    expect(document.querySelector("[data-desglose-multifashion]")!.className).toContain("lg:hidden");
  });

  it("🔴 la fila dice lo MISMO que el Excel", async () => {
    await pintar(SEP_CERRADO);
    for (const f of filasExcelVendedoras(FILAS, SEP_CERRADO)) {
      const nombre = nombreEnPantalla(String(f[1]).replace(" (gerente)", ""));
      const tr = filaDe(nombre);
      const bono = Number(f[7]);
      expect(celda(tr, "bono")).toBe(bono > 0 ? `$${bono.toFixed(2)}` : "—");
      expect(celda(tr, "total-a-pagar")).toBe(`$${Number(f[8]).toFixed(2)}`);
    }
  });

  it("el chip ya no dice el monto: solo el ícono", async () => {
    await pintar(SEP_CERRADO);
    const chips = [...document.querySelectorAll("[data-vista='tabla'] [data-chip-bono]")];
    expect(chips).toHaveLength(2);
    for (const c of chips) expect(c.textContent).not.toMatch(/\$/);
  });
});

describe("🔴 2 · mes abierto y apagado", () => {
  it("mes abierto: sin columnas de bono ni total por persona", async () => {
    await pintar(SEP_ABIERTO);
    expect(document.querySelectorAll("[data-celda='total-a-pagar']")).toHaveLength(0);
    expect(document.querySelector("[data-pie-total-persona]")).toBeNull();
    const ths = [...document.querySelectorAll("[data-vista='tabla'] thead th")].map((t) => t.textContent);
    expect(ths).not.toContain("Total a pagar");
  });

  it("CONTROL — apagado: la pantalla de hoy (chip con monto, sin columnas)", async () => {
    flags.persona = false;
    await pintar(SEP_CERRADO);
    expect(document.querySelectorAll("[data-celda='total-a-pagar']")).toHaveLength(0);
    const chip = document.querySelector("[data-vista='tabla'] [data-chip-bono='vendedora']");
    expect(chip!.textContent).toContain("Bono $50");
  });

  it("CONTROL — en Multifashion › Vendedoras (sin la barra) tampoco cambia", async () => {
    await pintar(SEP_CERRADO, false);
    expect(document.querySelectorAll("[data-celda='total-a-pagar']")).toHaveLength(0);
  });
});
