// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — LA TARJETA DEL HUB: EL NÚMERO QUE EL CLIENTE VE, Y EL PULSO
// (22-sep-2026)
//
// Se MONTA el hub real (`/catalogos/marcas`) y se lee el DOM. Nada de barridos
// de texto sobre el .tsx para lo que se puede mirar renderizado.
//
// 🩸 LOS DOS DEFECTOS QUE ARREGLA:
//
//   1. El hub decía «81 productos a la venta» de Joybees y el catálogo mostraba
//      **70 tarjetas**. Joybees es la única marca que junta las tallas de un
//      modelo en UNA tarjeta: 11 modelos con dos filas cada uno. Daniel decidió
//      que el hub diga 70.
//   2. La tarjeta solo contaba productos. **Joybees llevaba 29 días sin un
//      comprobante y nada lo decía.**
//
// Y de paso: **los cuatro botones arrancaban a distinta altura** porque «TOMMY
// HILFIGER» ocupa dos líneas. El nombre y el bloque de números reservan su alto
// desde que hay dos tarjetas por fila.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import CatalogosMarcasPage from "@/app/catalogos/marcas/page";
import type { MarcaUiKey } from "@/lib/catalogo/marcas-ui";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogos/marcas",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOMBRE: Record<MarcaUiKey, string> = {
  reebok: "REEBOK",
  joybees: "JOYBEES",
  tommy: "TOMMY HILFIGER",
  calvin: "CALVIN KLEIN",
};

/** Lo medido contra producción el 22-sep-2026, tal como lo sirve la ruta. */
const RESPUESTA = {
  contadores: {
    reebok: { aLaVenta: 178, sinFoto: 0, tarjetas: 178, tarjetasSinFoto: 0 },
    joybees: { aLaVenta: 81, sinFoto: 0, tarjetas: 70, tarjetasSinFoto: 0 },
    tommy: { aLaVenta: 439, sinFoto: 0, tarjetas: 439, tarjetasSinFoto: 0 },
    calvin: { aLaVenta: 81, sinFoto: 0, tarjetas: 81, tarjetasSinFoto: 0 },
  },
  pulso: {
    reebok: { comprobantes: 14, monto: 79968, diasDesdeElUltimo: 13 },
    joybees: { comprobantes: 4, monto: 4020, diasDesdeElUltimo: 29 },
    tommy: { comprobantes: 44, monto: 326686, diasDesdeElUltimo: 3 },
    calvin: { comprobantes: 6, monto: 17658, diasDesdeElUltimo: 8 },
  },
  fuente: "base",
};

async function montar(json: unknown = RESPUESTA) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => json })));
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  render(<CatalogosMarcasPage />);
  await screen.findByRole("heading", { name: NOMBRE.reebok });
}

function tarjeta(marca: MarcaUiKey): HTMLElement {
  const h2 = screen.getByRole("heading", { name: NOMBRE[marca] });
  return h2.closest("div.relative.overflow-hidden") as HTMLElement;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("🔴 el hub dice lo que el cliente VE", () => {
  it("Joybees dice 70, que es lo que muestra su catálogo", async () => {
    await montar();
    expect(await within(tarjeta("joybees")).findByText(/70 productos a la venta/))
      .toBeTruthy();
  });

  it("🩸 y NUNCA vuelve a decir 81, que es lo que hay en la tabla", async () => {
    // 🔴 MUTACIÓN QUE SE CAZA: leer `aLaVenta` otra vez. El 81 viaja en la
    // respuesta —es la regla de «a la venta», intacta— y no se dibuja.
    await montar();
    expect(within(tarjeta("joybees")).queryByText(/81 productos/)).toBeNull();
  });

  it("las otras tres no se movieron", async () => {
    await montar();
    expect(within(tarjeta("reebok")).getByText(/178 productos a la venta/)).toBeTruthy();
    expect(within(tarjeta("tommy")).getByText(/439 productos a la venta/)).toBeTruthy();
    expect(within(tarjeta("calvin")).getByText(/81 productos a la venta/)).toBeTruthy();
  });

  it("el rótulo NO cambió: sigue diciendo «productos a la venta»", async () => {
    await montar();
    for (const m of Object.keys(NOMBRE) as MarcaUiKey[]) {
      expect(within(tarjeta(m)).getByText(/productos a la venta/)).toBeTruthy();
    }
  });
});

describe("🔴 cada tarjeta dice su pulso", () => {
  it("Joybees grita sus 29 días de silencio", async () => {
    await montar();
    expect(within(tarjeta("joybees")).getByText(
      "4 comprobantes · $4,020.00 · último hace 29 días",
    )).toBeTruthy();
  });

  it("las cuatro traen su línea, con los números medidos", async () => {
    await montar();
    expect(within(tarjeta("reebok")).getByText(
      "14 comprobantes · $79,968.00 · último hace 13 días")).toBeTruthy();
    expect(within(tarjeta("tommy")).getByText(
      "44 comprobantes · $326,686.00 · último hace 3 días")).toBeTruthy();
    expect(within(tarjeta("calvin")).getByText(
      "6 comprobantes · $17,658.00 · último hace 8 días")).toBeTruthy();
  });

  it("🔴 sin pulso la tarjeta NO se rompe: la línea no sale y los números sí", async () => {
    await montar({ contadores: RESPUESTA.contadores });
    expect(within(tarjeta("joybees")).getByText(/70 productos a la venta/)).toBeTruthy();
    expect(within(tarjeta("joybees")).queryByText(/comprobantes ·/)).toBeNull();
  });

  it("🔴 una sola petición para las cuatro tarjetas", async () => {
    // El defecto de septiembre: bajarse el catálogo entero (462,8 KB) para
    // escribir unos números. La línea nueva viaja en la MISMA petición.
    await montar();
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("/api/catalogo/contadores");
  });
});

describe("🩸 los cuatro botones arrancan a la misma altura", () => {
  it("el nombre reserva sus dos líneas desde que hay dos tarjetas por fila", async () => {
    // «TOMMY HILFIGER» ocupa dos renglones y las otras tres uno: sin el alto
    // reservado, su bloque entero baja y la fila queda escalonada.
    await montar();
    for (const m of Object.keys(NOMBRE) as MarcaUiKey[]) {
      const h2 = screen.getByRole("heading", { name: NOMBRE[m] });
      expect(h2.className, m).toContain("sm:min-h-[4.5rem]");
    }
  });

  it("el bloque de números también reserva su alto", async () => {
    await montar();
    for (const m of Object.keys(NOMBRE) as MarcaUiKey[]) {
      const linea = within(tarjeta(m)).getByText(/productos a la venta/);
      const bloque = linea.closest("div")!;
      expect(bloque.className, m).toContain("sm:min-h-[3.75rem]");
    }
  });

  it("en el celular no se reserva nada: ahí no hay con qué comparar", async () => {
    // Una sola columna = ninguna tarjeta al lado. El `sm:` es lo que lo dice.
    await montar();
    const h2 = screen.getByRole("heading", { name: NOMBRE.tommy });
    expect(h2.className).not.toMatch(/(^|\s)min-h-\[4\.5rem\]/);
  });
});
