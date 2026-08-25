// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE PEDIDOS DEL ADMIN MUESTRA LOS DOS NÚMEROS (24-ago-2026)
//
// Candados de CONDUCTA: se RENDERIZA la pestaña real con filas reales y se lee
// el DOM. No hay un solo barrido de texto sobre el .tsx — un barrido se cumple
// con su propio comentario, y este repo ya pagó ese defecto cuatro veces.
//
// Lo que fija:
//   1. La fila muestra el número del pedido (PED-017) y el de Switch.
//   2. Un pedido que no salió DICE «No se ha mandado a Switch» — no un guion.
//   3. Una COTIZACIÓN se ve distinta de un pedido en la MISMA lista.
//   4. El pedido del link sin convertir dice «Se numera al abrirlo».
//   5. 🔴 NO hay columnas nuevas: la tabla tiene los mismos encabezados que
//      antes y los números viven DENTRO de la celda del cliente (crecen hacia
//      abajo, no ensanchan la tabla en el iPad acostado).
//   6. El buscador encuentra por los dos números.
//   7. Reebok y Joybees se comportan IGUAL (espejo exacto), y Tommy y Calvin
//      también: la pieza es una sola para las 4 marcas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import PedidosTab, { type UnifiedPedido } from "@/app/catalogos/admin/[marca]/PedidosTab";
import { MARCAS_UI, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogos/admin/reebok",
  useSearchParams: () => new URLSearchParams(""),
}));

const HOY = new Date().toISOString();

const base = (over: Partial<UnifiedPedido>): UnifiedPedido => ({
  origen: "mio",
  id_natural: "11111111-1111-4111-8111-111111111111",
  cliente: "Hafez, S.A.",
  total: 2760,
  created_at: HOY,
  vendor: "Rey",
  item_count: 3,
  fuente: "orders",
  ...over,
});

// Un pedido REAL de producción (medido el 24-ago-2026): PED-017 → 16-000000503.
const EN_SWITCH = base({
  id_natural: "aaaaaaaa-1111-4111-8111-111111111111",
  cliente: "Sporting Shoes",
  numero_pedido: "PED-017",
  switch_numero: "16-000000503",
  switch_documento: "pedido",
});

const SIN_ENVIAR = base({
  id_natural: "bbbbbbbb-2222-4222-8222-222222222222",
  cliente: "Zapatería Nueva",
  numero_pedido: "PED-019",
  switch_numero: null,
  switch_documento: null,
});

const COTIZADO = base({
  id_natural: "cccccccc-3333-4333-8333-333333333333",
  cliente: "A-Amani, S.A.",
  numero_pedido: "PED-020",
  switch_numero: "16-000000511",
  switch_documento: "cotizacion",
});

const DEL_LINK = base({
  origen: "link",
  fuente: "publicos",
  id_natural: "ab12cd34",
  cliente: "Nathalie",
  vendor: null,
  numero_pedido: null,
  switch_numero: null,
  switch_documento: null,
});

function pintar(pedidos: UnifiedPedido[], marca: MarcaUiKey = "reebok") {
  return render(
    <PedidosTab marca={marca} pedidos={pedidos} onRefresh={async () => {}} showToast={vi.fn()} />,
  );
}

const fila = (c: HTMLElement, cliente: string) =>
  [...c.querySelectorAll("tbody tr")].find((tr) => (tr.textContent || "").includes(cliente)) as HTMLElement;

