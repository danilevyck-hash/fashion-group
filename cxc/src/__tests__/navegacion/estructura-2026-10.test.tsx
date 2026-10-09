// ============================================================================
// 🔴 ESTRUCTURA COMÚN ESTILO APPLE (1-oct-2026, `ESTRUCTURA_APPLE_2026_10`).
//
// Lo que este candado congela:
//   1. (2-oct-2026: Daniel aprobó las capturas el 2-oct-2026: «sí»; el
//      interruptor queda PRENDIDO.) Apagado —el control al revés, que cada
//      prueba fuerza con `sw.apple = false`— todo queda como hoy: la campana,
//      la llave y «Cerrar sesión» sueltos, el camino de migas en su tira, la
//      barra lateral de grupos y, en el Inicio, «Accesos frecuentes» y el modo
//      oscuro.
//   2. Prendido, SOLO cambia la pantalla: la barra lateral ofrece EXACTAMENTE
//      los mismos módulos, con las mismas direcciones, que la de hoy para cada
//      rol; el clic se sigue anotando igual; «Cerrar sesión» hace lo MISMO
//      (DELETE /api/auth, limpia la pestaña y vuelve al login); el camino de
//      migas lleva a los mismos lugares.
//   3. El botón del usuario ofrece dos cosas y en este orden: «Cambiar
//      contraseña» y «Cerrar sesión».
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), ruta: "/despachos" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

const sw = vi.hoisted(() => ({ apple: false }));
vi.mock("@/lib/navegacion/estructura-2026-10", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/estructura-2026-10")>();
  return { ...real, get ESTRUCTURA_APPLE_2026_10() { return sw.apple; } };
});

vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NotificationCenter", () => ({ default: () => <span data-campana /> }));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null, NOVEDADES_AVISO: false }));

import AppHeader from "@/components/AppHeader";
import Sidebar from "@/components/Sidebar";
import HomePage from "@/app/home/page";
import { getVisibleGroups, getModulesInGroup, GROUPS } from "@/lib/modules";
import { OPCIONES_DEL_USUARIO } from "@/lib/navegacion/estructura-2026-10";

const almacen = () => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => { datos.set(k, String(v)); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  } as unknown as Storage;
};

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

function sesion(rol: string, modulos: string[] | null = null) {
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_user_name", "daniel");
  if (modulos) sessionStorage.setItem("fg_modules", JSON.stringify(modulos));
}

/** Los módulos que la barra de HOY ofrece a un rol, con su dirección. */
function modulosDeHoy(rol: string, modulos: string[] | null) {
  return getVisibleGroups(rol, modulos)
    .flatMap((g) => getModulesInGroup(g.key, rol, modulos))
    .map((m) => m.href)
    .sort();
}

beforeEach(() => {
  sw.apple = false;
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.ruta = "/despachos";
  sessionStorage.clear();
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 el interruptor está prendido (2-oct-2026) y apagado todo queda como hoy", () => {
  // 2-oct-2026: antes fijaba «nace apagado». Daniel aprobó las capturas el
  // 2-oct-2026: «sí». Las pruebas de la versión de hoy fuerzan false solas.
  it("el valor del archivo es true", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/estructura-2026-10")>(
      "@/lib/navegacion/estructura-2026-10",
    );
    expect(real.ESTRUCTURA_APPLE_2026_10).toBe(true);
  });

  it("encabezado de hoy: campana, llave, «Cerrar sesión» y la tira del camino", () => {
    sesion("admin");
    render(<AppHeader module="Despachos" />);
    expect(document.querySelector("[data-campana]")).not.toBeNull();
    expect(screen.getAllByLabelText("Cambiar mi contraseña").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Cerrar sesión")).toBeTruthy();
    expect(document.querySelector("[data-camino-arriba]")).toBeNull();
    expect(document.querySelector("[data-menu-usuario]")).toBeNull();
  });

  it("barra lateral de hoy: la de grupos, no la nueva", async () => {
    sesion("admin");
    render(<Sidebar />);
    await waitFor(() => expect(document.querySelector("aside")).not.toBeNull());
    expect(document.querySelector("[data-barra-lateral-2026]")).toBeNull();
    for (const g of GROUPS) expect(screen.getAllByText(g.label).length).toBeGreaterThan(0);
  });

  // El modo oscuro se retiró del todo el 2-oct-2026 (`sin-modo-oscuro.test.ts`).
  it("Inicio de hoy: «Accesos frecuentes» sigue", async () => {
    sesion("admin");
    localStorage.setItem("fg_module_clicks_daniel", JSON.stringify({ guias: 3 }));
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText("Accesos frecuentes")).toBeTruthy());
    expect(screen.queryByLabelText("Modo oscuro")).toBeNull();
  });
});

