// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LISTA SON LAS EMPRESAS, Y CADA UNA SE DESPLIEGA EN SUS PROVEEDORES.
//
// 🩸 Hasta el 20-sep-2026 la lista eran los 31 proveedores del grupo, con una
// columna que decía de qué empresas venía cada uno. Pero la contadora paga POR
// EMPRESA —cada una con su banco y su chequera—, así que para saber qué debe
// Fashion Wear tenía que leer 31 filas buscando cuáles la nombraban. Daniel lo
// dio vuelta: **siete filas, y se toca la que se quiere ver**.
//
// ⚠️ ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN. Hasta esa fecha medía «un proveedor, una
// fila» en la lista del grupo (6-sep-2026). Esa regla no murió: **se mudó
// adentro de la empresa** —las grafías del mismo proveedor siguen cayendo en
// UNA fila, por `aplicarAmarre` y por nada más— y lo que la columna «Empresas»
// decía ahora se lee como «también en Fashion Shoes», con enlace.
//
// Los números de abajo son los REALES, medidos contra producción el
// 20-sep-2026 (`scripts/_medir-proveedores-por-empresa.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import ProveedoresListClient from "@/app/proveedores/ProveedoresListClient";

const setUrl = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/proveedores",
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
// La empresa abierta vive en `?empresa=`; acá se maneja en memoria para poder
// tocar y ver, sin router de verdad.
vi.mock("@/lib/hooks/useUrlState", async () => {
  const { useState } = await import("react");
  return {
    useUrlState: (_k: string, def: string) => {
      const [v, s] = useState(def);
      return [v, (next: string) => { setUrl(next); s(next); }];
    },
  };
});

const tramos = (t0: number, t1: number, t2: number, t3: number) =>
  ({ t0_90: t0, t91_120: t1, t121_365: t2, tMas365: t3 });
const saldo = (debes: number, aFavor: number) =>
  ({ debes, a_favor: aFavor, por_pagar: Math.round((debes - aFavor) * 100) / 100 });

// Fashion Wear y Fashion Shoes, con los números de producción del 20-sep-2026.
const RESPUESTA = {
  empresas: [
    {
      empresa_key: "fashion_wear",
      nombre: "Fashion Wear",
      tramos: tramos(-208985.74, -166039.56, 1048618.45, 1304607.47),
      saldo: saldo(2405128.08, 426927.46),
      proveedores: [
        {
          key: "AMERICAN FASHION WEAR SA",
          nombre: "American Fashion Wear, SA",
          tramos: tramos(-211206.64, -166039.56, 1019045.45, 1297016.96),
          saldo: saldo(2359017.72, 420201.51),
          tambien_en: ["fashion_shoes"],
          ultimo_pago_fecha: "2026-09-07",
          ultimo_pago_dias: 13,
        },
        {
          key: "THALIA INTERNACIONAL SA",
          nombre: "THALIA INTERNACIONAL, S.A.",
          tramos: tramos(0, 0, 28676, 0),
          saldo: saldo(28676, 0),
          tambien_en: [],
          ultimo_pago_fecha: null,
          ultimo_pago_dias: null,
        },
      ],
      sin_saldo: [
        {
          key: "ULTRACOM",
          nombre: "ULTRACOM",
          tramos: tramos(0, 0, 0, 0),
          saldo: saldo(0, 0),
          tambien_en: [],
          ultimo_pago_fecha: "2026-03-23",
          ultimo_pago_dias: 181,
        },
      ],
    },
    {
      empresa_key: "fashion_shoes",
      nombre: "Fashion Shoes",
      tramos: tramos(445056.9, 182274.69, 719091.18, 0),
      saldo: saldo(1346422.77, 0),
      proveedores: [
        {
          key: "AMERICAN FASHION WEAR SA",
          nombre: "American Fashion Wear, SA",
          tramos: tramos(445056.9, 182274.69, 719091.18, 0),
          saldo: saldo(1346422.77, 0),
          tambien_en: ["fashion_wear"],
          ultimo_pago_fecha: "2026-06-29",
          ultimo_pago_dias: 83,
        },
      ],
      sin_saldo: [],
    },
  ],
  total: {
    tramos: tramos(236071.16, 16235.13, 1767709.63, 1304607.47),
    saldo: saldo(3751550.85, 426927.46),
  },
  proveedores_con_saldo: 2,
  synced_at: "2026-09-20T09:32:03.668+00:00",
  avisoMontos: null,
};

