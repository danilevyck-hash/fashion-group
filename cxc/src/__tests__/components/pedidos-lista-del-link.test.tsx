/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PEDIDO DEL LINK, EN LA LISTA QUE VE EL VENDEDOR (14-ago-2026)
 *
 * Daniel, textual: *"si yo mando el link al público quiero que el que lo use
 * pueda hacer su pedido, mandar al vendedor el pedido con nombre… así cuando
 * alguien interno le llega el pedido por WhatsApp, pueda entrar al sistema
 * interno, escoger, editar precio, agregar o quitar y ponerle el nombre del
 * cliente para así mandarlo a Switch."*
 *
 * Lo que fija este archivo:
 *   · el pedido del link se VE, con un chip que dice de dónde vino,
 *   · cae en **Borradores** (respeta las dos pestañas de #558/#560: la pestaña
 *     la decide tener número de Switch, y un pedido del link no lo tiene),
 *   · el primer toque lo CONVIERTE (la RPC idempotente de siempre) y recién ahí
 *     abre su detalle, que es donde se elige el cliente y se manda al ERP,
 *   · no ofrece "Duplicar" mientras no exista como pedido interno,
 *   · "Eliminar" pega en la tabla FÍSICA correcta.
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA y se tocan los botones. Que el archivo
 * mencione "Del link" no prueba que el chip se dibuje ni que el toque convierta
 * — un barrido de texto se cumple hasta con el comentario que lo explica, que
 * es el defecto que este repo ya pagó cuatro veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import PedidosListClient from "@/components/catalogo/PedidosListClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...a: unknown[]) => push(...a), refresh: vi.fn() }),
  // El modal de borrado monta `ModalOverlay`, que lee el pathname.
  usePathname: () => "/catalogo/reebok/pedidos",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.fn();
vi.mock("@/components/ToastSystem", () => ({
  useToast: () => ({ toast: (...a: unknown[]) => toast(...a) }),
}));

/** Calcado de producción: PED-021 interno, la fila pública "Nathalie" sin
 *  convertir, y PED-022 —del link, ya convertido y YA en Switch—. */
const PEDIDOS = [
  {
    id: "o-1", order_number: "PED-021", client_name: "Sporting Shoes", vendor_name: "Rey",
    status: "borrador", total: 500, item_count: 2, created_at: "2026-08-01T12:00:00Z",
    en_switch: false, switch_numero: null, fuente: "orders", del_link: false,
  },
  {
    // 🔴 `status: null` — NO "borrador". El público todavía no tiene fila en la
    // tabla de orders, así que no tiene status; inventárselo lo mandaba al chip
    // «Borradores» y el conteo decía 12 donde hay 6.
    id: "ab12cd34", order_number: null, client_name: "Nathalie", vendor_name: null,
    status: null, total: 360, item_count: 1, created_at: "2026-08-10T12:00:00Z",
    en_switch: false, switch_numero: null, fuente: "publicos", del_link: true,
  },
  {
    id: "o-2", order_number: "PED-022", client_name: "Nathalie", vendor_name: null,
    status: "confirmado", total: 120, item_count: 1, created_at: "2026-08-11T12:00:00Z",
    en_switch: true, switch_numero: "16-000000507", fuente: "orders", del_link: true,
  },
];

let llamadas: { url: string; method: string }[] = [];

function sembrarFetch(convertirOk = true) {
  llamadas = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method || "GET" });
    if (u.includes("/convertir")) {
      return { ok: convertirOk, json: async () => (convertirOk ? { order_id: "o-nuevo", order_number: "PED-023" } : {}) } as Response;
    }
    if (u.includes("/orders") && !init?.method) {
      return { ok: true, json: async () => PEDIDOS } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 🩸 El modal de borrado monta `ModalOverlay` → `useSidebarCollapsed`, que
  // lee localStorage; el entorno del arnés no lo trae funcional. Sin esto el
  // test moría al abrir el modal y parecía un fallo del producto.
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  });
  sessionStorage.setItem("cxc_role", "admin");
  sembrarFetch();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

