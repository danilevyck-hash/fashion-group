// ============================================================================
// 🔴 «MÁS» ES UNA HOJA SOBRE LA PANTALLA, NO OTRA PANTALLA (2-oct-2026).
//
// Daniel, en su iPhone: «¿por qué Más me lleva a esa pantalla y no a la que
// estaba?». Tocar «Más» abría el menú viejo a pantalla completa («Menú», con ×)
// y se perdía la pantalla de atrás. Ahora sube una hoja de vidrio de ~70 % con
// agarre, con el buscador, los módulos que NO están en la barra y la cuenta.
//
// Mutaciones que caza: (1) «Más» vuelve a abrir el menú a pantalla completa ·
// (2) «Más» navega · (3) la hoja repite un módulo de la barra o pierde uno que
// no está · (4) pierde el buscador, el agarre, el vidrio o la cuenta ·
// (5) cerrar (×, afuera, Escape, deslizar) navega o mueve la pantalla de atrás ·
// (6) un deslizamiento corto la cierra · (7) «Más» se ve activo cerrada ·
// (8) el nombre sale como el usuario de login («daniel»).
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
import { TAB_BAR_2026_10, pestanasDelRol } from "@/lib/navegacion/tab-bar";
import { gruposDelCajon } from "@/lib/navegacion/cajon-por-grupos";
import { casaDelRol } from "@/lib/navegacion/casa-del-rol";
import { ALTO_HOJA_MAS } from "@/components/estructura/HojaMas";

const fetchMock = vi.fn();
const scrollTo = vi.fn();

function montar() {
  nav.ruta = "/guias";
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  sessionStorage.setItem("fg_user_display_name", "DANIEL LEVY");
  return render(<AppHeader module="Guías de despacho" />);
}
const hoja = () => document.querySelector("[data-hoja-mas-modulos]") as HTMLElement | null;
async function abrir() {
  fireEvent.click(await screen.findByRole("button", { name: "Más módulos" }));
  return waitFor(() => {
    const h = hoja();
    if (!h) throw new Error("«Más» no abrió la hoja");
    return h;
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ orden: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  nav.push.mockReset();
  scrollTo.mockReset();
  vi.stubGlobal("scrollTo", scrollTo);
  Object.defineProperty(window, "scrollY", { value: 640, configurable: true });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("«Más» es una hoja sobre la pantalla", () => {
  it("la barra está prendida", () => {
    expect(TAB_BAR_2026_10).toBe(true);
  });

  it("abre una hoja de vidrio de 70 % con agarre, sin navegar y sin el menú a pantalla completa", async () => {
    montar();
    const h = await abrir();
    expect(nav.push).not.toHaveBeenCalled();
    expect(document.querySelector("[data-menu-pantalla]")).toBeNull();
    const panel = h.querySelector(".vidrio") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.style.height).toBe(ALTO_HOJA_MAS);
    expect(ALTO_HOJA_MAS).toBe("70dvh");
    expect(h.querySelector("[data-agarre]")).not.toBeNull();
    expect(within(h).getByLabelText("Buscar un módulo")).toBeTruthy();
  });

  it("muestra SOLO los módulos que no están en la barra, agrupados", async () => {
    montar();
    const h = await abrir();
    const enLaBarra = new Set([casaDelRol("admin", null), ...pestanasDelRol("admin", null, [], casaDelRol("admin", null)).map((m) => m.href)]);
    const grupos = gruposDelCajon("admin", null);
    for (const g of grupos) {
      for (const m of g.modulos) {
        const fila = within(h).queryByRole("button", { name: new RegExp(`^${m.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*›$`) });
        if (enLaBarra.has(m.href)) expect(fila, `${m.label} está en la barra`).toBeNull();
        else expect(fila, `${m.label} falta en «Más»`).not.toBeNull();
      }
      if (g.modulos.some((m) => !enLaBarra.has(m.href))) within(h).getByText(g.label);
    }
  });

  it("termina con la cuenta: el nombre visible, «Cambiar contraseña» y «Cerrar sesión»", async () => {
    montar();
    const h = await abrir();
    const cuenta = h.querySelector("[data-cuenta]") as HTMLElement;
    within(cuenta).getByText("Daniel Levy");
    expect(within(cuenta).queryByText("daniel")).toBeNull();
    const botones = [...h.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(botones.at(-1)).toBe("Cerrar sesión");
    expect(botones.at(-2)).toBe("Cambiar contraseña");
  });

  it("«Más» se ve activo SOLO con la hoja abierta", async () => {
    montar();
    const mas = await screen.findByRole("button", { name: "Más módulos" });
    expect(mas.className).not.toContain("bg-black/[0.06]");
    fireEvent.click(mas);
    await waitFor(() => expect(mas.className).toContain("bg-black/[0.06]"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(mas.className).not.toContain("bg-black/[0.06]"));
  });

  it("se cierra con ×, tocando afuera y con Escape — sin navegar y sin mover la pantalla de atrás", async () => {
    montar();
    let h = await abrir();
    expect(document.body.style.top).toBe("-640px");
    fireEvent.click(within(h).getAllByRole("button", { name: "Cerrar" }).at(-1)!);
    await waitFor(() => expect(hoja()).toBeNull());
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);

    h = await abrir();
    fireEvent.click(within(h).getAllByRole("button", { name: "Cerrar" })[0]);
    await waitFor(() => expect(hoja()).toBeNull());

    await abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(hoja()).toBeNull());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("deslizar hacia abajo la cierra; un deslizamiento corto, no", async () => {
    montar();
    const h = await abrir();
    const agarre = h.querySelector("[data-agarre]")!.parentElement!;
    fireEvent.pointerDown(agarre, { clientY: 100 });
    fireEvent.pointerMove(agarre, { clientY: 140 });
    fireEvent.pointerUp(agarre, { clientY: 140 });
    expect(hoja()).not.toBeNull();
    fireEvent.pointerDown(agarre, { clientY: 100 });
    fireEvent.pointerMove(agarre, { clientY: 300 });
    fireEvent.pointerUp(agarre, { clientY: 300 });
    await waitFor(() => expect(hoja()).toBeNull());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("elegir un módulo navega", async () => {
    montar();
    const h = await abrir();
    fireEvent.click(within(h).getByRole("button", { name: /^Proveedores/ }));
    expect(nav.push).toHaveBeenCalledWith("/proveedores");
  });
});