beforeEach(() => {
  setUrl.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => RESPUESTA })));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function pintar() {
  const r = render(<ProveedoresListClient />);
  await waitFor(() => expect(screen.getAllByText("Fashion Wear").length).toBeGreaterThan(0));
  return r;
}

const tabla = () => document.querySelector('[data-vista="tabla"]') as HTMLElement;

describe("🔴 la lista son las empresas", () => {
  it("cada empresa es una fila, con su «Por pagar»", async () => {
    await pintar();
    const t = within(tabla());
    expect(t.getByText("Fashion Wear")).toBeTruthy();
    expect(t.getByText("Fashion Shoes")).toBeTruthy();
    expect(t.getAllByText("$1,978,200.62").length).toBeGreaterThan(0);
    expect(t.getAllByText("$1,346,422.77").length).toBeGreaterThan(0);
  });

  it("🔴 los CUATRO tramos son los encabezados, no los tres del CXC", async () => {
    await pintar();
    const t = within(tabla());
    expect(t.getByText("0-90D")).toBeTruthy();
    expect(t.getByText("91-120D")).toBeTruthy();
    expect(t.getByText("121-365D")).toBeTruthy();
    expect(t.getByText("+1 año")).toBeTruthy();
    // 🩸 «121d+» juntaba cuatro meses con tres años.
    expect(t.queryByText("121d+")).toBeNull();
  });

  it("🔴 el total al pie es la suma de las empresas", async () => {
    await pintar();
    // 1.978.200,62 + 1.346.422,77
    expect(within(tabla()).getAllByText("$3,324,623.39").length).toBeGreaterThan(0);
  });

  it("cerrada, la empresa NO muestra sus proveedores", async () => {
    await pintar();
    expect(within(tabla()).queryByText("THALIA INTERNACIONAL, S.A.")).toBeNull();
  });
});

describe("🔴 tocar la empresa la despliega en sus proveedores", () => {
  it("aparecen los proveedores de ESA empresa, con sus tramos", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    const t = within(tabla());
    expect(t.getAllByText("American Fashion Wear, SA").length).toBeGreaterThan(0);
    expect(t.getByText("THALIA INTERNACIONAL, S.A.")).toBeTruthy();
    expect(t.getAllByText("$1,297,016.96").length).toBeGreaterThan(0);
  });

  it("la empresa abierta queda en la URL, para poder compartir el enlace", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    expect(setUrl).toHaveBeenCalledWith("fashion_wear");
  });

  it("🔴 «también en Fashion Shoes» reemplaza a la columna «Empresas»", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    const t = within(tabla());
    expect(t.getAllByText(/también en/).length).toBeGreaterThan(0);
    // Y es un enlace a ESA empresa, no a la ficha del proveedor.
    const enlace = t.getAllByRole("button", { name: "Fashion Shoes" })[0];
    fireEvent.click(enlace);
    expect(setUrl).toHaveBeenCalledWith("fashion_shoes");
  });

  it("el que está en cero se pliega, no se esconde", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    const t = within(tabla());
    expect(t.queryByText("ULTRACOM")).toBeNull();
    fireEvent.click(t.getByText(/Ver 1 sin saldo/));
    expect(t.getByText("ULTRACOM")).toBeTruthy();
  });

  it("🩸 la columna «Empresas» de la lista vieja ya no existe", async () => {
    await pintar();
    expect(within(tabla()).queryByText("Empresas")).toBeNull();
  });
});

describe("🔴 lo que está a favor se ve", () => {
  it("la empresa desplegada dice de qué está hecho su «Por pagar»", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    expect(
      within(tabla()).getAllByText(
        "Le debes $2,405,128.08 · Tienes a favor $426,927.46 · Por pagar $1,978,200.62",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("y el proveedor que lo tiene, también", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Wear"));
    expect(
      within(tabla()).getByText(
        "Le debes $2,359,017.72 · Tienes a favor $420,201.51 · Por pagar $1,938,816.21",
      ),
    ).toBeTruthy();
  });

  it("🔑 sin nada a favor no se dibuja la frase: un cero adentro es ruido", async () => {
    await pintar();
    fireEvent.click(within(tabla()).getByText("Fashion Shoes"));
    const frases = within(tabla()).queryAllByText(/Tienes a favor \$0\.00/);
    expect(frases).toHaveLength(0);
  });
});
