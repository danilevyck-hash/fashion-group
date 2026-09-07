// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA — BODEGA MIRA LA LISTA Y NO SE LE OFRECE NADA QUE NO PUEDA
// (25-ago-2026)
//
// Daniel, textual: ***"Dale acceso a bodega a la lista de pedidos."*** Y la
// otra mitad, igual de textual: ***"Bodega solo MIRA."***
//
// Se MONTA la pantalla real (`PedidosListClient`, la misma que abre el botón
// «Pedidos») con la sesión de cada rol y se lee el DOM. Nada de barridos sobre
// el .tsx: un barrido se cumple con su propio comentario.
//
// Lo que fija:
//   1. Bodega VE las filas: la lista pide su feed y las pinta. Si alguien le
//      cierra la lectura, esto se pone rojo antes que nada.
//   2. 🔴 NO se le ofrece ni un botón muerto: sin «Eliminar», sin «Duplicar»,
//      sin «Exportar Excel», sin las casillas del borrado masivo. Los cuatro le
//      responden 403 en el servidor (ver `api/bodega-ve-pedidos.test.ts`), y un
//      botón que muere en 403 hace creer que se perdió el trabajo.
//   3. 🔴 La fila le dice **«Ver»**, no «Editar». La palabra importa: es lo que
//      le promete la pantalla, y no puede prometer lo que el servidor niega.
//   4. 🩸 Un pedido del LINK sin convertir NO llama a `convertir` (un POST que
//      le da 403): se abre la vista PÚBLICA, que es lo que esa fila es.
//   5. Y los otros tres roles NO perdieron nada: el vendedor sigue con «Editar»
//      y «Duplicar», admin y secretaria además con «Eliminar» y «Exportar».
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import PedidosListClient from "@/components/catalogo/PedidosListClient";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { COMPROBANTES_ROLES, COMPROBANTES_EDITAR_ROLES } from "@/lib/catalogo/roles";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogo/reebok/pedidos",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/ToastSystem", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const MARCAS: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];
const HOY = new Date().toISOString();

/** El feed tal como lo devuelve `GET /api/catalogo/<marca>/orders`. */
const FEED = [
  {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    order_number: "PED-017",
    client_name: "Sporting Shoes",
    vendor_name: "Rey",
    total: 2760,
    created_at: HOY,
    status: "confirmado",
    fuente: "orders",
    del_link: false,
    // ⚠️ 6-sep-2026: el feed real SIEMPRE manda `en_switch`, y desde hoy es lo
    // que decide si se ofrece «Duplicar» — el servidor le contesta 409 («Este
    // pedido no está en Switch») a un pedido sin envío activo, así que ofrecer
    // el botón ahí era ofrecer un error. Un pedido con número de Switch está en
    // Switch: al fixture le faltaba el campo.
    en_switch: true,
    switch_numero: "16-000000503",
    switch_documento: "pedido",
    items: [{ product_id: "p1", quantity: 12, unit_price: 10 }],
  },
  {
    id: "ab12cd34",
    order_number: null,
    client_name: "Nathalie",
    vendor_name: null,
    total: 480,
    created_at: HOY,
    status: null,
    fuente: "publicos",
    del_link: true,
    switch_numero: null,
    switch_documento: null,
    items: [{ product_id: "p2", quantity: 6, unit_price: 10 }],
  },
];

let fetchSpy: ReturnType<typeof vi.fn>;

/** Monta la lista real como la vería `rol`, y espera a que las filas salgan. */
async function montarComo(rol: string, marca: MarcaUiKey = "reebok") {
  sessionStorage.setItem("cxc_role", rol);
  render(<PedidosListClient marca={marca} />);
  // 🩸 Hay un skeleton mientras carga: buscar botones antes de que llegue el
  // feed mide una pantalla vacía y cualquier `queryAll…` daría 0 — verde por
  // nada. Se espera a que la fila EXISTA.
  // ⚠️ 6-sep-2026: la lista dibuja FICHA (<lg) y TABLA (>=lg); jsdom no aplica
  // Tailwind, así que el nombre está dos veces. Se espera a que EXISTA.
  await screen.findAllByText("Sporting Shoes");
}

// ⚠️ 6-sep-2026 — «Editar/Ver · Duplicar · Reenviar el correo · Eliminar» se
// MUDARON al «···» de la casa y a la fila salió «Ver PDF»: en la fila,
// «Eliminar» era el botón más a la vista. Las acciones son las MISMAS; cambió
// dónde se tocan, así que el candado toca donde se toca ahora.
function opciones(f: HTMLElement): string[] {
  const kebab = Array.from(f.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "").startsWith("Más opciones"),
  );
  if (!kebab) return [];
  fireEvent.click(kebab);
  const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (b) => (b.textContent || "").trim(),
  );
  fireEvent.keyDown(window, { key: "Escape" });
  return items;
}

/** Todas las opciones ofrecidas en la TABLA, fila por fila. */
function opcionesDeTodasLasFilas(): string[] {
  return Array.from(document.querySelectorAll("tbody tr")).flatMap((tr) => opciones(tr as HTMLElement));
}

/** La fila de un pedido, por su hook estable `data-pedido`. */
const fila = (clave: string) =>
  document.querySelector(`tr[data-pedido="${clave}"]`) as HTMLElement;

