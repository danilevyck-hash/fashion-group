// ─────────────────────────────────────────────────────────────────────────────
// 🔴 PROVEEDORES — CERO NO ES LO MISMO QUE VACÍO (16-nov-2026, errores de los
// videos #15 y #17).
//
// #15 · En el celular los proveedores en cero NO aparecían nunca (la computadora
//   los pliega en «Ver N sin saldo»), y una empresa con TODOS en cero decía
//   «Sin proveedores recibidos de Switch» — falso: llegaron, están en cero.
// #17 · La ficha decía «Por pagar · 2 empresas» y la lista mostraba 3 (la
//   tercera en $0). El contador y la lista salen de la MISMA función: la
//   empresa en cero sin nada adentro no se dibuja; la que tiene pendiente y
//   saldo a favor que se anulan, sí (un cero con algo adentro muestra su número).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/proveedores",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: false }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
vi.mock("@/components/ToastSystem", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/hooks/useUrlState", async () => {
  const { useState } = await import("react");
  return { useUrlState: (_k: string, def: string) => useState(def) };
});

import ProveedoresListClient from "@/app/proveedores/ProveedoresListClient";
import ProveedorDetail from "@/app/proveedores/[key]/ProveedorDetail";
import { buildFicha, type ProveedorRow } from "@/lib/proveedores/lista";
import { empresasDeLaFicha, textoVacioDeEmpresa } from "@/lib/proveedores/por-empresa";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }));

const T0 = { t0_90: 0, t91_120: 0, t121_365: 0, tMas365: 0 };
const S0 = { debes: 0, a_favor: 0, por_pagar: 0 };
const cero = (key: string) => ({
  key, nombre: key, tramos: T0, saldo: S0, tambien_en: [], ultimo_pago_fecha: null, ultimo_pago_dias: null,
});

// Joystep: dos proveedores llegaron de Switch, los dos en cero.
// Active Wear: la lectura no trajo ninguno.
const CARTERA = {
  empresas: [
    { empresa_key: "joystep", nombre: "Joystep", tramos: T0, saldo: S0, proveedores: [], sin_saldo: [cero("ULTRACOM"), cero("PANAFOTO")] },
    { empresa_key: "active_wear", nombre: "Active Wear", tramos: T0, saldo: S0, proveedores: [], sin_saldo: [] },
  ],
  total: { tramos: T0, saldo: S0 },
  proveedores_con_saldo: 0,
  synced_at: "2026-11-16T09:30:00Z",
  avisoMontos: null,
};

const tarjetas = () => within(document.querySelector('[data-vista="tarjetas"]') as HTMLElement);
const tabla = () => within(document.querySelector('[data-vista="tabla"]') as HTMLElement);

