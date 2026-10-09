// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `INICIO_APPLE_2026_10` APAGADO = EL INICIO DE HOY, BYTE POR BYTE
// (9-oct-2026).
//
// Monta `/home` como admin (21 módulos) y como secretaria (sus 11) y compara el
// HTML entero contra `__snapshots__/inicio-apple-apagado…`. La foto se sacó con
// el código de `origin/main` ANTES del rediseño: con el interruptor apagado, un
// solo byte distinto pone esto rojo. Prendido, también se pone rojo (verificado
// al escribirlo) y el bloque de abajo dice qué trae la propuesta.
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

describe("Inicio — interruptor PRENDIDO = la propuesta", () => {
  it("celular: lista agrupada con filas de 44 px y el ícono a color", async () => {
    interruptor.prendido = true;
    const c = await montar("admin");
    const lista = c.querySelector('[data-inicio="lista-celular"]');
    expect(lista).not.toBeNull();
    const filas = lista!.querySelectorAll("a");
    expect(filas.length).toBe(c.querySelectorAll('[data-inicio="fichas"] a').length);
    filas.forEach((a) => expect(a.className).toContain("min-h-[44px]"));
    expect(lista!.querySelector("svg")!.getAttribute("class")).not.toContain("text-gray-500");
  });
  it("computadora: fichas horizontales con el ícono a color", async () => {
    interruptor.prendido = true;
    const c = await montar("secretaria");
    const fichas = c.querySelectorAll('[data-inicio="fichas"] a');
    expect(fichas.length).toBe(SECRETARIA.length);
    fichas.forEach((a) => expect(a.className).not.toContain("flex-col"));
  });
  it("el buscador va alineado con el contenido", async () => {
    interruptor.prendido = true;
    const c = await montar("admin");
    expect(c.querySelector('[data-testid="buscador"]')!.getAttribute("data-alineado")).toBe("1");
  });
});
