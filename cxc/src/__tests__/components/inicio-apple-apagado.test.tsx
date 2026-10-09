// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `INICIO_APPLE_2026_10` APAGADO = EL INICIO DE HOY, BYTE POR BYTE
// (9-oct-2026).
//
// Monta `/home` como admin (21 módulos) y como secretaria (sus 11) y compara el
// HTML entero contra `__snapshots__/inicio-apple-apagado…`. La foto se sacó con
// el código de `origin/main` ANTES del rediseño: con el interruptor apagado, un
// solo byte distinto pone esto rojo. PRENDIDO el 9-oct-2026 (Daniel): celular
// en lista y buscador alineado; en la computadora las fichas NO cambian (el
// bloque de abajo lo amarra).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/navegacion/inicio-apple-2026-10", () => ({
  get INICIO_APPLE_2026_10() { return interruptor.prendido; },
}));
const ROUTER = vi.hoisted(() => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));
vi.mock("@/components/SearchBar", () => ({
  SEARCH_ROLES: ["admin", "secretaria", "contabilidad", "vendedor", "bodega"],
  default: ({ alineado }: { alineado?: boolean }) => <div data-testid="buscador" data-alineado={alineado ? "1" : undefined} />,
}));
vi.mock("@/lib/fecha-panama", async (orig) => ({
  ...(await orig<typeof import("@/lib/fecha-panama")>()),
  hoyPanama: () => "2026-10-09",
}));

import { render, cleanup, act } from "@testing-library/react";
import HomePage from "@/app/home/page";

const SECRETARIA = ["directorio", "marketing", "cheques", "caja", "comisiones", "guias", "reclamos", "catalogos", "cargar", "cxc", "multifashion"];

async function montar(rol: "admin" | "secretaria") {
  sessionStorage.clear();
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_user_name", rol === "admin" ? "daniel" : "Angela");
  if (rol === "secretaria") sessionStorage.setItem("fg_modules", JSON.stringify(SECRETARIA));
  let vista: ReturnType<typeof render> | undefined;
  await act(async () => { vista = render(<HomePage />); });
  return vista!.container;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); interruptor.prendido = false; });

describe("Inicio — interruptor APAGADO = la pantalla de hoy", () => {
  it("admin: HTML idéntico al de origin/main", async () => {
    expect((await montar("admin")).innerHTML).toMatchSnapshot();
  });
  it("secretaria: HTML idéntico al de origin/main", async () => {
    expect((await montar("secretaria")).innerHTML).toMatchSnapshot();
  });
});

describe("Inicio — interruptor PRENDIDO (9-oct-2026, Daniel)", () => {
  it("el interruptor está prendido", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/inicio-apple-2026-10")>("@/lib/navegacion/inicio-apple-2026-10");
    expect(real.INICIO_APPLE_2026_10).toBe(true);
  });
  it("celular: lista agrupada con filas de 44 px y el ícono a color", async () => {
    interruptor.prendido = true;
    const c = await montar("admin");
    const lista = c.querySelector('[data-inicio="lista-celular"]');
    expect(lista).not.toBeNull();
    expect(lista!.className).toContain("sm:hidden");
    const filas = lista!.querySelectorAll("a");
    expect(filas.length).toBe(c.querySelectorAll('[data-inicio="fichas"] a').length);
    filas.forEach((a) => expect(a.className).toContain("min-h-[44px]"));
    expect(lista!.querySelector("svg")!.getAttribute("class")).not.toContain("text-gray-500");
  });
  it("computadora: las fichas de los módulos quedan como estaban (Daniel: las horizontales NO)", async () => {
    const apagado = (await montar("secretaria")).querySelector(".space-y-6")!;
    const deAntes = apagado.innerHTML;
    cleanup();
    interruptor.prendido = true;
    const fichas = (await montar("secretaria")).querySelector('[data-inicio="fichas"]')!;
    // Las MISMAS fichas, byte por byte; solo se esconden en el celular.
    expect(fichas.innerHTML).toBe(deAntes);
    expect(fichas.className).toBe("hidden space-y-6 sm:block");
    expect(fichas.querySelectorAll("a").length).toBe(SECRETARIA.length);
    fichas.querySelectorAll("a").forEach((a) => expect(a.className).toContain("flex-col"));
  });
  it("el buscador va alineado con el contenido", async () => {
    interruptor.prendido = true;
    const c = await montar("admin");
    expect(c.querySelector('[data-testid="buscador"]')!.getAttribute("data-alineado")).toBe("1");
  });
});
