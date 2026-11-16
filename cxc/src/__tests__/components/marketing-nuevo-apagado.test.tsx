// ============================================================================
// 🔴 CANDADO — el Marketing nuevo, prendido para TODOS los roles de Marketing
// (Daniel, 8-oct-2026: «sí, todos»).
//
// · Administrador, secretaria y contabilidad ven Por cobrar · Gastos ·
//   Impulsadoras.
// · Contabilidad SOLO MIRA: sin «＋ Gasto», «Cerrar», «Subir comprobante» ni
//   editar, y el servidor le contesta 403 aunque lo intente.
// · La secretaria registra y cierra (Daniel).
// · El Marketing de antes se borró el 8-oct-2026: la portada ES el nuevo.
// ============================================================================
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act, waitFor, screen, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

const TODOS = ["admin", "secretaria", "contabilidad"];
const estado = vi.hoisted(() => ({ role: "secretaria", rolesNuevo: ["admin", "secretaria", "contabilidad"] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: estado.role, isOwner: false }),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({ useSidebarCollapsed: () => false }));
vi.mock("@/components/AppHeader", () => ({ default: () => <header data-testid="encabezado" /> }));
// El interruptor, con la lista de roles que pide cada prueba.
vi.mock("@/lib/marketing/marketing-nuevo", () => ({
  veMarketingNuevo: (r: string) => estado.rolesNuevo.includes(r),
}));
// El cierre de verdad no se toca: solo se mira si el servidor lo deja pasar.
const cerrarCobro = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/app/api/marketing/cobros/cerrar-cobro", () => ({ cerrarCobro }));

import MarketingPageWrapper from "@/app/marketing/page";
import { ToastProvider } from "@/components/ToastSystem";
import { signSession } from "@/lib/session-cookie";