/** 🩸 La lista agrupa por MES y solo abre el actual: hay que desplegar. */
function abrirMeses(c: HTMLElement) {
  for (const b of Array.from(c.querySelectorAll("button"))) {
    if (/\(\d+ comprobantes?\)/.test(b.textContent || "") && !b.querySelector("svg.rotate-90")) {
      fireEvent.click(b);
    }
  }
}

const chipEl = (c: HTMLElement, label: RegExp) =>
  Array.from(c.querySelectorAll('[data-medir="filtro-tipo-comprobante"] button'))
    .find((x) => label.test(x.textContent || ""));

/** Toca un chip de tipo y vuelve a desplegar los meses. */
function tocarChip(c: HTMLElement, label: RegExp) {
  const b = chipEl(c, label);
  expect(b, `no encontré el chip ${label}`).toBeTruthy();
  fireEvent.click(b!);
  abrirMeses(c);
}

async function pintar(rol = "admin") {
  sessionStorage.setItem("cxc_role", rol);
  const r = render(<PedidosListClient marca="reebok" />);
  // El panel abre en «Pedidos»: ahí están el del link sin convertir y PED-022.
  await waitFor(() => expect(chipEl(r.container, /^Pedidos/)).toBeTruthy(), { timeout: 3000 });
  abrirMeses(r.container);
  // "Nathalie" está en DOS filas (la del link sin convertir y PED-022, que
  // también vino del link): getByText tiraría por múltiples coincidencias.
  await waitFor(() => expect(screen.getAllByText("Nathalie").length).toBeGreaterThan(0), { timeout: 3000 });
  return r;
}

const filaDe = (c: HTMLElement, clave: string) => {
  const f = c.querySelector<HTMLElement>(`[data-pedido="${clave}"]`);
  expect(f, `no encontré la fila ${clave}`).toBeTruthy();
  return f!;
};

describe("🔴 el pedido del LINK se ve en la lista", () => {
  it("aparece con el nombre que escribió la persona", async () => {
    const { container } = await pintar();
    const fila = filaDe(container, "ab12cd34");
    expect(fila.textContent).toContain("Nathalie");
  });

  it("🔴 lleva el chip «Del link» — y el convertido también", async () => {
    const { container } = await pintar();
    expect(filaDe(container, "ab12cd34").querySelector('[data-chip="del-link"]')).toBeTruthy();
    // El del link YA convertido lo lleva igual: de ahí vino.
    expect(filaDe(container, "PED-022").querySelector('[data-chip="del-link"]')).toBeTruthy();
    // El interno de siempre NO lo lleva: si lo llevara, el chip no distinguiría.
    tocarChip(container, /^Borradores/);
    expect(filaDe(container, "PED-021").querySelector('[data-chip="del-link"]')).toBeNull();
  });

  it("🔴 el del link SIN convertir cae en «Pedidos», NO en «Borradores»", async () => {
    // Es la consecuencia de que su `status` vaya null: no tiene fila en orders,
    // así que no es un borrador. Meterlo ahí inflaba el conteo al doble.
    const { container } = await pintar();
    expect(container.querySelector('[data-pedido="ab12cd34"]')).toBeTruthy();
    tocarChip(container, /^Borradores/);
    expect(container.querySelector('[data-pedido="ab12cd34"]')).toBeNull();
    expect(container.querySelector('[data-pedido="PED-021"]')).toBeTruthy();
  });

  it("dice que todavía no tiene número, en vez de inventar uno", async () => {
    const { container } = await pintar();
    expect(filaDe(container, "ab12cd34").textContent).toContain("Se numera al abrirlo");
    expect(filaDe(container, "ab12cd34").textContent).not.toMatch(/PED-\d/);
  });

  it("🔴 y su fila dice que NO se ha mandado a Switch (no un guion)", async () => {
    const { container } = await pintar();
    expect(filaDe(container, "ab12cd34").textContent).toContain("No se ha mandado a Switch");
    expect(filaDe(container, "PED-022").textContent).toMatch(/Pedido en Switch: 16-000000507/);
  });
});