beforeEach(() => {
  ROUTER.push.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("1-2. los dos números están en la fila, y el que falta se dice con palabras", () => {
  it("un pedido que salió muestra SU número y el de Switch", () => {
    const { container } = pintar([EN_SWITCH]);
    const tr = fila(container, "Sporting Shoes");
    expect(tr.textContent).toContain("PED-017");
    expect(tr.textContent).toContain("16-000000503");
  });

  it("🔴 uno que NO salió dice «No se ha mandado a Switch» y no un guion", () => {
    const { container } = pintar([SIN_ENVIAR]);
    const tr = fila(container, "Zapatería Nueva");
    expect(tr.textContent).toContain("PED-019");
    expect(tr.textContent).toMatch(/no se ha mandado a switch/i);
    // Ni un guion suelto donde iría el número (se leería como un cero).
    expect(tr.textContent).not.toMatch(/—/);
  });

  it("los dos casos conviven en la MISMA lista sin confundirse", () => {
    const { container } = pintar([EN_SWITCH, SIN_ENVIAR]);
    expect(fila(container, "Sporting Shoes").textContent).toContain("16-000000503");
    expect(fila(container, "Zapatería Nueva").textContent).toMatch(/no se ha mandado/i);
    expect(fila(container, "Zapatería Nueva").textContent).not.toContain("16-000000503");
  });
});

describe("3. 🔴 una COTIZACIÓN no se puede confundir con un pedido", () => {
  it("la fila cotizada lo dice con todas las letras", () => {
    const { container } = pintar([COTIZADO]);
    const tr = fila(container, "A-Amani");
    expect(tr.textContent).toContain("16-000000511");
    expect(tr.textContent).toMatch(/cotizaci/i);
  });

  it("y la fila de un PEDIDO no dice cotización", () => {
    const { container } = pintar([EN_SWITCH, COTIZADO]);
    expect(fila(container, "Sporting Shoes").textContent).not.toMatch(/cotizaci/i);
    expect(fila(container, "Sporting Shoes").textContent).toMatch(/pedido en switch/i);
  });

  it("sin la columna `documento` (DDL pendiente) la fila sigue diciendo PEDIDO", () => {
    const { container } = pintar([base({ cliente: "Sin DDL", numero_pedido: "PED-021", switch_numero: "16-000000512" })]);
    const tr = fila(container, "Sin DDL");
    expect(tr.textContent).toMatch(/pedido en switch/i);
    expect(tr.textContent).not.toMatch(/cotizaci/i);
  });
});

describe("4. el pedido del link sin convertir no tiene número — y lo dice", () => {
  it("dice que se numera al abrirlo, no un blanco", () => {
    const { container } = pintar([DEL_LINK]);
    const tr = fila(container, "Nathalie");
    expect(tr.textContent).toMatch(/se numera al abrirlo/i);
    expect(tr.textContent).toMatch(/no se ha mandado a switch/i);
  });
});

describe("5. 🔴 los números NO son columnas nuevas", () => {
  const ENCABEZADOS = ["", "Origen", "Cliente", "Total", "Fecha", ""];

  it("la tabla conserva exactamente sus 6 columnas", () => {
    const { container } = pintar([EN_SWITCH, DEL_LINK]);
    const ths = [...container.querySelectorAll("thead th")].map((th) => (th.textContent || "").trim());
    expect(ths).toEqual(ENCABEZADOS);
  });

  it("los dos números viven DENTRO de la celda del cliente (crecen hacia abajo)", () => {
    const { container } = pintar([EN_SWITCH]);
    const tds = [...fila(container, "Sporting Shoes").querySelectorAll("td")];
    expect(tds).toHaveLength(ENCABEZADOS.length);
    const celdaCliente = tds[2];
    expect(celdaCliente.textContent).toContain("Sporting Shoes");
    expect(celdaCliente.textContent).toContain("PED-017");
    expect(celdaCliente.textContent).toContain("16-000000503");
    // Ninguna otra celda los repite (eso sería la columna que no debe existir).
    for (const [i, td] of tds.entries()) {
      if (i === 2) continue;
      expect(td.textContent).not.toContain("PED-017");
      expect(td.textContent).not.toContain("16-000000503");
    }
  });
});

describe("6. el buscador encuentra por los dos números", () => {
  function buscar(container: HTMLElement, q: string) {
    fireEvent.change(screen.getByPlaceholderText(/buscar por cliente o número/i), { target: { value: q } });
    return [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent || "");
  }

  it("por el número del pedido", () => {
    const { container } = pintar([EN_SWITCH, SIN_ENVIAR, COTIZADO]);
    const filas = buscar(container, "PED-019");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toContain("Zapatería Nueva");
  });

  it("por el número de Switch", () => {
    const { container } = pintar([EN_SWITCH, SIN_ENVIAR, COTIZADO]);
    const filas = buscar(container, "16-000000511");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toContain("A-Amani");
  });

  it("y sigue encontrando por cliente, que es lo que ya hacía", () => {
    const { container } = pintar([EN_SWITCH, SIN_ENVIAR]);
    const filas = buscar(container, "sporting");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toContain("Sporting Shoes");
  });
});

describe("7. las 4 marcas se comportan igual (Joybees es espejo EXACTO de Reebok)", () => {
  it("cada marca muestra los dos números y la cotización rotulada", () => {
    for (const marca of MARCAS_UI) {
      const { container, unmount } = pintar([EN_SWITCH, SIN_ENVIAR, COTIZADO, DEL_LINK], marca);
      expect(fila(container, "Sporting Shoes").textContent).toContain("16-000000503");
      expect(fila(container, "Zapatería Nueva").textContent).toMatch(/no se ha mandado/i);
      expect(fila(container, "A-Amani").textContent).toMatch(/cotizaci/i);
      expect(fila(container, "Nathalie").textContent).toMatch(/se numera al abrirlo/i);
      unmount();
    }
  });

  it("Reebok y Joybees dibujan la MISMA segunda línea, carácter por carácter", () => {
    const linea = (marca: MarcaUiKey) => {
      const { container, unmount } = pintar([EN_SWITCH], marca);
      const t = [...fila(container, "Sporting Shoes").querySelectorAll("td")][2].textContent || "";
      unmount();
      return t;
    };
    expect(linea("joybees")).toBe(linea("reebok"));
  });
});

describe("no se rompió lo que ya funcionaba", () => {
  it("tocar la fila sigue abriendo el detalle del pedido interno", () => {
    const { container } = pintar([EN_SWITCH]);
    fireEvent.click(fila(container, "Sporting Shoes"));
    expect(ROUTER.push).toHaveBeenCalledWith(`/catalogo/reebok/pedido/${EN_SWITCH.id_natural}`);
  });

  it("la fila conserva sus botones Editar y Eliminar", () => {
    const { container } = pintar([EN_SWITCH]);
    const tr = fila(container, "Sporting Shoes");
    expect(within(tr).getByRole("button", { name: "Editar" })).toBeTruthy();
    expect(within(tr).getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });
});
