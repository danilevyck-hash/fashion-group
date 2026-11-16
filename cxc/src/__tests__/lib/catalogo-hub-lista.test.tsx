// ─────────────────────────────────────────────────────────────────────────────
// La portada de Catálogos EN LISTA (`HUB_LISTA_2026_11`, aprobada por Daniel el
// 15-nov-2026). Fija en el DOM lo mismo que las tarjetas fijaban:
//   · cada fila abre SU catálogo y dice lo que el cliente VE (70 de Joybees,
//     nunca 81) con su «sin foto»;
//   · Comprobantes · Administrar · Copiar enlace con los MISMOS permisos de
//     siempre (bodega y vendedor sin «Administrar»);
//   · el enlace de los 4 catálogos, una sola vez, al pie.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import CatalogosMarcasPage from "@/app/catalogos/marcas/page";
import { MARCAS_UI, getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { HUB_LISTA_2026_11 } from "@/lib/catalogo/catalogos-2026-10";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/catalogos/marcas",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOMBRE: Record<MarcaUiKey, string> = { reebok: "REEBOK", joybees: "JOYBEES", tommy: "TOMMY HILFIGER", calvin: "CALVIN KLEIN" };
const RESPUESTA = {
  contadores: {
    reebok: { aLaVenta: 178, sinFoto: 0, tarjetas: 178, tarjetasSinFoto: 0 },
    joybees: { aLaVenta: 81, sinFoto: 0, tarjetas: 70, tarjetasSinFoto: 0 },
    tommy: { aLaVenta: 439, sinFoto: 3, tarjetas: 439, tarjetasSinFoto: 3 },
    calvin: { aLaVenta: 81, sinFoto: 0, tarjetas: 81, tarjetasSinFoto: 0 },
  },
  fuente: "base",
};

async function montarComo(rol: string) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => RESPUESTA })));
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  render(<CatalogosMarcasPage />);
  expect(await screen.findAllByText(/productos a la venta/)).toHaveLength(4);
}
const fila = (m: MarcaUiKey) => screen.getByRole("link", { name: `Ver catálogo ${NOMBRE[m]}` }).closest("li") as HTMLElement;

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Catálogos en lista", () => {
  it("está PRENDIDA (Daniel, 15-nov-2026)", () => expect(HUB_LISTA_2026_11).toBe(true));

  it("cada fila abre su catálogo y dice lo que el cliente ve, con su «sin foto»", async () => {
    await montarComo("admin");
    for (const m of MARCAS_UI) {
      expect(screen.getByRole("link", { name: `Ver catálogo ${NOMBRE[m]}` }).getAttribute("href")).toBe(`/catalogo/${m}`);
    }
    expect(within(fila("joybees")).getByText(/70 productos a la venta/)).toBeTruthy();
    expect(within(fila("joybees")).queryByText(/81 productos/)).toBeNull();
    expect(within(fila("tommy")).getByText("3 sin foto")).toBeTruthy();
    expect(within(fila("reebok")).queryByText(/sin foto/)).toBeNull();
  });

  const ACCIONES: Record<string, string[]> = {
    admin: ["Comprobantes", "Administrar", "Copiar enlace"],
    secretaria: ["Comprobantes", "Administrar", "Copiar enlace"],
    vendedor: ["Comprobantes", "Copiar enlace"],
    bodega: ["Comprobantes", "Copiar enlace"],
  };
  for (const [rol, esperado] of Object.entries(ACCIONES)) {
    it(`${rol}: debajo de cada marca, EXACTAMENTE ${esperado.join(" · ")}`, async () => {
      await montarComo(rol);
      for (const m of MARCAS_UI) {
        const acciones = within(fila(m)).getAllByText(/^(Comprobantes|Administrar|Copiar enlace)$/).map((e) => e.textContent);
        expect(acciones, `${rol} / ${m}`).toEqual(esperado);
      }
    });
  }

  it("«Comprobantes» sale del tema de la marca y toca a 44 px", async () => {
    await montarComo("admin");
    for (const m of MARCAS_UI) {
      const link = within(fila(m)).getByRole("link", { name: "Comprobantes" });
      expect(link.getAttribute("href")).toBe(getMarcaTheme(m)!.pedidosHref);
      expect(link.className).toContain("min-h-[44px]");
    }
  });

  it("el enlace de los 4 catálogos va UNA vez, al pie", async () => {
    await montarComo("vendedor");
    expect(screen.getAllByRole("button", { name: "Copiar enlace de los 4 catálogos" })).toHaveLength(1);
    expect(screen.getByText("Enlace público · 4 catálogos")).toBeTruthy();
  });
});
