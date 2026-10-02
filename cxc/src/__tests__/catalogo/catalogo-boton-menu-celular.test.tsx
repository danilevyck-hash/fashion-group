// ============================================================================
// 🔴 EL CATÁLOGO INTERNO TAMBIÉN TIENE EL ☰ REDONDO DEL CELULAR (2-oct-2026).
//
// 🩸 Daniel: el catálogo sin el botón de menú «no hace sentido». Las pantallas
// del catálogo con sesión —el catálogo de cada marca, Comprobantes, el pedido—
// no montan `AppHeader` (su encabezado es la navbar de la marca), así que en
// el celular no había por dónde ir a otro módulo.
//
// Lo que este candado congela:
//   1. `AppHeader soloMenuDelCelular` dibuja el botón y NADA más: ni la franja
//      de la computadora ni el título grande.
//   2. El layout del catálogo con sesión lo monta; el catálogo PÚBLICO y los
//      pedidos públicos NO (los ve el cliente sin sesión).
//   3. La barra del carrito publica su alto en `--fg-alto-barra-fija`, así el
//      botón se sienta encima y no tapa «Ver pedido».
//
// Mutaciones que caza: (a) quitar el AppHeader del layout · (b) montarlo en
// una ruta pública · (c) dibujar la franja o el título en modo solo menú ·
// (d) que el carrito deje de publicar su alto · (e) dibujar el botón sin
// ningún módulo que ofrecer.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const nav = vi.hoisted(() => ({ ruta: "/catalogo/reebok" }));
// 🔴 2-oct-2026: Daniel aprobó y prendió `TAB_BAR_2026_10`; esta prueba cuida la
// versión de antes, así que lo fuerza apagado.
vi.mock("@/lib/navegacion/tab-bar", async (original) => ({
  ...(await original<typeof import("@/lib/navegacion/tab-bar")>()),
  TAB_BAR_2026_10: false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

beforeEach(() => {
  sessionStorage.clear();
  document.body.className = "";
  window.matchMedia = ((consulta: string) => ({
    matches: false, media: consulta, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("AppHeader en modo solo menú", () => {
  it("dibuja el botón redondo y nada más", () => {
    sessionStorage.setItem("cxc_role", "admin");
    render(<AppHeader module="Catálogos" soloMenuDelCelular />);
    expect(document.querySelector("[data-boton-flotante]")).not.toBeNull();
    expect(document.querySelector("[data-encabezado]")).toBeNull();
    expect(document.querySelector("[data-titulo-modulo]")).toBeNull();
  });

  it("sin ningún módulo que ofrecer, no hay botón", () => {
    render(<AppHeader module="Catálogos" soloMenuDelCelular />);
    expect(document.querySelector("[data-boton-flotante]")).toBeNull();
  });

  it("control: sin el modo, la pantalla de siempre trae franja y título", () => {
    sessionStorage.setItem("cxc_role", "admin");
    render(<AppHeader module="Comisiones" />);
    expect(document.querySelector("[data-encabezado]")).not.toBeNull();
    expect(document.querySelector("[data-titulo-modulo]")).not.toBeNull();
  });
});

describe("dónde se monta", () => {
  it("el catálogo con sesión lo lleva", () => {
    expect(leer("src/app/catalogo/[marca]/layout.tsx")).toMatch(/<AppHeader[^>]*soloMenuDelCelular/);
  });

  it("el catálogo público y los pedidos públicos NO", () => {
    const publicas = ["src/app/catalogo-publico", "src/app/pedido-reebok", "src/app/pedido-joybees", "src/app/pedido-tommy", "src/app/pedido-calvin"];
    for (const dir of publicas) {
      for (const f of archivos(resolve(RAIZ, dir))) {
        expect(readFileSync(f, "utf8"), f).not.toMatch(/AppHeader/);
      }
    }
    for (const f of ["CatalogoPublicoPage.tsx", "PedidoPublicoClient.tsx", "RevisarPedidoPublico.tsx"]) {
      expect(leer(`src/components/catalogo/${f}`), f).not.toMatch(/AppHeader/);
    }
  });

  it("el carrito publica su alto para que el botón se siente encima", () => {
    expect(leer("src/components/catalogo/CatalogoStickyCartBar.tsx"))
      .toMatch(/usePublicarAltoBarraFija\(barraRef, cartCount > 0\)/);
  });
});