beforeEach(() => {
  sessionStorage.clear();
  ROUTER.push.mockClear();
  fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
    // 🔴 Ninguna escritura sale de este arnés. Si alguna se intenta, el test que
    // la cuenta lo dice con nombre y apellido.
    if (init?.method && init.method !== "GET") return { ok: false, status: 403, json: async () => ({}) };
    if (String(url).endsWith("/orders")) return { ok: true, json: async () => FEED };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ── 1. Bodega ve la lista ────────────────────────────────────────────────────

describe("🔴 1. bodega VE las filas — en las 4 marcas", () => {
  for (const marca of MARCAS) {
    it(`${marca}: la lista pide su feed y pinta las filas`, async () => {
      await montarComo("bodega", marca);
      expect(screen.getAllByText("Sporting Shoes").length).toBeGreaterThan(0);
      const pedidas = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(pedidas.some((u) => u === `${getMarcaTheme(marca)!.api}/orders`)).toBe(true);
    });
  }
});

// ── 2. Ni un botón muerto ────────────────────────────────────────────────────

describe("🔴 2. a bodega no se le ofrece lo que el servidor le niega", () => {
  it("sin «Eliminar» en ninguna fila", async () => {
    await montarComo("bodega");
    expect(opcionesDeTodasLasFilas()).not.toContain("Eliminar");
  });

  it("sin «Duplicar» (duplicar es un POST /orders → 403)", async () => {
    await montarComo("bodega");
    expect(opcionesDeTodasLasFilas()).not.toContain("Duplicar");
  });

  it("sin «Reenviar el correo» (send-order no es de bodega)", async () => {
    await montarComo("bodega");
    expect(opcionesDeTodasLasFilas()).not.toContain("Reenviar el correo");
  });

  it("sin «Exportar Excel» (pedidos-export → 403)", async () => {
    await montarComo("bodega");
    expect(screen.queryAllByRole("button", { name: /Descargar Excel/ })).toHaveLength(0);
  });

  it("sin las casillas del borrado masivo", async () => {
    await montarComo("bodega");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("🩸 y NO se dispara ni una escritura al abrir la pantalla", async () => {
    await montarComo("bodega");
    const escrituras = fetchSpy.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method && (c[1] as RequestInit).method !== "GET",
    );
    expect(escrituras, JSON.stringify(escrituras)).toHaveLength(0);
  });
});

// ── 3. La palabra: «Ver», no «Editar» ────────────────────────────────────────

describe("🔴 3. la fila le promete lo que puede cumplir", () => {
  it("bodega: lo que se le ofrece dice «Ver» — y es lo ÚNICO", async () => {
    await montarComo("bodega");
    expect(opciones(fila("PED-017"))).toEqual(["Ver"]);
  });

  it("bodega: y NO existe ningún «Editar» en toda la pantalla", async () => {
    await montarComo("bodega");
    expect(opcionesDeTodasLasFilas()).not.toContain("Editar");
  });

  for (const rol of COMPROBANTES_EDITAR_ROLES) {
    it(`${rol}: sigue diciendo «Editar» — no se le cambió la palabra a nadie`, async () => {
      await montarComo(rol);
      expect(opciones(fila("PED-017"))[0]).toBe("Editar");
    });
  }
});

// ── 4. El pedido del LINK no pasa por `convertir` ────────────────────────────

describe("🩸 4. la fila del link se abre en solo lectura, sin POST", () => {
  it("bodega: tocarla lleva a la vista PÚBLICA y no llama a convertir", async () => {
    await montarComo("bodega");
    fireEvent.click(fila("ab12cd34"));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalled());
    expect(ROUTER.push).toHaveBeenCalledWith(`${getMarcaTheme("reebok")!.pedidoPublicoBase}/ab12cd34`);
    const convertir = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/convertir"));
    expect(convertir, "bodega llamó a convertir, que le responde 403").toHaveLength(0);
  });

  it("vendedor: sigue convirtiendo — no se le quitó el camino a nadie", async () => {
    await montarComo("vendedor");
    fireEvent.click(fila("ab12cd34"));
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/convertir"))).toBe(true),
    );
  });

  it("bodega: la fila INTERNA abre su detalle (que ya se dibuja sin editor)", async () => {
    await montarComo("bodega");
    fireEvent.click(fila("PED-017"));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalled());
    expect(ROUTER.push).toHaveBeenCalledWith(
      "/catalogo/reebok/pedido/aaaaaaaa-1111-4111-8111-111111111111",
    );
  });
});

// ── 5. Nadie perdió nada ─────────────────────────────────────────────────────

describe("🔴 5. los otros tres roles quedaron igual que antes", () => {
  const ESPERADO: Record<string, { duplicar: boolean; eliminar: boolean; exportar: boolean }> = {
    admin: { duplicar: true, eliminar: true, exportar: true },
    secretaria: { duplicar: true, eliminar: true, exportar: true },
    vendedor: { duplicar: true, eliminar: false, exportar: false },
    bodega: { duplicar: false, eliminar: false, exportar: false },
  };

  for (const [rol, esp] of Object.entries(ESPERADO)) {
    it(`${rol}: duplicar=${esp.duplicar} · eliminar=${esp.eliminar} · exportar=${esp.exportar}`, async () => {
      await montarComo(rol);
      const ofrecidas = opcionesDeTodasLasFilas();
      expect(ofrecidas.includes("Duplicar"), "duplicar").toBe(esp.duplicar);
      expect(ofrecidas.includes("Eliminar"), "eliminar").toBe(esp.eliminar);
      expect(screen.queryAllByRole("button", { name: /Descargar Excel/ }).length > 0, "exportar").toBe(esp.exportar);
    });
  }

  it("🩸 los 4 roles de la lista ven las filas — ninguno quedó en ceros", async () => {
    for (const rol of COMPROBANTES_ROLES) {
      cleanup();
      sessionStorage.clear();
      await montarComo(rol);
      expect(screen.getAllByText("Sporting Shoes").length, rol).toBeGreaterThan(0);
    }
  });
});
