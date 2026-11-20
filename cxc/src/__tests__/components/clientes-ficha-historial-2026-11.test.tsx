// `HISTORIAL_EN_FICHA_2026_11` (19-nov-2026, apagado): en la ficha del cliente
// cada fila de «Detalle por empresa» abre la MISMA hoja «Compras · Pagos» de CxC,
// también con saldo 0. Solo las 6 del grupo; la fila «Total» no abre nada.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import ClienteDetail, { type ClienteDetailData } from "@/app/clientes/[codigo]/ClienteDetail";
import { HISTORIAL_EN_FICHA_2026_11 } from "@/lib/cxc/historial-cliente";

vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: false }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/clientes/D-45",
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

/** D-45 con saldo 0: el caso que hoy no tiene camino al historial. */
const D45: ClienteDetailData = {
  cliente: {
    id: "u-45", codigo: "D-45", nombre: "Distribuidora Karen Viva Panama", razon_social: null,
    identificacion: null, dv: null, provincia: null, contacto: null, telefono: null, celular: null,
    email: null, notas: null, last_synced_at: null, updated_at: null, created_at: null,
  },
  anio: 2026,
  empresas: [
    { empresa: "vistana", compras: 1000, comprasAnterior: 800, debe: 0 },
    { empresa: "fashion_shoes", compras: 500, comprasAnterior: null, debe: 0 },
  ],
  compras_brutas: 1500,
  ultima_compra: null,
  ultimo_pago: null,
  pagos_por_fecha: [],
  documentos_con_saldo: 0,
  aging: [],
};

const FETCH = vi.fn(async () => ({ ok: true, json: async () => ({ meses: [] }) }));
beforeEach(() => {
  FETCH.mockClear();
  vi.stubGlobal("fetch", FETCH);
  window.sessionStorage.setItem("fg_modules", "[]");
});
afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("historial en la ficha", () => {
  it("el interruptor sale APAGADO hasta el sí de Daniel", () => {
    expect(HISTORIAL_EN_FICHA_2026_11).toBe(false);
  });

  it("apagado, ninguna fila se toca", () => {
    const { container } = render(<ClienteDetail initialData={D45} historial={false} />);
    expect(container.querySelectorAll("[data-fila-historial]").length).toBe(0);
  });

  it("prendido, la fila con saldo 0 abre «Compras · Pagos» de ESA empresa", async () => {
    const { container } = render(<ClienteDetail initialData={D45} historial />);
    // Una por empresa en el teléfono y otra en la computadora; el «Total», ninguna.
    const filas = container.querySelectorAll("[data-fila-historial]");
    expect([...filas].map((f) => f.getAttribute("data-fila-historial")).sort())
      .toEqual(["fashion_shoes", "fashion_shoes", "vistana", "vistana"]);
    fireEvent.click(filas[0]);
    await waitFor(() => expect(FETCH).toHaveBeenCalled());
    expect(String((FETCH.mock.calls[0] as unknown[])[0]))
      .toBe("/api/cxc/historial?codigo=D-45&empresa=vistana&tipo=compras");
  });

  it("una empresa fuera del grupo (Boston) no se toca", () => {
    const d = { ...D45, empresas: [...D45.empresas, { empresa: "boston", compras: 10, comprasAnterior: null, debe: 0 }] };
    const { container } = render(<ClienteDetail initialData={d} historial />);
    expect(container.querySelector('[data-fila-historial="boston"]')).toBeNull();
  });
});
