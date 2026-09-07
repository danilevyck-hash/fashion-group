/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE CONDUCTA — LA PANTALLA DE COMPROBANTES DESPUÉS DEL REDISEÑO
 * (6-sep-2026)
 *
 * Se MONTA la pantalla real y se TOCAN los botones reales. Nada de barridos de
 * texto sobre el .tsx: un barrido se cumple con su propio comentario.
 *
 * Lo que fija:
 *   1. DOS grupos de píldoras con rótulo — nunca más una barra de pestañas
 *      subrayadas arriba y píldoras abajo.
 *   2. Los rótulos «Del cliente» y «Del vendedor», también en la etiqueta de
 *      la fila.
 *   3. «Ver PDF» está EN LA FILA; Editar · Duplicar · Reenviar el correo ·
 *      Eliminar viven en el «···». «Eliminar» ya no es el botón más a la vista.
 *   4. La columna «Vendedor».
 *   5. El pedido trabado se ve: chip «Sin mandar» y la frase EN ROJO con días.
 *   6. Ficha (<lg) y tabla (>=lg): las dos dibujan lo mismo.
 *   7. Todo lo que se toca mide 44 px.
 *   8. La lista abre en el mes que TIENE comprobantes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor, act } from "@testing-library/react";
import ComprobantesPanel, { type UnifiedPedido } from "@/components/catalogo/ComprobantesPanel";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogo/reebok/pedidos",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

const PDF = vi.fn(async () => {});
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: (...a: unknown[]) => PDF(...(a as [])),
}));

const HOY = new Date().toISOString();
const haceDias = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const base = (over: Partial<UnifiedPedido>): UnifiedPedido => ({
  origen: "mio",
  id_natural: "11111111-1111-4111-8111-111111111111",
  cliente: "Sporting Shoes",
  total: 2760,
  created_at: HOY,
  vendor: "REINALDO ESPINOSA",
  item_count: 3,
  fuente: "orders",
  confirmado_cliente_at: null,
  switch_numero: null,
  en_switch: false,
  numero_pedido: null,
  switch_documento: null,
  status: "confirmado",
  client_email: null,
  ...over,
});

// Calcados de producción (medidos el 7-sep-2026).
const EN_SWITCH = base({
  id_natural: "aaaaaaaa-1111-4111-8111-111111111111",
  cliente: "Sporting Shoes",
  numero_pedido: "PED-017",
  switch_numero: "16-000000503",
  switch_documento: "pedido",
  en_switch: true,
  vendor: "REINALDO ESPINOSA",
});
// PED-004 · CITY MALL PASO CANOA · $420 · confirmado y NUNCA mandado.
const TRABADO = base({
  id_natural: "bbbbbbbb-2222-4222-8222-222222222222",
  cliente: "CITY MALL PASO CANOA",
  numero_pedido: "PED-004",
  total: 420,
  created_at: "2026-07-04T12:00:00Z",
  vendor: "daniel",
});
const BORRADOR = base({
  id_natural: "cccccccc-3333-4333-8333-333333333333",
  cliente: "Hafez, S.A.",
  numero_pedido: "PED-018",
  status: "borrador",
  vendor: null,
});
const DEL_CLIENTE = base({
  origen: "link",
  fuente: "publicos",
  id_natural: "ab12cd34",
  cliente: "Nathalie",
  vendor: null,
  status: null,
  confirmado_cliente_at: HOY,
});

function pintar(pedidos: UnifiedPedido[], props: Partial<{ puedeAdministrar: boolean; puedeEditar: boolean }> = {}) {
  return render(
    <ComprobantesPanel
      marca="reebok"
      pedidos={pedidos}
      onRefresh={async () => {}}
      showToast={vi.fn()}
      puedeAdministrar={props.puedeAdministrar ?? true}
      puedeEditar={props.puedeEditar ?? true}
    />,
  );
}

const grupo = (c: HTMLElement, medir: string) =>
  c.querySelector(`[data-medir="${medir}"]`) as HTMLElement;
const chipsDe = (c: HTMLElement, medir: string) =>
  [...grupo(c, medir).querySelectorAll("button")].map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
const tocarChip = (c: HTMLElement, medir: string, label: string) => {
  const b = [...grupo(c, medir).querySelectorAll("button")].find((x) => (x.textContent || "").startsWith(label));
  expect(b, `no hay chip «${label}» en ${medir}`).toBeTruthy();
  fireEvent.click(b!);
};
const trs = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")] as HTMLElement[];