// Un cobro abierto de Tommy, un gasto y una impulsadora sin comprobante.
const LINEA = { tipo: "factura", documentoId: "f-1", fecha: "2026-10-01", concepto: "Letrero", proveedor: "Impresora", carpeta: "Tienda Uno", clienteCodigo: "D-1", monto: 100 };
const COBROS = {
  abiertos: [{ marcaCodigo: "TH", marcaNombre: "Tommy Hilfiger", periodoId: "p-1", periodoNombre: "Período 1", estado: "abierto", abiertoEn: "2026-09-01", cerradoEn: null, total: 100, lineas: [LINEA], fotosPorCarpeta: { "Tienda Uno": 2 }, tiendasSinFoto: [] }],
  cerrados: [],
  gastos: [{ id: "f-1", tipo: "factura", fecha: "2026-10-01", numero: "1", proveedor: "Impresora", concepto: "Letrero", marcaCodigo: "TH", marcaNombre: "Tommy Hilfiger", tiendaCodigo: "D-1", tiendaNombre: "Tienda Uno", monto: 100, aCobrar: 100, estado: "por_cobrar", motivo: null, impulsadoraId: null, impulsadoraMes: null, periodoId: "p-1" }],
};
const IMPULSADORAS = [{ id: "i-1", nombre: "Ana", monto_mensual: 500, marcas: [], mesAnterior: null, mesActual: null, mesesSinPagar: [] }];

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const cuerpo = u.includes("/marcas")
      ? [{ id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH", activo: true }]
      : u.includes("cobros")
        ? COBROS
        : u.endsWith("/impulsadoras")
          ? IMPULSADORAS
          : [];
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
afterEach(cleanup);

async function dibujarNuevo(role: string) {
  estado.role = role;
  render(
    <ToastProvider>
      <MarketingPageWrapper />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("marketing-nuevo")).toBeTruthy(), { timeout: 5000 });
}

const cookieDe = (role: string) => `cxc_session=${signSession({ role, userId: `u-${role}`, userName: role, sessionToken: "tok" })}`;

describe("🔴 Marketing nuevo: prendido para todos los roles de Marketing", () => {
  it.each(TODOS)("%s ve el Marketing nuevo: Por cobrar · Gastos · Impulsadoras", async (role) => {
    await dibujarNuevo(role);
    expect(screen.getByRole("tab", { name: "Por cobrar" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gastos" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Impulsadoras" })).toBeTruthy();
  });

  it.each([
    ["secretaria", true],
    ["contabilidad", false],
  ] as const)("%s: botones de escritura → %s", async (role, escribe) => {
    await dibujarNuevo(role);
    const ver = (n: HTMLElement | null) => expect(n !== null).toBe(escribe);
    // Por cobrar → el cobro de Tommy: «Cerrar».
    fireEvent.click(await screen.findByTestId("tarjeta-TH"));
    await screen.findByText("Tienda Uno");
    ver(screen.queryByRole("button", { name: "Cerrar" }));
    ver(screen.queryByRole("button", { name: "Excluir de este cierre" }));
    // Gastos: «＋ Gasto» y editar al tocar el renglón.
    fireEvent.click(screen.getByRole("tab", { name: "Gastos" }));
    await screen.findAllByTestId("fila-gasto");
    ver(screen.queryByRole("button", { name: "＋ Gasto" }));
    const antes = vi.mocked(globalThis.fetch).mock.calls.length;
    fireEvent.click(screen.getAllByTestId("fila-gasto")[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const abreFactura = vi.mocked(globalThis.fetch).mock.calls.slice(antes).some(([u]) => String(u).includes("/api/marketing/facturas/f-1"));
    expect(abreFactura).toBe(escribe);
    // Impulsadoras: «Subir comprobante».
    fireEvent.click(screen.getByRole("tab", { name: "Impulsadoras" }));
    await screen.findByTestId("impulsadora-Ana");
    ver(screen.queryByRole("button", { name: /Subir comprobante/ }));
  });

  it("el servidor: contabilidad no cierra ni registra (403); la secretaria sí cierra", async () => {
    const { POST: cerrar } = await import("@/app/api/marketing/cobros/cerrar/route");
    const { POST: pago } = await import("@/app/api/marketing/impulsadoras/[id]/pagos/route");
    const { PATCH: editar } = await import("@/app/api/marketing/facturas/[id]/route");
    const pedir = (url: string, role: string, method = "POST") =>
      new NextRequest(`http://localhost${url}`, {
        method,
        headers: { cookie: cookieDe(role), "content-type": "application/json" },
        body: JSON.stringify({ marcaCodigo: "TH", periodoId: "p-1", excluidos: [] }),
      });
    expect((await cerrar(pedir("/api/marketing/cobros/cerrar", "contabilidad"))).status).toBe(403);
    expect((await pago(pedir("/api/marketing/impulsadoras/i-1/pagos", "contabilidad"), { params: { id: "i-1" } })).status).toBe(403);
    expect((await editar(pedir("/api/marketing/facturas/f-1", "contabilidad", "PATCH"), { params: { id: "f-1" } })).status).toBe(403);
    expect(cerrarCobro).not.toHaveBeenCalled();
    expect((await cerrar(pedir("/api/marketing/cobros/cerrar", "secretaria"))).status).toBe(200);
    expect(cerrarCobro).toHaveBeenCalledTimes(1);
  });

  it("el interruptor de verdad: los mismos roles que entran a Marketing", async () => {
    const real = await vi.importActual<typeof import("@/lib/marketing/marketing-nuevo")>("@/lib/marketing/marketing-nuevo");
    const { ROLES_MARKETING } = await import("@/lib/marketing/roles");
    expect(real.ROLES_MARKETING_NUEVO).toEqual(ROLES_MARKETING);
    expect(ROLES_MARKETING).toEqual(TODOS);
    for (const r of TODOS) expect(real.veMarketingNuevo(r)).toBe(true);
    expect(real.veMarketingNuevo("vendedor")).toBe(false);
  });
});