describe("🔴 el primer toque lo convierte y abre su detalle", () => {
  it("llama a convertir con el short_id y navega al pedido nuevo", async () => {
    const { container } = await pintar();
    await act(async () => { fireEvent.click(filaDe(container, "ab12cd34")); });
    const conv = llamadas.filter((l) => l.url.includes("/pedidos-publicos/ab12cd34/convertir"));
    expect(conv).toHaveLength(1);
    expect(conv[0].method).toBe("POST");
    expect(push).toHaveBeenCalledWith("/catalogo/reebok/pedido/o-nuevo");
  });

  it("un pedido INTERNO no pasa por convertir: abre directo", async () => {
    const { container } = await pintar();
    // PED-021 es `status='borrador'`: vive en su chip, no en el que abre.
    tocarChip(container, /^Borradores/);
    await act(async () => { fireEvent.click(filaDe(container, "PED-021")); });
    expect(llamadas.some((l) => l.url.includes("/convertir"))).toBe(false);
    expect(push).toHaveBeenCalledWith("/catalogo/reebok/pedido/o-1");
  });

  it("si la conversión falla, lo dice y NO navega a ningún lado", async () => {
    sembrarFetch(false);
    const { container } = await pintar();
    await act(async () => { fireEvent.click(filaDe(container, "ab12cd34")); });
    expect(push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalled();
  });
});

describe("🔴 lo que NO se le ofrece a un pedido del link sin convertir", () => {
  it("no tiene botón Duplicar (todavía no existe como pedido interno)", async () => {
    const { container } = await pintar();
    const botones = (f: HTMLElement) =>
      Array.from(f.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
    expect(botones(filaDe(container, "ab12cd34"))).not.toContain("Duplicar");
    // Uno interno sí lo tiene: si no, el test no probaría nada.
    expect(botones(filaDe(container, "PED-022"))).toContain("Duplicar");
  });

  it("🔴 Eliminar pega en la tabla FÍSICA correcta (publicos, no orders)", async () => {
    const { container } = await pintar();
    const btnBorrar = Array.from(filaDe(container, "ab12cd34").querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim() === "Eliminar");
    expect(btnBorrar, "el admin tiene que poder borrar").toBeTruthy();
    fireEvent.click(btnBorrar!);
    // ConfirmDeleteModal habilita su botón rojo recién al segundo (freno para
    // acciones destructivas): se espera a que se pueda tocar de verdad.
    const confirmar = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>("button.bg-red-600");
      expect(b && !b.disabled).toBe(true);
      return b!;
    }, { timeout: 3000 });
    await act(async () => { fireEvent.click(confirmar); });
    await waitFor(() => {
      const del = llamadas.filter((l) => l.method === "DELETE");
      expect(del).toHaveLength(1);
      expect(del[0].url).toContain("/pedidos-publicos/ab12cd34");
      expect(del[0].url).not.toContain("/orders/ab12cd34");
    });
  });

  it("🔴 al VENDEDOR no se le ofrece Eliminar, ni exportar, ni el borrado masivo", async () => {
    // Cosmética: el SERVIDOR ya le responde 403 a los tres (medido con cookies
    // firmadas). Se esconden para no ofrecer lo que no se puede.
    const { container } = await pintar("vendedor");
    const textos = (f: HTMLElement) =>
      Array.from(f.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
    expect(textos(filaDe(container, "ab12cd34"))).not.toContain("Eliminar");
    expect(textos(filaDe(container, "PED-022"))).not.toContain("Eliminar");
    expect(textos(container)).not.toContain("Exportar Excel");
    expect(container.textContent).not.toContain("Seleccionar todos");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    // Y lo que SÍ puede sigue estando.
    expect(textos(filaDe(container, "PED-022"))).toContain("Duplicar");
    expect(textos(filaDe(container, "PED-022"))).toContain("Editar");
  });
});
