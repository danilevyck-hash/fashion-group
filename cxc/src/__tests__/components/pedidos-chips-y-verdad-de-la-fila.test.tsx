/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PANTALLA ÚNICA DE COMPROBANTES — LOS CHIPS, Y LA VERDAD EN CADA FILA
 *
 * 🔴 QUÉ PASÓ ACÁ (25-ago-2026). Este archivo se llamaba
 * `pedidos-dos-pestanas.test.tsx` y congelaba las DOS pestañas de la lista del
 * vendedor —Borradores · Pedidos a Switch— que Daniel pidió el 14-ago y que
 * partían por `en_switch` (tener envío ACTIVO).
 *
 * El 25-ago las dos pantallas de pedidos se volvieron UNA, y la que quedó usa
 * los TRES CHIPS del #608 —Pedidos · Cotizaciones · Borradores—, que parten por
 * OTRA pregunta: `status`. Son dos instrucciones de Daniel sobre dos pantallas
 * que ahora son la misma, y CHOCAN en un punto concreto: **ya no hay un toque
 * que responda "¿qué salió a Switch?"**. Está reportado como decisión suya.
 *
 * 🩸 LO QUE ESTE CANDADO NO SUELTA. La razón de ser de aquellas pestañas era que
 * `status` MIENTE: medido sobre los 100 pedidos de la historia de los 4
 * catálogos, 7 pedidos `confirmado` nunca llegaron a Switch (PED-001/002/003/004
 * y TOM-007/008/009) y PED-018 decía `borrador` estando en Switch con el
 * #16-000000506. Esa verdad NO se perdió: se mudó de la ETIQUETA DE LA PESTAÑA a
 * LA FILA, que ahora dice con todas las letras «Pedido en Switch: 16-000000506»
 * o «No se ha mandado a Switch». La fila informa aunque el chip organice, y eso
 * es lo que se exige acá, pedido por pedido, con el mismo fixture de producción.
 *
 * 🔴 CANDADOS DE CONDUCTA: se RENDERIZA y se lee el DOM. Un barrido de texto
 * sobre el archivo pasaría estando mutado —y encima se cumpliría solo con el
 * comentario que explica el cambio—, que es el defecto que este repo ya pagó
 * cuatro veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import PedidosListClient from "@/components/catalogo/PedidosListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ToastSystem", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/** Los 8 pedidos que importan, calcados de producción. */
