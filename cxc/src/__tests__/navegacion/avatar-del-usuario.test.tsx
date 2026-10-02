// ============================================================================
// 🔴 EL MENÚ DEL USUARIO EN EL CELULAR ES UN AVATAR (2-oct-2026,
// `TAB_BAR_2026_10`, Daniel lo aprobó ese día).
//
// Con la barra de pestañas el ☰ redondo se fue. «Cambiar contraseña» y «Cerrar
// sesión» viven en un avatar con la inicial, arriba a la derecha (como App Store
// y Fotos): al tocarlo sube una hoja de vidrio con el nombre, el rol y las dos
// opciones. Gerente Multifashion y Marcación, sin barra, también lo usan. La
// hoja «Más» termina con las mismas dos.
//
// Mutaciones que caza: (1) vuelve el ☰ redondo · (2) el avatar no se dibuja o
// no abre la hoja · (3) la hoja pierde el nombre, el rol o una opción ·
// (4) «Cerrar sesión» deja de esperar el DELETE de /api/auth, no limpia la
// pestaña o no vuelve al login · (5) Marcación se queda sin avatar · (6) «Más»
// pierde «Cerrar sesión».
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), ruta: "/guias" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NotificationCenter", () => ({ default: () => null }));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null, NOVEDADES_AVISO: false }));

import AppHeader from "@/components/AppHeader";
import { TAB_BAR_2026_10 } from "@/lib/navegacion/tab-bar";

const fetchMock = vi.fn();

function montar(rol: string, nombre: string, ruta = "/guias", modulo = "Guías de despacho") {
  nav.ruta = ruta;
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_user_name", nombre);
  return render(<AppHeader module={modulo} />);
}

const avatar = () => document.querySelector("[data-avatar-usuario]") as HTMLButtonElement | null;
const hoja = () => document.querySelector('[role="dialog"][aria-label="Tu cuenta"]') as HTMLElement;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ orden: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  nav.push.mockReset();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("el avatar del usuario en el celular", () => {
  it("va prendido con la barra de pestañas (Daniel aprobó el 2-oct-2026)", () => {
    expect(TAB_BAR_2026_10).toBe(true);
  });

  it("reemplaza al ☰: hay avatar con la inicial y no hay botón redondo", async () => {
    montar("admin", "daniel levy");
    await waitFor(() => expect(avatar()).not.toBeNull());
    expect(avatar()!.textContent).toBe("D");
    expect(avatar()!.className).toContain("sm:hidden");
    expect(document.querySelector("[data-boton-flotante]")).toBeNull();
    // La fila del título le deja sitio.
    expect(document.querySelector("[data-titulo-modulo]")?.hasAttribute("data-fila-del-avatar")).toBe(true);
  });

  it("abre una hoja de vidrio con el nombre, el rol, «Cambiar contraseña» y «Cerrar sesión»", async () => {
    montar("admin", "daniel levy");
    await waitFor(() => expect(avatar()).not.toBeNull());
    expect(hoja().className).toContain("hidden");
    fireEvent.click(avatar()!);
    const h = hoja();
    expect(h.className).toContain("flex");
    expect(h.querySelector(".vidrio")).not.toBeNull();
    const d = within(h);
    // 2-oct-2026: el nombre VISIBLE, capitalizado (`nombre-en-pantalla.ts`).
    expect(d.getByText("Daniel Levy")).toBeTruthy();
    expect(d.getByText("Administrador")).toBeTruthy();
    expect(d.getByRole("button", { name: "Cambiar contraseña" })).toBeTruthy();
    expect(d.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  it("🔴 «Cerrar sesión» cierra la sesión igual que hoy: espera el DELETE, limpia y vuelve al login", async () => {
    let soltar!: () => void;
    montar("admin", "daniel levy");
    await waitFor(() => expect(avatar()).not.toBeNull());
    fetchMock.mockImplementation((url: string) =>
      url === "/api/auth"
        ? new Promise((r) => { soltar = () => r({ ok: true, json: async () => ({}) }); })
        : Promise.resolve({ ok: true, json: async () => ({ orden: [] }) }),
    );
    fireEvent.click(avatar()!);
    fireEvent.click(within(hoja()).getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth", { method: "DELETE" }));
    // Mientras el servidor no revoca, no se navega.
    expect(nav.push).not.toHaveBeenCalled();
    soltar();
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    expect(sessionStorage.getItem("cxc_role")).toBeNull();
  });

  it("Marcación, sin barra, también tiene el avatar y ya no tiene ☰", async () => {
    montar("marcacion", "rodrigo", "/marcacion", "Marcación");
    await waitFor(() => expect(avatar()).not.toBeNull());
    expect(document.querySelector("[data-tab-bar]")).toBeNull();
    expect(document.querySelector("[data-boton-flotante]")).toBeNull();
  });

  it("Gerente Multifashion, sin barra, también: y sin ☰", async () => {
    montar("gerente_acs", "jennifer", "/multifashion", "Multifashion");
    await waitFor(() => expect(avatar()).not.toBeNull());
    expect(document.querySelector("[data-tab-bar]")).toBeNull();
    expect(document.querySelector("[data-boton-flotante]")).toBeNull();
  });

  it("la hoja «Más» de la barra termina con «Cambiar contraseña» y «Cerrar sesión»", async () => {
    montar("admin", "daniel levy");
    const mas = await screen.findByRole("button", { name: "Más módulos" });
    fireEvent.click(mas);
    const menu = await waitFor(() => {
      // 2-oct-2026: «Más» es una hoja sobre la pantalla (`HojaMas`).
      const el = document.querySelector("[data-hoja-mas-modulos]");
      if (!el) throw new Error("«Más» no abrió");
      return el as HTMLElement;
    });
    const botones = [...menu.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(botones.at(-1)).toBe("Cerrar sesión");
    expect(botones.at(-2)).toMatch(/contraseña/i);
  });
});
