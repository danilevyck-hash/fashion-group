// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `USUARIOS_APPLE_2026_10` APAGADO = USUARIOS DE HOY, BYTE POR BYTE
// (9-oct-2026).
//
// Pinta la pestaña Usuarios con cinco usuarios de roles distintos (uno
// inactivo, uno con permisos personalizados) y compara el HTML entero contra
// `__snapshots__/usuarios-apple-apagado…`, sacado con el código de
// `origin/main` ANTES del rediseño. PRENDIDO el 9-oct-2026 (Daniel): el bloque
// de abajo dice qué trae.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/usuarios-apple-2026-10", () => ({
  get USUARIOS_APPLE_2026_10() { return interruptor.prendido; },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/usuarios",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: true }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));

import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import UsuariosPage from "@/app/admin/usuarios/page";

const AHORA = new Date("2026-10-09T15:00:00.000Z");
const USUARIOS = [
  { id: "u1", name: "jorman", role: "bodega", active: true, associated_company: null, modulos_override: ["guias", "catalogos", "referencia"] },
  { id: "u2", name: "daniel", role: "admin", active: true, associated_company: null, modulos_override: null },
  { id: "u3", name: "edwin", role: "vendedor", active: true, associated_company: "vistana", modulos_override: null },
  { id: "u4", name: "Angela", role: "secretaria", active: true, associated_company: null, modulos_override: ["cheques", "caja"] },
  { id: "u5", name: "pedro", role: "bodega", active: false, associated_company: null, modulos_override: null },
];
const SESIONES = [
  { id: "s1", user_name: "daniel", user_role: "admin", ip_address: "1.2.3.4", last_seen: "2026-10-09T14:00:00.000Z", created_at: "2026-10-09T10:00:00.000Z", revoked: false },
  { id: "s2", user_name: "jorman", user_role: "bodega", ip_address: null, last_seen: "2026-10-08T15:00:00.000Z", created_at: "2026-10-08T10:00:00.000Z", revoked: false },
];

async function pintar() {
  let v: ReturnType<typeof render> | undefined;
  await act(async () => { v = render(<UsuariosPage />); });
  await screen.findAllByText(/jorman/i);
  return v!.container;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AHORA);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/admin/users")) return { ok: true, status: 200, json: async () => USUARIOS };
    if (String(url).includes("/api/admin/sessions")) return { ok: true, status: 200, json: async () => SESIONES };
    return { ok: true, status: 200, json: async () => [] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); interruptor.prendido = false; });

describe("Usuarios — interruptor APAGADO = la pantalla de hoy", () => {
  it("la pestaña Usuarios: HTML idéntico al de origin/main", async () => {
    // La fecha del `title` sale con `toLocaleString`, que depende del huso de
    // la máquina (Panamá aquí, UTC en GitHub): se compara sin ella.
    const html = (await pintar()).innerHTML.replace(/title="[^"]*\d:\d\d[^"]*"/g, 'title="(fecha)"');
    expect(html).toMatchSnapshot();
  });
});

describe("Usuarios — interruptor PRENDIDO (9-oct-2026, Daniel)", () => {
  it("el interruptor está prendido", async () => {
    const real = await vi.importActual<typeof import("@/lib/usuarios-apple-2026-10")>("@/lib/usuarios-apple-2026-10");
    expect(real.USUARIOS_APPLE_2026_10).toBe(true);
  });
  it("agrupada por rol, en el orden de los roles del sistema", async () => {
    interruptor.prendido = true;
    const c = await pintar();
    const grupos = [...c.querySelectorAll("[data-usuarios-rol]")].map((g) => g.getAttribute("data-usuarios-rol"));
    expect(grupos).toEqual(["admin", "secretaria", "bodega", "vendedor"]);
  });
  it("«Activo» no se repite; «Inactivo» sí se dice", async () => {
    interruptor.prendido = true;
    const c = await pintar();
    const filas = [...c.querySelectorAll("[data-usuario-fila]")];
    expect(filas.some((f) => /\bActivo\b/.test(f.textContent ?? ""))).toBe(false);
    expect(c.querySelector('[data-usuario-fila="u5"]')!.textContent).toMatch(/Inactivo/);
  });
  it("el nombre como se escribe, y tocar el renglón abre «Editar usuario»", async () => {
    interruptor.prendido = true;
    const c = await pintar();
    expect(c.querySelector('[data-usuario-fila="u2"]')!.textContent).toMatch(/Daniel/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Editar daniel/ })); });
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