const PEDIDOS = [
  // Los 4 Reebok `confirmado` que NUNCA llegaron a Switch.
  { id: "1", order_number: "PED-001", client_name: "Cliente A", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-05-19T12:00:00Z", en_switch: false, switch_numero: null, switch_documento: null, fuente: "orders", del_link: false },
  { id: "2", order_number: "PED-002", client_name: "Cliente B", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-06-02T12:00:00Z", en_switch: false, switch_numero: null, switch_documento: null, fuente: "orders", del_link: false },
  { id: "3", order_number: "PED-003", client_name: "Cliente C", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-06-03T12:00:00Z", en_switch: false, switch_numero: null, switch_documento: null, fuente: "orders", del_link: false },
  { id: "4", order_number: "PED-004", client_name: "Cliente D", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-07-04T12:00:00Z", en_switch: false, switch_numero: null, switch_documento: null, fuente: "orders", del_link: false },
  // El que decía `borrador` y SÍ está en Switch.
  { id: "5", order_number: "PED-018", client_name: "Cliente E", vendor_name: null, status: "borrador", total: 100, item_count: 1, created_at: "2026-07-21T12:00:00Z", en_switch: true, switch_numero: "16-000000506", switch_documento: "pedido", fuente: "orders", del_link: false },
  // Un confirmado que sí salió, con su número.
  { id: "6", order_number: "PED-020", client_name: "Cliente F", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-07-25T12:00:00Z", en_switch: true, switch_numero: "16-000000510", switch_documento: "pedido", fuente: "orders", del_link: false },
  // Un borrador de verdad.
  { id: "7", order_number: "PED-021", client_name: "Cliente G", vendor_name: null, status: "borrador", total: 100, item_count: 1, created_at: "2026-08-01T12:00:00Z", en_switch: false, switch_numero: null, switch_documento: null, fuente: "orders", del_link: false },
  // ⚠️ El caso a medio camino: en Switch pero SIN número. Hoy 0 en producción.
  { id: "8", order_number: "PED-022", client_name: "Cliente H", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-08-05T12:00:00Z", en_switch: true, switch_numero: null, switch_documento: "pedido", fuente: "orders", del_link: false },
];

beforeEach(() => {
  sessionStorage.setItem("cxc_role", "admin");
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes("/orders")) {
      return { ok: true, json: async () => PEDIDOS } as Response;
    }
    return { ok: true, json: async () => [] } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

/**
 * 🩸 GOTCHA YA PAGADO: la lista agrupa por MES y solo abre el mes ACTUAL. Las
 * filas de los meses viejos existen pero NO están montadas, así que esperar una
 * de mayo sin desplegar nada da un plantón de 3 s y un rojo que no es del
 * cambio. Primero se despliegan los meses, DESPUÉS se buscan las filas.
 */
function abrirMeses(container: HTMLElement) {
  for (const b of Array.from(container.querySelectorAll("button"))) {
    if (/\(\d+ comprobantes?\)/.test(b.textContent || "")) {
      if (!b.querySelector("svg.rotate-90")) fireEvent.click(b);
    }
  }
}

/**
 * 🩸 SEGUNDO GOTCHA (4-sep-2026): la lista arranca en los ÚLTIMOS 90 DÍAS y el
 * resto queda detrás de «Ver más» (`comprobantes-ventana.ts`). Este fixture está
 * calcado de producción con sus fechas REALES (mayo a agosto de 2026), así que
 * a medida que pasa el tiempo va cayendo fuera de la ventana. Se toca «Ver más»
 * —lo mismo que haría una persona— en vez de congelar el reloj: así el candado
 * mide la pantalla de verdad y no envejece.
 */
function verTodo(container: HTMLElement) {
  for (const b of Array.from(container.querySelectorAll("button"))) {
    if (/^Ver más \(\d+\)$/.test((b.textContent || "").trim())) fireEvent.click(b);
  }
}

async function pintar() {
  const r = render(<PedidosListClient marca="reebok" />);
  // El panel abre en «Pedidos», y ahí están los 4 `confirmado` que nunca salieron.
  await waitFor(() => expect(chips(r.container).length).toBe(3), { timeout: 3000 });
  verTodo(r.container);
  abrirMeses(r.container);
  await waitFor(() => expect(screen.getByText("PED-001")).toBeTruthy(), { timeout: 3000 });
  return r;
}

/** Los chips de tipo, con su conteo al lado. */
function chips(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('[data-medir="filtro-tipo-comprobante"] button'),
  ).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
}

/**
 * Los números de pedido a la vista.
 * 🩸 Se leen del bloque de números de CADA fila, no de un barrido de texto: el
 * `textContent` de la celda pega el nombre del cliente con el número
 * ("Cliente A" + "PED-001" = "APED-001") y el candado empezaba a comparar
 * basura contra basura.
 */
const numeros = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("div.leading-snug"))
    .map((d) => (d.querySelector("span")?.textContent || "").trim())
    .filter((t) => /^[A-Z]+-\d+$/.test(t));

/** La FILA de un pedido: el <tr> que lo contiene. */
function filaDe(container: HTMLElement, numero: string): HTMLElement {
  const tr = Array.from(container.querySelectorAll("tr")).find((f) =>
    (f.textContent || "").includes(numero),
  );
  expect(tr, `no encontré ninguna fila con ${numero}`).toBeTruthy();
  return tr as HTMLElement;
}

const tocar = (c: HTMLElement, label: RegExp) => {
  const b = Array.from(c.querySelectorAll('[data-medir="filtro-tipo-comprobante"] button'))
    .find((x) => label.test(x.textContent || ""));
  expect(b, `no encontré el chip ${label}`).toBeTruthy();
  fireEvent.click(b!);
  abrirMeses(c); // cambiar de chip rearma los grupos: hay que volver a desplegar
};

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 son EXACTAMENTE tres chips, y particionan", () => {
  it("hay tres, ni uno más, y en su orden", async () => {
    const { container } = await pintar();
    const c = chips(container);
    expect(c).toHaveLength(3);
    expect(c[0]).toMatch(/^Pedidos\d+$/);
    expect(c[1]).toMatch(/^Cotizaciones\d+$/);
    expect(c[2]).toMatch(/^Borradores\d+$/);
  });

  it("no vuelven «Todos», «Confirmado» ni «Enviado»", async () => {
    const { container } = await pintar();
    const c = chips(container).join(" | ");
    for (const muerta of ["Todos", "Confirmado", "Enviado"]) {
      expect(c, `volvió el chip "${muerta}"`).not.toMatch(new RegExp(`\\b${muerta}\\b`));
    }
  });

  it("🩸 los conteos SUMAN el total: sin «Todos», una fila sin chip es invisible", async () => {
    const { container } = await pintar();
    const n = chips(container).map((t) => Number(t.match(/(\d+)$/)?.[1] ?? -1));
    expect(n.some((x) => x < 0)).toBe(false);
    expect(n.reduce((a, b) => a + b, 0)).toBe(PEDIDOS.length);
    // 2 borradores (PED-018 y PED-021) · 0 cotizaciones · 6 pedidos.
    expect(chips(container)[2]).toBe("Borradores2");
    expect(chips(container)[1]).toBe("Cotizaciones0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA FILA DICE LA VERDAD, aunque el chip organice por otra cosa", () => {
  it("PED-018 cae en «Borradores» por su status — y su fila SIGUE diciendo que está en Switch", async () => {
    const { container } = await pintar();
    // No está en «Pedidos»: su status es 'borrador' y el borrador gana.
    expect(numeros(container)).not.toContain("PED-018");
    tocar(container, /^Borradores/);
    expect(numeros(container)).toContain("PED-018");
    // 🩸 Y acá está lo que las pestañas viejas protegían: la verdad no se perdió.
    const fila = filaDe(container, "PED-018");
    expect(fila.textContent).toContain("16-000000506");
    expect(fila.textContent).toMatch(/Pedido en Switch/);
  });

  it("los 4 que decían «confirmado» sin haber salido lo DICEN en su fila", async () => {
    const { container } = await pintar();
    for (const n of ["PED-001", "PED-002", "PED-003", "PED-004"]) {
      expect(numeros(container), `${n} tiene que estar a la vista`).toContain(n);
      expect(filaDe(container, n).textContent, n).toContain("No se ha mandado a Switch");
    }
  });

  it("el número va pegado a SU pedido, no suelto en la pantalla", async () => {
    const { container } = await pintar();
    const f18 = filaDe(container, "PED-020");
    expect(f18.textContent).toContain("16-000000510");
    expect(f18.textContent).not.toContain("16-000000506");
    tocar(container, /^Borradores/);
    const otra = filaDe(container, "PED-018");
    expect(otra.textContent).toContain("16-000000506");
    expect(otra.textContent).not.toContain("16-000000510");
  });

  it("la píldora de estado («Confirmado») no vuelve: mentía en 8 de 100", async () => {
    const { container } = await pintar();
    for (const chip of [/^Pedidos/, /^Borradores/]) {
      tocar(container, chip);
      const pildoras = Array.from(container.querySelectorAll(".rounded-full"))
        .map((e) => (e.textContent || "").trim());
      expect(pildoras).not.toContain("Confirmado");
      expect(pildoras).not.toContain("Enviado");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ el caso a medio camino: en Switch pero sin número", () => {
  // Hoy son 0 de 100 en los 4 catálogos (los 31 envíos activos están
  // 'verificado' y los 31 tienen número). Pero el camino existe en el código,
  // así que se define su conducta en vez de dejarla al azar.
  it("NO se inventa un número: se dice que falta", async () => {
    const { container } = await pintar();
    const fila = filaDe(container, "PED-022");
    expect(fila.textContent).toMatch(/en Switch, sin número/);
    // Y no aparece un "?" pintado como si fuera el número.
    expect(fila.textContent).not.toMatch(/Switch: \?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el buscador encuentra por los DOS números", () => {
  it("por el de la casa y por el del ERP", async () => {
    const { container } = await pintar();
    const caja = container.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]')!;
    fireEvent.change(caja, { target: { value: "16-000000510" } });
    expect(numeros(container)).toEqual(["PED-020"]);
    fireEvent.change(caja, { target: { value: "PED-001" } });
    expect(numeros(container)).toEqual(["PED-001"]);
  });
});
