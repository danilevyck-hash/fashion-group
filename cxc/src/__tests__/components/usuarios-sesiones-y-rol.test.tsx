// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Usuarios › Sesiones activas y el selector de Rol (16-nov-2026,
// errores de los videos #31 y #41).
//
// #31: en el celular el nombre se cortaba cuando la persona tenía 2+ sesiones
// («Cerrar todas (N)» se comía el ancho) y el rol salía CRUDO («Marcacion»,
// «Gerente_acs» por `capitalize`). Ahora el rol sale de `etiquetaDeRol` y el
// renglón baja los botones a una segunda línea: nada se corta.
// #41: los dos gerentes no tenían descripción en el selector de Rol.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/usuarios",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: true }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));

import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import UsuariosPage from "@/app/admin/usuarios/page";
import { DESCRIPCION_DEL_ROL } from "@/lib/roles-etiquetas";
import { SYSTEM_ROLES } from "@/lib/modules";

const USUARIOS = [
  { id: "u1", name: "jennifer", role: "gerente_acs", active: true, associated_company: null, modulos_override: null },
  { id: "u2", name: "cindy", role: "marcacion", active: true, associated_company: null, modulos_override: null },
];
const SESIONES = [
  { id: "s1", user_name: "jennifer", user_role: "gerente_acs", ip_address: "1.2.3.4", last_seen: new Date().toISOString(), created_at: new Date().toISOString(), revoked: false },
  { id: "s2", user_name: "jennifer", user_role: "gerente_acs", ip_address: null, last_seen: new Date().toISOString(), created_at: new Date().toISOString(), revoked: false },
  { id: "s3", user_name: "cindy", user_role: "marcacion", ip_address: null, last_seen: new Date().toISOString(), created_at: new Date().toISOString(), revoked: false },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/admin/users")) return { ok: true, status: 200, json: async () => USUARIOS };
    if (String(url).includes("/api/admin/sessions")) return { ok: true, status: 200, json: async () => SESIONES };
    return { ok: true, status: 200, json: async () => [] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirSesiones() {
  let v: ReturnType<typeof render> | undefined;
  await act(async () => { v = render(<UsuariosPage />); });
  await screen.findAllByText(/jennifer/i);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sesiones activas/ })); });
  return v!.container;
}

describe("#31 Sesiones activas", () => {
  it("el rol sale con su nombre de pantalla, nunca crudo", async () => {
    const c = await abrirSesiones();
    const texto = c.textContent ?? "";
    expect(texto).toContain("Gerente Multifashion");
    expect(texto).toContain("Marcación");
    expect(texto).not.toMatch(/gerente_acs|\bmarcacion\b/i);
  });

  it("el nombre no se corta: sin `truncate` y los botones bajan a otra línea en el celular", async () => {
    const c = await abrirSesiones();
    const fila = c.querySelector('[data-sesion="s1"]')!;
    expect(fila.textContent).toContain("Cerrar todas (2)");
    expect(fila.querySelector(".truncate")).toBeNull();
    expect(fila.className).toContain("flex-wrap");
    const acciones = fila.querySelector("[data-sesion-acciones]")!;
    expect(acciones.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(acciones.className).toContain("sm:w-auto");
  });
});

describe("#41 selector de Rol", () => {
  it("todos los roles del sistema tienen descripción", () => {
    for (const r of SYSTEM_ROLES) {
      expect(DESCRIPCION_DEL_ROL[r.key], r.key).toMatch(new RegExp(`^${r.label} — .+`));
    }
  });
});
