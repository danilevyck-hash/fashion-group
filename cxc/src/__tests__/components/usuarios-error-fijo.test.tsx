// 🔴 CANDADO — EL ERROR DE «NUEVO USUARIO» / «EDITAR USUARIO» NO SE VA SOLO
// (Daniel, 9-oct-2026). Salía 3 s como aviso negro: el del código de
// colaborador repetido (que sugiere el siguiente libre) no se alcanzaba a leer.
// Ahora es la caja roja de siempre (`CajaAviso`) y se queda hasta que se cierra
// con la ✕ o se corrige un campo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/usuarios",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: true }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));

import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import UsuariosPage from "@/app/admin/usuarios/page";
import { AVISO_CONTRASENA_REPETIDA } from "@/lib/auth/contrasena-en-uso";

const USUARIOS = [{ id: "u1", name: "jorman", role: "bodega", active: true, associated_company: null, modulos_override: null }];
const error = () => document.querySelector('[data-aviso="error"]');

async function abrirNuevo() {
  await act(async () => { render(<UsuariosPage />); });
  await screen.findAllByText(/jorman/i);
  fireEvent.click(screen.getAllByRole("button", { name: /Nuevo usuario/ })[0]);
}
const guardar = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); });
const pasan = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/admin/users")) {
      if (init?.method === "POST") return { ok: false, status: 400, json: async () => ({ error: AVISO_CONTRASENA_REPETIDA }) };
      return { ok: true, status: 200, json: async () => USUARIOS };
    }
    return { ok: true, status: 200, json: async () => [] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Usuarios › el error del formulario se queda", () => {
  it("sigue a los 30 s y se va al corregir el campo", async () => {
    await abrirNuevo();
    await guardar();
    expect(error()?.textContent).toContain("Nombre requerido");
    await pasan(30_000);
    expect(error()).not.toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Nombre del usuario"), { target: { value: "María" } });
    expect(error()).toBeNull();
  });

  it("el que contesta el servidor también se queda, y se cierra con la ✕", async () => {
    await abrirNuevo();
    fireEvent.change(screen.getByPlaceholderText("Nombre del usuario"), { target: { value: "María" } });
    fireEvent.change(screen.getByPlaceholderText("La que quieras"), { target: { value: "siney123" } });
    await guardar();
    expect(error()?.textContent).toContain("Esa contraseña ya está en uso. Se requiere una distinta.");
    await pasan(30_000);
    expect(error()).not.toBeNull();
    // El formulario sigue abierto: no se pierde lo escrito.
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(error()!.querySelector('button[aria-label="Cerrar"]')!);
    expect(error()).toBeNull();
  });
});