describe("#15 · el estado vacío distingue «sin proveedores» de «todos en cero»", () => {
  it("la regla, pura", () => {
    expect(textoVacioDeEmpresa(CARTERA.empresas[0] as never)).toBe("Sin saldo por pagar");
    expect(textoVacioDeEmpresa(CARTERA.empresas[1] as never)).toBe("Sin proveedores recibidos de Switch para esta empresa.");
    expect(textoVacioDeEmpresa({ ...CARTERA.empresas[0], proveedores: [cero("X")] } as never)).toBeNull();
  });

  for (const apple of [true, false]) {
    it(`celular (${apple ? "Apple" : "respaldo"}): la empresa en cero lo dice y los pliega, como la computadora`, async () => {
      vi.stubGlobal("fetch", json(CARTERA));
      render(<ProveedoresListClient apple={apple} />);
      await screen.findAllByText("Joystep");
      fireEvent.click(tarjetas().getByText("Joystep"));
      const t = tarjetas();
      expect(t.queryByText(/Sin proveedores recibidos de Switch/)).toBeNull();
      expect(t.getByText("Sin saldo por pagar")).toBeTruthy();
      expect(t.queryByText("ULTRACOM")).toBeNull();
      fireEvent.click(t.getByText(/Ver 2 sin saldo/));
      expect(t.getByText(/ULTRACOM/i)).toBeTruthy();
      expect(t.getByText(/PANAFOTO/i)).toBeTruthy();
    });

    it(`celular (${apple ? "Apple" : "respaldo"}): la empresa que no recibió nada sigue diciéndolo`, async () => {
      vi.stubGlobal("fetch", json(CARTERA));
      render(<ProveedoresListClient apple={apple} />);
      await screen.findAllByText("Active Wear");
      fireEvent.click(tarjetas().getByText("Active Wear"));
      expect(tarjetas().getByText("Sin proveedores recibidos de Switch para esta empresa.")).toBeTruthy();
    });

    it(`computadora (${apple ? "Apple" : "respaldo"}): el mismo texto`, async () => {
      vi.stubGlobal("fetch", json(CARTERA));
      render(<ProveedoresListClient apple={apple} />);
      await screen.findAllByText("Joystep");
      fireEvent.click(tabla().getByText("Joystep"));
      expect(tabla().getByText("Sin saldo por pagar")).toBeTruthy();
      expect(tabla().getByText(/Ver 2 sin saldo/)).toBeTruthy();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
const fila = (empresa: string, saldo: number, aging: { title: string; saldo: number }[]): ProveedorRow => ({
  empresa_key: empresa, proveedor_switch_id: 1, codigo: "1", nombre: "AMERICAN FASHION WEAR SA",
  identificacion: null, dv: null, direccion: null, contacto: null, telefono: null, celular: null, email: null,
  tipo_proveedor: null, saldo_total: saldo, aging, ultimo_pago_monto: null, ultimo_pago_fecha: null,
  ultimo_pago_dias: null, synced_at: null,
});

describe("#17 · la ficha: el contador y la lista salen de la misma función", () => {
  const ROWS = [
    fila("fashion_wear", 300, [{ title: "0-30", saldo: 300 }]),
    fila("fashion_shoes", 60, [{ title: "0-30", saldo: 60 }]),
    fila("joystep", 0, [{ title: "0-30", saldo: 0 }]),
  ];

  it("la empresa en cero SIN nada adentro no se cuenta ni se dibuja", async () => {
    const ficha = buildFicha(ROWS, "AMERICAN FASHION WEAR SA")!;
    expect(empresasDeLaFicha(ficha.empresas).map((e) => e.empresa)).toEqual(["fashion_wear", "fashion_shoes"]);
    vi.stubGlobal("fetch", json({ ...ficha, reclamos: [] }));
    const { container } = render(<ProveedorDetail fichaKey="AMERICAN FASHION WEAR SA" apple />);
    await waitFor(() => expect(container.querySelector("[data-por-empresa-apple]")).not.toBeNull());
    expect(container.querySelector("[data-numero-apple]")!.textContent).toContain("Por pagar · 2 empresas");
    expect(container.querySelectorAll("[data-por-empresa-apple] > li")).toHaveLength(2);
  });

  it("🔑 la empresa en cero CON pendiente y saldo a favor que se anulan sí se cuenta y se ve", async () => {
    const rows = [...ROWS.slice(0, 2), fila("joystep", 0, [{ title: "0-30", saldo: 50 }, { title: "Mas de 365", saldo: -50 }])];
    const ficha = buildFicha(rows, "AMERICAN FASHION WEAR SA")!;
    vi.stubGlobal("fetch", json({ ...ficha, reclamos: [] }));
    const { container } = render(<ProveedorDetail fichaKey="AMERICAN FASHION WEAR SA" apple />);
    await waitFor(() => expect(container.querySelector("[data-por-empresa-apple]")).not.toBeNull());
    expect(container.querySelector("[data-numero-apple]")!.textContent).toContain("Por pagar · 3 empresas");
    expect(container.querySelectorAll("[data-por-empresa-apple] > li")).toHaveLength(3);
  });
});
