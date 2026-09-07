// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE PROVEEDORES — UNA FILA POR PROVEEDOR, Y DICE DE QUÉ EMPRESAS VIENE.
//
// 🩸 Hasta el 6-sep-2026 Confecciones Boston salía en TRES filas (sus 4 grafías
// en 5 empresas) y la última columna era un NÚMERO pelado —«3»— que además
// mentía: contaba las empresas de esa fila, no las del proveedor. Contestar
// «¿cuánto le debo?» costaba 11 toques y 5 pantallas, y daba $4,165.96 sólo si
// no te olvidabas de sumar a mano.
//
// Ahora es UNA fila, con el saldo sumado y los nombres CORTOS de las empresas
// de donde viene (diccionario § 0: empresa corta, plata con centavos).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProveedoresListClient from "@/app/proveedores/ProveedoresListClient";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/proveedores",
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

// Lo que la ruta contesta HOY con los cuatro amarres puestos (medido el
// 6-sep-2026 con `scripts/_medir-proveedores-amarre.mjs`).
const RESPUESTA = {
  grupo_saldo: 4165.96 + 288358.84 + 76165.72,
  total: 3,
  proveedores: [
    {
      key: "LATIN FITNESS GROUP",
      nombre: "LATIN FITNESS GROUP INC.",
      saldo_total: 288358.84,
      empresas: ["active_shoes", "active_wear", "vistana", "american_classic"],
      empresas_count: 4,
      ultimo_pago_dias: null,
      aging_current: 288358.84, aging_watch: 0, aging_overdue: 0,
    },
    {
      key: "FASHION WEAR INC",
      nombre: "FASHION WEAR, INC",
      saldo_total: 76165.72,
      empresas: ["american_classic"],
      empresas_count: 1,
      ultimo_pago_dias: null,
      aging_current: 76165.72, aging_watch: 0, aging_overdue: 0,
    },
    {
      key: "CONFECCIONES BOSTON",
      nombre: "CONFECCIONES BOSTON S.A",
      saldo_total: 4165.96,
      empresas: ["joystep", "fashion_wear", "american_classic", "active_shoes", "vistana"],
      empresas_count: 5,
      ultimo_pago_dias: null,
      aging_current: 4165.96, aging_watch: 0, aging_overdue: 0,
    },
  ],
  avisoMontos: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => RESPUESTA })));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function pintar() {
  const r = render(<ProveedoresListClient />);
  await waitFor(() => expect(screen.getAllByText("CONFECCIONES BOSTON S.A").length).toBeGreaterThan(0));
  return r;
}

describe("🔴 un proveedor, una fila", () => {
  it("Confecciones Boston aparece UNA sola vez por vista, con su saldo sumado", async () => {
    await pintar();
    // Dos vistas (tabla de escritorio + tarjetas de celular), una fila en cada una.
    expect(screen.getAllByText("CONFECCIONES BOSTON S.A")).toHaveLength(2);
    expect(screen.getAllByText("$4,165.96").length).toBeGreaterThan(0);
  });

  it("🔴 la fila dice DE QUÉ EMPRESAS viene, con el nombre corto", async () => {
    await pintar();
    // Las 5 empresas de Boston, en orden de saldo. Antes acá decía «3».
    expect(
      screen.getAllByText("Joystep · Fashion Wear · Multifashion · Active Shoes · Vistana").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Active Shoes · Active Wear · Vistana · Multifashion").length,
    ).toBeGreaterThan(0);
  });

  it("🩸 el conteo pelado de empresas ya no se dibuja", async () => {
    await pintar();
    // «5» y «4» sueltos eran la columna vieja; ahora no existe ninguna celda así.
    expect(screen.queryByText("5")).toBeNull();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("FASHION WEAR, INC sigue siendo su propia fila (misma cédula que Boston)", async () => {
    await pintar();
    expect(screen.getAllByText("FASHION WEAR, INC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$76,165.72").length).toBeGreaterThan(0);
  });
});