/** 🩸 La lista agrupa por MES y solo abre el más nuevo: los demás no están
 *  montados. Se despliegan antes de buscar una fila vieja. */
function abrirMeses(c: HTMLElement) {
  for (const b of [...c.querySelectorAll("button")]) {
    if (/\(\d+ comprobantes?\)/.test(b.textContent || "") && !b.querySelector("svg.rotate-90")) {
      fireEvent.click(b);
    }
  }
}
const filaDe = (c: HTMLElement, clave: string) =>
  c.querySelector(`tbody tr[data-pedido="${clave}"]`) as HTMLElement;
const fichas = (c: HTMLElement) =>
  [...c.querySelectorAll("div.lg\\:hidden > div[data-pedido]")] as HTMLElement[];

function abrirMenu(f: HTMLElement): string[] {
  const kebab = [...f.querySelectorAll("button")].find(
    (b) => (b.getAttribute("aria-label") || "").startsWith("Más opciones"),
  );
  expect(kebab, "la fila no tiene «···»").toBeTruthy();
  fireEvent.click(kebab!);
  const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => (b.textContent || "").trim());
  fireEvent.keyDown(window, { key: "Escape" });
  return items;
}

beforeEach(() => {
  ROUTER.push.mockClear();
  PDF.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: EN_SWITCH.id_natural,
        order_number: "PED-017",
        client_name: "Sporting Shoes",
        created_at: HOY,
        reebok_order_items: [{ sku: "R1", name: "Zapato", quantity: 2, unit_price: 10, image_url: "", category: "footwear" }],
      }),
    })) as unknown as typeof fetch,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 los DOS filtros tienen el MISMO aspecto y su rótulo", () => {
  it("los dos grupos existen y son píldoras, no pestañas subrayadas", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    const g1 = grupo(container, "filtro-origen-comprobante");
    const g2 = grupo(container, "filtro-tipo-comprobante");
    expect(g1).toBeTruthy();
    expect(g2).toBeTruthy();
    for (const g of [g1, g2]) {
      for (const b of g.querySelectorAll("button")) {
        // Píldora: redonda y con borde. Nunca `border-b-2` (la barra de tabs).
        expect(b.className, b.textContent || "").toContain("rounded-full");
        expect(b.className, b.textContent || "").not.toContain("border-b-2");
      }
    }
  });

  it("cada grupo lleva su rótulo chico", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    expect(grupo(container, "filtro-origen-comprobante").textContent).toContain("Quién lo armó");
    expect(grupo(container, "filtro-tipo-comprobante").textContent).toContain("Qué es");
  });

  it("🔴 lo que está en cero NO aparece", () => {
    const { container } = pintar([EN_SWITCH]);
    const c = chipsDe(container, "filtro-tipo-comprobante");
    expect(c.join(" ")).not.toContain("Cotizaciones");
    expect(c.join(" ")).not.toContain("Borradores");
    expect(c).toEqual(["Pedidos1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 «Del cliente» y «Del vendedor», en el chip Y en la fila", () => {
  it("los chips del origen", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    expect(chipsDe(container, "filtro-origen-comprobante")).toEqual(["Todos2", "Del cliente1", "Del vendedor1"]);
  });

  it("🔴 «Del link» y «Míos» no están en ninguna parte de la pantalla", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    const texto = container.textContent || "";
    expect(texto).not.toContain("Del link");
    expect(texto).not.toContain("Míos");
    expect(texto).not.toContain("Mío");
  });

  it("la etiqueta de la fila dice lo mismo que el chip", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    expect(filaDe(container, "PED-017").textContent).toContain("Del vendedor");
    expect(filaDe(container, "ab12cd34").textContent).toContain("Del cliente");
  });

  it("y el chip filtra de verdad", () => {
    const { container } = pintar([EN_SWITCH, DEL_CLIENTE]);
    tocarChip(container, "filtro-origen-comprobante", "Del cliente");
    expect(trs(container)).toHaveLength(1);
    expect(trs(container)[0].textContent).toContain("Nathalie");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 «Ver PDF» en la fila, el resto en el «···»", () => {
  it("«Ver PDF» es un botón de la fila", () => {
    const { container } = pintar([EN_SWITCH]);
    expect(within(filaDe(container, "PED-017")).getByRole("button", { name: "Ver PDF" })).toBeTruthy();
  });

  it("🔴 «Eliminar» YA NO es un botón suelto de la fila", () => {
    const { container } = pintar([EN_SWITCH]);
    const sueltos = [...filaDe(container, "PED-017").querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim());
    expect(sueltos).not.toContain("Eliminar");
    expect(sueltos).not.toContain("Editar");
    expect(sueltos).not.toContain("Duplicar");
  });

  it("las cuatro acciones viven en el «···», en su orden", () => {
    const { container } = pintar([EN_SWITCH]);
    expect(abrirMenu(filaDe(container, "PED-017"))).toEqual([
      "Editar", "Duplicar", "Reenviar el correo", "Eliminar",
    ]);
  });

  it("🔴 «Duplicar» solo donde el servidor lo permite (pedido YA en Switch)", () => {
    // A uno que no salió, `duplicar-pedido` le contesta 409 «Este pedido no
    // está en Switch». Ofrecer el botón ahí es ofrecer un error.
    const { container } = pintar([EN_SWITCH, TRABADO]);
    abrirMeses(container);
    expect(abrirMenu(filaDe(container, "PED-017"))).toContain("Duplicar");
    expect(abrirMenu(filaDe(container, "PED-004"))).not.toContain("Duplicar");
  });

  it("«Ver PDF» baja el papel con la palabra y el número del pedido", async () => {
    const { container } = pintar([EN_SWITCH]);
    const btn = within(filaDe(container, "PED-017")).getByRole("button", { name: "Ver PDF" });
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    const { filename, documentoLabel } = PDF.mock.calls[0][0] as { filename: string; documentoLabel: string };
    expect(documentoLabel).toBe("Pedido");
    expect(filename).toMatch(/^Pedido-PED-017-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("🩸 la lectura del pedido ARRANCA en el pointerdown (el gesto de iOS)", async () => {
    const { container } = pintar([EN_SWITCH]);
    const btn = within(filaDe(container, "PED-017")).getByRole("button", { name: "Ver PDF" });
    const llamadas = () => (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    expect(llamadas()).toBe(0);
    fireEvent.pointerDown(btn);
    expect(llamadas(), "el PDF no arrancó su lectura en el pointerdown").toBe(1);
    // Y el click NO vuelve a pedirlo: reusa lo que ya arrancó.
    await act(async () => { fireEvent.click(btn); });
    expect(llamadas()).toBe(1);
  });

  it("🔴 el pedido del CLIENTE sin convertir no ofrece PDF: no hay pedido del que sacarlo", () => {
    const { container } = pintar([DEL_CLIENTE]);
    const sueltos = [...filaDe(container, "ab12cd34").querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim());
    expect(sueltos).not.toContain("Ver PDF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 la columna «Vendedor»", () => {
  it("está en el encabezado, entre Cliente y Total", () => {
    const { container } = pintar([EN_SWITCH]);
    const ths = [...container.querySelectorAll("thead th")].map((t) => (t.textContent || "").trim());
    expect(ths).toEqual(["", "Origen", "Cliente", "Vendedor", "Total", "Fecha", ""]);
  });

  it("dice QUIÉN armó cada pedido — el dato ya viajaba en la fila", () => {
    const { container } = pintar([EN_SWITCH, TRABADO]);
    abrirMeses(container);
    expect([...filaDe(container, "PED-017").querySelectorAll("td")][3].textContent).toBe("REINALDO ESPINOSA");
    expect([...filaDe(container, "PED-004").querySelectorAll("td")][3].textContent).toBe("daniel");
  });

  it("sin vendedor se dice «—», no un blanco", () => {
    const { container } = pintar([BORRADOR]);
    tocarChip(container, "filtro-tipo-comprobante", "Borradores");
    expect([...filaDe(container, "PED-018").querySelectorAll("td")][3].textContent).toBe("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5. 🔴 el pedido trabado se NOTA", () => {
  it("el chip «Sin mandar» aparece con su conteo y filtra", () => {
    const { container } = pintar([EN_SWITCH, TRABADO, BORRADOR]);
    expect(chipsDe(container, "filtro-tipo-comprobante")).toContain("Sin mandar1");
    tocarChip(container, "filtro-tipo-comprobante", "Sin mandar");
    abrirMeses(container);
    expect(trs(container)).toHaveLength(1);
    expect(trs(container)[0].textContent).toContain("PED-004");
  });

  it("🔴 la frase va EN ROJO y con los días", () => {
    const { container } = pintar([TRABADO]);
    abrirMeses(container);
    const marca = filaDe(container, "PED-004").querySelector('[data-medir="sin-mandar"]') as HTMLElement;
    expect(marca, "la fila no marca que está sin mandar").toBeTruthy();
    expect(marca.className).toContain("text-red-600");
    expect(marca.textContent).toMatch(/^Sin mandar a Switch · hace \d+ días$/);
  });

  it("🔴 un BORRADOR conserva su frase gris: no se mandó porque no se terminó", () => {
    const { container } = pintar([BORRADOR]);
    tocarChip(container, "filtro-tipo-comprobante", "Borradores");
    const f = filaDe(container, "PED-018");
    expect(f.querySelector('[data-medir="sin-mandar"]')).toBeNull();
    expect(f.textContent).toContain("No se ha mandado a Switch");
  });

  it("y uno que SÍ salió no lleva ninguna marca roja", () => {
    const { container } = pintar([EN_SWITCH]);
    expect(filaDe(container, "PED-017").querySelector('[data-medir="sin-mandar"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6-7. 🔴 ficha y tabla, y todo lo que se toca mide 44 px", () => {
  it("hay una FICHA por debajo de lg y una TABLA de ahí para arriba", () => {
    const { container } = pintar([EN_SWITCH]);
    const cajaFicha = container.querySelector("div.lg\\:hidden") as HTMLElement;
    const cajaTabla = container.querySelector("div.hidden.lg\\:block") as HTMLElement;
    expect(cajaFicha, "no hay ficha para el teléfono y el iPad").toBeTruthy();
    expect(cajaTabla, "se perdió la tabla del escritorio").toBeTruthy();
    expect(cajaTabla.querySelector("table")).toBeTruthy();
    expect(cajaFicha.querySelector("table")).toBeNull();
  });

  it("🔴 la ficha dibuja lo MISMO: cliente, números, vendedor, total y acciones", () => {
    const { container } = pintar([EN_SWITCH]);
    const f = fichas(container)[0];
    expect(f, "la ficha no dibujó la fila").toBeTruthy();
    expect(f.textContent).toContain("Sporting Shoes");
    expect(f.textContent).toContain("PED-017");
    expect(f.textContent).toContain("16-000000503");
    expect(f.textContent).toContain("REINALDO ESPINOSA");
    expect(within(f).getByRole("button", { name: "Ver PDF" })).toBeTruthy();
    expect(abrirMenu(f)).toContain("Editar");
  });

  it("la ficha NO se arrastra de costado: nada de overflow-x adentro", () => {
    const { container } = pintar([EN_SWITCH]);
    const caja = container.querySelector("div.lg\\:hidden") as HTMLElement;
    expect(caja.className).not.toContain("overflow-x-auto");
  });

  it("🔴 todo botón de acción mide 44 px de alto", () => {
    const { container } = pintar([EN_SWITCH, TRABADO]);
    abrirMeses(container);
    const chicos = [...container.querySelectorAll("button")]
      .filter((b) => {
        const t = (b.textContent || "").trim();
        // El encabezado del mes es un renglón de texto, no un control táctil.
        return t !== "" && !/comprobantes?\)/.test(t);
      })
      .filter((b) => !b.className.includes("min-h-[44px]"))
      .map((b) => (b.textContent || "").trim() || b.getAttribute("aria-label"));
    expect(chicos, `botones por debajo de 44 px: ${chicos.join(" · ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("8. 🩸 la lista abre en el mes que TIENE comprobantes", () => {
  it("el caso Joybees: en septiembre abre agosto, no una pantalla vacía", () => {
    const agosto = base({ id_natural: "j1", numero_pedido: "JBP-041", cliente: "City mall frontera", created_at: haceDias(14) });
    const julio = base({ id_natural: "j2", numero_pedido: "JBP-003", cliente: "Contado", created_at: haceDias(52) });
    const { container } = pintar([agosto, julio]);
    // El grupo más nuevo está abierto y su fila se ve.
    expect(container.textContent).toContain("JBP-041");
    expect(trs(container).length).toBeGreaterThan(0);
  });

  it("🔴 el encabezado del mes se escribe «… de …», sin la D mayúscula", () => {
    const { container } = pintar([base({ id_natural: "x", numero_pedido: "PED-100", created_at: "2026-07-15T12:00:00Z" })]);
    const enc = [...container.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .find((t) => /comprobantes?\)/.test(t))!;
    expect(enc).toMatch(/^Julio de 2026/);
    expect(enc).not.toContain(" De ");
  });
});
