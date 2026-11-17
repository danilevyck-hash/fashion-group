// ─────────────────────────────────────────────────────────────────────────────
// 🔴 BOSTON › INICIO (16-nov-2026, errores de los videos #24 y #25).
//
// #24 · No decía de cuándo son los números: le faltaba `LineaDeFrescura`, la
//   ÚNICA línea de frescura del sistema. Usa el MISMO dato que `/cxc` para la
//   cartera de Boston (`tabla="estadocuenta"` + `empresasCarteraAparte()`).
// #25 · Las cuatro tarjetas no quedaban parejas: «Colaboradores con préstamo»
//   sin pie y con el título en dos renglones. Las cuatro: título en una línea,
//   número y pie.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/components/shared/LineaDeFrescura", () => ({
  default: (p: { tabla?: string; empresas?: string[] }) => (
    <div data-frescura data-tabla={p.tabla} data-empresas={(p.empresas ?? []).join(",")} />
  ),
}));
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));

import InicioBoston from "@/app/boston/tabs/InicioBoston";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const INICIO = {
  anio: 2026, mes: 11,
  cartera: { total: 1000, d0_90: 600, d91_120: 300, d121_plus: 100, clientes: 12 },
  ventas: { mes: 5000, anio: 60000 },
  planilla: { personas: 40 },
  prestamos: { personas: 3 },
};

async function pintar() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => INICIO })));
  const r = render(<InicioBoston onIr={() => {}} />);
  await waitFor(() => expect(r.container.textContent).toContain("$1,000.00"));
  return r;
}

describe("#24 · Boston › Inicio dice de cuándo son los números", () => {
  it("con `LineaDeFrescura` y el MISMO dato que `/cxc` usa para Boston", async () => {
    const { container } = await pintar();
    const l = container.querySelector("[data-frescura]");
    expect(l).not.toBeNull();
    expect(l!.getAttribute("data-tabla")).toBe("estadocuenta");
    expect(l!.getAttribute("data-empresas")).toBe(empresasCarteraAparte().join(","));
  });
});

describe("#25 · las cuatro tarjetas son parejas", () => {
  it("cada una: título en UNA línea, número y pie con texto", async () => {
    const { container } = await pintar();
    const tarjetas = [...container.querySelectorAll("[data-tarjeta-boston]")];
    expect(tarjetas).toHaveLength(4);
    for (const t of tarjetas) {
      const titulo = t.querySelector("[data-titulo]")!;
      expect(titulo.className).toMatch(/\btruncate\b/);
      expect(titulo.textContent!.length).toBeLessThanOrEqual(20);
      expect(t.querySelector("[data-pie]")?.textContent?.trim()).toBeTruthy();
    }
  });
});