describe("🔴 prendido, SOLO cambia la pantalla", () => {
  beforeEach(() => { sw.apple = true; });

  const ROLES: [string, string[] | null][] = [
    ["admin", null],
    ["secretaria", ["directorio", "marketing", "cheques", "caja", "comisiones", "guias", "reclamos", "catalogos", "cargar", "cxc"]],
    ["bodega", null],
    ["vendedor", null],
    ["contabilidad", null],
  ];

  it.each(ROLES)("la barra lateral ofrece los MISMOS módulos que hoy (%s)", async (rol, modulos) => {
    sesion(rol, modulos);
    render(<Sidebar />);
    await waitFor(() => expect(document.querySelector("[data-barra-lateral-2026]")).not.toBeNull());
    const hrefs = [...document.querySelectorAll("[data-barra-lateral-2026] nav a")]
      .map((a) => a.getAttribute("href")!)
      .filter((h) => h !== "/home")
      .sort();
    expect(hrefs).toEqual(modulosDeHoy(rol, modulos));
  });

  it("el clic a un módulo se sigue anotando igual que hoy", async () => {
    sesion("admin");
    render(<Sidebar />);
    await waitFor(() => expect(document.querySelector("[data-barra-lateral-2026]")).not.toBeNull());
    fireEvent.click(document.querySelector('[data-barra-lateral-2026] a[href="/despachos"]')!);
    expect(JSON.parse(localStorage.getItem("fg_module_clicks_daniel") || "{}")).toEqual({ guias: 1 });
  });

  it("encabezado: sin campana ni botones sueltos; el camino lleva a los mismos lugares", () => {
    sesion("admin");
    render(<AppHeader module="Despachos" breadcrumbs={[{ label: "GT-271" }]} />);
    expect(document.querySelector("[data-campana]")).toBeNull();
    expect(screen.queryByLabelText("Cambiar mi contraseña")).toBeNull();
    expect(screen.queryByLabelText("Cerrar sesión")).toBeNull();
    const camino = document.querySelector("[data-camino-arriba]") as HTMLElement;
    expect(camino.textContent).toBe("Inicio›Despachos›GT-271");
    const boton = (t: string) => [...camino.querySelectorAll("button")].find((b) => b.textContent === t)!;
    fireEvent.click(boton("Inicio"));
    expect(nav.push).toHaveBeenLastCalledWith("/home");
    fireEvent.click(boton("Despachos"));
    expect(nav.push).toHaveBeenLastCalledWith("/despachos");
  });

  it("el botón del usuario: dos opciones, y «Cerrar sesión» hace lo mismo que hoy", async () => {
    expect(OPCIONES_DEL_USUARIO).toEqual(["Cambiar contraseña", "Cerrar sesión"]);
    sesion("admin");
    render(<AppHeader module="Despachos" />);
    fireEvent.click(document.querySelector("[data-menu-usuario] button")!);
    const opciones = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(opciones).toEqual([...OPCIONES_DEL_USUARIO]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth", { method: "DELETE" });
    expect(sessionStorage.getItem("cxc_role")).toBeNull();
  });

  // 🩸 2-oct-2026: la ventana salió cortada arriba porque se dibujaba ADENTRO
  // del encabezado (sticky + transform + z-index 10). Tiene que vivir en <body>.
  it("«Cambiar contraseña» se abre en un portal, fuera del encabezado", () => {
    sesion("admin");
    render(<AppHeader module="Despachos" />);
    fireEvent.click(document.querySelector("[data-menu-usuario] button")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Cambiar contraseña" }));
    const titulo = screen.getByRole("heading", { name: "Cambiar mi contraseña" });
    const overlay = titulo.closest("[data-modal-overlay]")!;
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(document.querySelector("[data-encabezado]")!.contains(titulo)).toBe(false);
  });

  it("Inicio: sin «Accesos frecuentes» ni modo oscuro; los módulos siguen", async () => {
    sesion("admin");
    localStorage.setItem("fg_module_clicks_daniel", JSON.stringify({ guias: 3 }));
    render(<HomePage />);
    await waitFor(() => expect(document.querySelector("[data-menu-usuario]")).not.toBeNull());
    expect(screen.queryByText("Accesos frecuentes")).toBeNull();
    expect(screen.queryByLabelText("Modo oscuro")).toBeNull();
    // 9-oct-2026 (`INICIO_APPLE_2026_10` prendido): cada módulo sale dos veces,
    // en la lista del celular y en las fichas de la computadora. Las dos completas.
    for (const zona of ["lista-celular", "fichas"]) {
      const hrefs = [...document.querySelectorAll(`[data-inicio="${zona}"] a`)].map((a) => a.getAttribute("href")!).sort();
      expect(hrefs, zona).toEqual(modulosDeHoy("admin", null));
    }
    expect(document.querySelectorAll("a").length).toBe(2 * modulosDeHoy("admin", null).length);
  });
});
