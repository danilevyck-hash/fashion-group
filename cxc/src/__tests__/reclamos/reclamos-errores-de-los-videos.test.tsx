// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — TRES ERRORES QUE ENCONTRARON LOS VIDEOS (16-nov-2026).
//
// #2  Tras «Enviar correo» (o bajar el Excel / PDF) el reclamo seguía «Sin
//     reclamar» en pantalla: el servidor marcaba `reclamado_en`, pero la
//     pantalla solo releía la LISTA, nunca el reclamo abierto. Y la portada
//     tardaba ~30 s: la caché de navegación de Next (`staleTimes.dynamic: 30`)
//     devolvía la lista de ANTES y `useSembrarDelServidor` la escribía encima
//     de la nueva. Ahora: se relee el reclamo abierto y se vacía esa caché
//     (`router.refresh()`).
// #3  La portada pintaba «el más viejo N días» en ROJO siempre (74 días
//     incluido); la lista, desde 120. Un solo corte: `diasEnRojo`.
// #4  «Registrar cobro» venía con `toFixed(2)` del total (170,665 → «170.66»)
//     y el servidor congela el total con `Math.round(x*100)/100` (170,67):
//     quedaba «Pendiente $0.01». Un solo redondeo: `aCentavos`.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => params,
  useRouter: () => router,
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: false }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
// El modal del correo se reemplaza por un botón que hace lo que hace el modal
// cuando Resend confirma: llamar `onSent`.
vi.mock("@/app/reclamos/components/EnviarProveedorModal", () => ({
  default: ({ onSent }: { onSent: (m: string) => void }) => (
    <button type="button" data-testid="correo-confirmado" onClick={() => onSent("Correo enviado")}>simular</button>
  ),
}));

import ReclamosClient from "@/app/reclamos/ReclamosClient";
import SettlementModal from "@/app/reclamos/components/SettlementModal";
import { HojaCobrar } from "@/app/reclamos/components/celular/HojasReclamosCelular";
import PortadaCelular from "@/app/reclamos/components/celular/PortadaCelular";
import EmpresaSelector from "@/app/reclamos/components/EmpresaSelector";
import { emptyItem } from "@/app/reclamos/components/constants";
import type { Reclamo } from "@/app/reclamos/components/types";
import { reclamoTaxes, aCentavos } from "@/lib/reclamos/tax";
import { lineaEmpresa } from "@/lib/reclamos/celular";
import { DIAS_RECLAMO_VIEJO } from "@/lib/reclamos/viejos";
import { hoyPanama } from "@/lib/fecha-panama";

const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: () => null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos-videos"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
  router.refresh.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); params = new URLSearchParams(); });

const HOY = hoyPanama();
function haceDias(n: number): string {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}
const noop = () => {};
const mk = (o: Partial<Reclamo> & { id: string; precio?: number }): Reclamo => ({
  nro_reclamo: o.id, empresa: "Fashion Wear", proveedor: "American Fashion Wear", marca: "Tommy Hilfiger",
  nro_factura: "2000013690", nro_orden_compra: "", fecha_reclamo: "2026-06-11", fecha_factura: haceDias(74),
  estado: "Creado", notas: "", created_at: "2026-06-11T10:00:00Z", reclamado_en: null,
  reclamo_items: [{ ...emptyItem(), referencia: "R", descripcion: "D", cantidad: 1, precio_unitario: o.precio ?? 145 }],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
  ...o,
});

describe("#2 · tras «Enviar correo» el reclamo abierto dice «Reclamado» al instante", () => {
  it("relee el reclamo, y vacía la caché de navegación para que la portada no vuelva vieja", async () => {
    const antes = mk({ id: "R1" });
    const despues = { ...antes, reclamado_en: `${HOY}T15:00:00Z` };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.startsWith("/api/reclamos/R1") ? despues
        : url.startsWith("/api/reclamos/contactos") ? []
        : url.startsWith("/api/reclamos") ? [despues] : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    params = new URLSearchParams("view=detail&id=R1&empresa=Fashion%20Wear");
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ReclamosClient initialData={{ reclamos: [antes], contactos: [], detail: antes }} />
      </SWRConfig>,
    );
    const detalle = () => document.querySelector(".hidden.sm\\:block") as HTMLElement;
    expect(within(detalle()).getAllByText("Sin reclamar").length).toBeGreaterThan(0);

    fireEvent.click(within(detalle()).getByTestId("correo-confirmado"));

    await waitFor(() => expect(within(detalle()).queryByText("Sin reclamar")).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("#3 · la portada pinta rojo con el MISMO corte que la lista", () => {
  it("lineaEmpresa: 74 días no es rojo; el corte sí", () => {
    expect(lineaEmpresa(3, 74).rojo).toBe(false);
    expect(lineaEmpresa(3, DIAS_RECLAMO_VIEJO).rojo).toBe(true);
    expect(lineaEmpresa(3, null).rojo).toBe(false);
  });

  const reclamos = [mk({ id: "FW-1", fecha_factura: haceDias(74) })];
  const props = { role: "admin", reclamos, loading: false, contactos: [], globalSearch: "", setGlobalSearch: noop, onNewReclamo: noop, onSelectEmpresa: noop, onLoadDetail: noop };

  it("computadora: «el más viejo 74 días» NO va en rojo", () => {
    render(<EmpresaSelector {...props} apple sinEncabezado />);
    const lista = document.querySelector('[data-lista="reclamos-empresas-apple"]') as HTMLElement;
    const span = within(lista).getByText(/el más viejo 74 días/);
    expect(span.className).not.toContain("text-red-600");
  });

  it("celular: «el más viejo 74 días» NO va en rojo", () => {
    render(<PortadaCelular {...props} apple />);
    const lista = document.querySelector('[data-lista="reclamos-empresas"]') as HTMLElement;
    const span = within(lista).getByText(/el más viejo 74 días/);
    expect(span.className).not.toContain("text-red-600");
  });

  it("celular: a los 120 días sí va en rojo", () => {
    render(<PortadaCelular {...props} reclamos={[mk({ id: "FW-2", fecha_factura: haceDias(DIAS_RECLAMO_VIEJO) })]} apple />);
    const lista = document.querySelector('[data-lista="reclamos-empresas"]') as HTMLElement;
    expect(within(lista).getByText(new RegExp(`el más viejo ${DIAS_RECLAMO_VIEJO} días`)).className).toContain("text-red-600");
  });
});

describe("#4 · un total de medio centavo ($170,665) se cobra entero", () => {
  const total = reclamoTaxes("Fashion Wear", 145).total; // 145 × 1,177 = 170,665

  it("el total y lo que congela el servidor son el mismo número: 170,67", () => {
    expect(aCentavos(total)).toBe(170.67);
  });

  it("computadora: el monto viene puesto en 170.67, no 170.66", () => {
    render(<SettlementModal open reclamado={total} submitting={false} onClose={noop} onSubmit={noop} />);
    expect((screen.getByLabelText(/monto/i, { selector: "input" }) as HTMLInputElement).value).toBe("170.67");
  });

  it("celular: el monto viene puesto en 170.67, no 170.66", () => {
    render(<HojaCobrar nroReclamo="R1" reclamado={total} requiereComprobante={false} guardando={false} onCerrar={noop} onCobrar={noop} />);
    expect((screen.getByLabelText("Monto recuperado") as HTMLInputElement).value).toBe("170.67");
  });
});
