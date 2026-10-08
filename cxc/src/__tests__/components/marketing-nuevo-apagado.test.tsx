// ============================================================================
// 🔴 CANDADO — el Marketing nuevo se prende SOLO para administrador (8-oct-2026).
//
// Ángela usa Marketing todos los días: hasta que Daniel diga, ella (secretaria)
// y contabilidad ven el Marketing de HOY, byte por byte. Las fotos
// (`__snapshots__/marketing-hoy-*.html`) se sacaron con el código de ANTES del
// Marketing nuevo. Y con el interruptor vacío (`ROLES_MARKETING_NUEVO = []`),
// el administrador también ve el de hoy.
// ============================================================================
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

const estado = vi.hoisted(() => ({ role: "secretaria", rolesNuevo: ["admin"] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: estado.role, isOwner: false }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <header data-testid="encabezado" /> }));
// El interruptor, con la lista de roles que pide cada prueba.
vi.mock("@/lib/marketing/marketing-nuevo", () => ({
  veMarketingNuevo: (r: string) => estado.rolesNuevo.includes(r),
}));

import MarketingPageWrapper from "@/app/marketing/page";
import { ToastProvider } from "@/components/ToastSystem";

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const cuerpo = u.includes("/marcas") ? [{ id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH", activo: true }] : u.includes("cobros") ? { abiertos: [], cerrados: [], gastos: [] } : [];
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
afterEach(cleanup);

async function dibujar(role: string): Promise<string> {
  estado.role = role;
  const { container } = render(<MarketingPageWrapper />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container.innerHTML;
}

const FOTO = (n: string) => `./__snapshots__/marketing-hoy-${n}.html`;

describe("🔴 Marketing nuevo: solo administrador; los demás, la pantalla de hoy", () => {
  it("secretaria (Ángela) ve el Marketing de hoy, byte por byte", async () => {
    await expect(await dibujar("secretaria")).toMatchFileSnapshot(FOTO("secretaria"));
  });
  it("contabilidad ve el Marketing de hoy, byte por byte", async () => {
    await expect(await dibujar("contabilidad")).toMatchFileSnapshot(FOTO("contabilidad"));
  });
  it("con el interruptor vacío, el administrador también ve el de hoy", async () => {
    estado.rolesNuevo = [];
    await expect(await dibujar("admin")).toMatchFileSnapshot(FOTO("admin"));
    estado.rolesNuevo = ["admin"];
  });
  it("el administrador ve el Marketing nuevo: Por cobrar · Gastos · Impulsadoras", async () => {
    estado.rolesNuevo = ["admin"];
    estado.role = "admin";
    const { container } = render(
      <ToastProvider>
        <MarketingPageWrapper />
      </ToastProvider>,
    );
    await waitFor(() => expect(container.querySelector('[data-testid="marketing-nuevo"]')).toBeTruthy(), { timeout: 5000 });
    const html = container.innerHTML;
    expect(html).toContain(">Por cobrar<");
    expect(html).toContain(">Gastos<");
    expect(html).toContain(">Impulsadoras<");
  });
  it("el interruptor de verdad: hoy solo administrador", async () => {
    const real = await vi.importActual<typeof import("@/lib/marketing/marketing-nuevo")>("@/lib/marketing/marketing-nuevo");
    expect(real.ROLES_MARKETING_NUEVO).toEqual(["admin"]);
    expect(real.veMarketingNuevo("secretaria")).toBe(false);
    expect(real.veMarketingNuevo("contabilidad")).toBe(false);
  });
});
