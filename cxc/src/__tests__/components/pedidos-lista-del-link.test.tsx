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

function sembrarFetch(convertirOk = true, filas: unknown[] = PEDIDOS) {
  llamadas = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method || "GET" });
    if (u.includes("/convertir")) {
      return { ok: convertirOk, json: async () => (convertirOk ? { order_id: "o-nuevo", order_number: "PED-023" } : {}) } as Response;
    }
    if (u.includes("/orders") && !init?.method) {
      return { ok: true, json: async () => filas } as Response;
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

/**
 * 🩸 NOTA FECHADA — 9-sep-2026: ESTE CANDADO SE VENCIÓ SOLO, POR CALENDARIO.
 *
 * El 6-sep-2026 nació la regla «el pedido del link que nadie confirmó dura 30
 * días en la lista» (`comprobantes-ventana.ts`). Las fechas de este fixture
 * están calcadas de producción —agosto de 2026— y la pantalla parte la lista
 * contra el reloj de VERDAD, así que la fila `ab12cd34` (del link, sin
 * confirmar, del 10-ago) cumplió sus 30 días **el 9-sep** y se fue detrás de
 * «Ver más». Los 11 casos murieron el mismo día en `filaDe()`, sin que nadie
 * tocara ni la pantalla ni el archivo.
 *
 * 🔴 La pantalla NO tiene defecto y la regla NO cambió: se comprobó que con la
 * fila dentro de la ventana los 12 casos pasan tal como estaban escritos —
 * incluido el del VENDEDOR, o sea que **no hay ningún agujero de permisos**.
 *
 * Lo que se corrige es el candado, con el MISMO remedio que ya eligió su
 * hermano `pedidos-chips-y-verdad-de-la-fila.test.tsx` (4-sep-2026): se toca
 * «Ver más» —lo que haría una persona— en vez de congelar el reloj. Así el
 * candado mide la pantalla de verdad y no se vuelve a vencer solo. El control
 * al revés vive abajo, en «la ventana de 30 días sigue mordiendo».
 */
function verTodo(c: HTMLElement) {
  for (const b of Array.from(c.querySelectorAll("button"))) {
    if (/^Ver más \(\d+\)$/.test((b.textContent || "").trim())) fireEvent.click(b);
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
  verTodo(c);
  abrirMeses(c);
}

async function pintar(rol = "admin") {
  sessionStorage.setItem("cxc_role", rol);
  const r = render(<PedidosListClient marca="reebok" />);
  // El panel abre en «Pedidos»: ahí están el del link sin convertir y PED-022.
  await waitFor(() => expect(chipEl(r.container, /^Pedidos/)).toBeTruthy(), { timeout: 3000 });
  // La ventana (90 días, y 30 para el del link sin confirmar) deja el fixture
  // de agosto detrás de «Ver más». Ver la nota fechada de arriba.
  verTodo(r.container);
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


// ⚠️ 6-sep-2026 — «Editar · Duplicar · Reenviar el correo · Eliminar» se MUDARON
// al «···» de la casa (`OverflowMenu`) y a la fila salió «Ver PDF»: en la fila,
// «Eliminar» era el botón más a la vista. Las acciones son las MISMAS; cambió
// dónde se tocan, así que el candado toca donde se toca ahora.
function opcionesDelMenu(fila: HTMLElement): string[] {
  const kebab = Array.from(fila.querySelectorAll("button")).find(
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

/** El botón de una opción del «···», ya abierto. */
function tocarOpcion(fila: HTMLElement, label: string): boolean {
  const kebab = Array.from(fila.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "").startsWith("Más opciones"),
  );
  if (!kebab) return false;
  fireEvent.click(kebab);
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (b) => (b.textContent || "").trim() === label,
  ) as HTMLButtonElement | undefined;
  if (!item) { fireEvent.keyDown(window, { key: "Escape" }); return false; }
  fireEvent.click(item);
  return true;
}

describe("🔴 lo que NO se le ofrece a un pedido del link sin convertir", () => {
  it("no ofrece Duplicar (todavía no existe como pedido interno)", async () => {
    const { container } = await pintar();
    expect(opcionesDelMenu(filaDe(container, "ab12cd34"))).not.toContain("Duplicar");
    // Uno interno que YA está en Switch sí lo tiene: si no, el test no probaría
    // nada. (Duplicar solo se dibuja donde el servidor lo permite — a los que no
    // salieron les contesta 409, ver `duplicar-pedido.ts`.)
    expect(opcionesDelMenu(filaDe(container, "PED-022"))).toContain("Duplicar");
  });

  it("🔴 tampoco ofrece «Ver PDF»: no hay pedido interno del que sacarlo", async () => {
    const { container } = await pintar();
    const botones = (f: HTMLElement) =>
      Array.from(f.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
    expect(botones(filaDe(container, "ab12cd34"))).not.toContain("Ver PDF");
    expect(botones(filaDe(container, "PED-022"))).toContain("Ver PDF");
  });

  it("🔴 Eliminar pega en la tabla FÍSICA correcta (publicos, no orders)", async () => {
    const { container } = await pintar();
    expect(tocarOpcion(filaDe(container, "ab12cd34"), "Eliminar"), "el admin tiene que poder borrar").toBe(true);
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
    expect(opcionesDelMenu(filaDe(container, "ab12cd34"))).not.toContain("Eliminar");
    expect(opcionesDelMenu(filaDe(container, "PED-022"))).not.toContain("Eliminar");
    expect(textos(container)).not.toContain("Exportar Excel");
    expect(container.textContent).not.toContain("Seleccionar todos");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    // Y lo que SÍ puede sigue estando.
    expect(opcionesDelMenu(filaDe(container, "PED-022"))).toContain("Duplicar");
    expect(opcionesDelMenu(filaDe(container, "PED-022"))).toContain("Editar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CONTROL AL REVÉS (9-sep-2026)
//
// El arreglo de arriba toca «Ver más». Sin este control, ese toque podría estar
// tapando que la ventana dejó de funcionar — y nadie se enteraría. Aquí se
// comprueba que la regla del 6-sep SIGUE MORDIENDO: un pedido del link que
// nadie confirmó desaparece de la lista a los 30 días, y el que el cliente SÍ
// confirmó se queda con los 90 de siempre.
//
// 🔴 Las fechas van RELATIVAS al día en que corre la prueba, no escritas a
// mano: escribirlas a mano es exactamente lo que venció a este archivo.
// ─────────────────────────────────────────────────────────────────────────────
const haceDias = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe("🔴 la ventana de 30 días sigue mordiendo al pedido del link", () => {
  const VIEJOS = [
    {
      id: "o-9", order_number: "PED-030", client_name: "Sporting Shoes", vendor_name: "Rey",
      status: "confirmado", total: 500, item_count: 2, created_at: haceDias(1),
      en_switch: false, switch_numero: null, fuente: "orders", del_link: false,
    },
    {
      // Del link, 45 días, NADIE lo confirmó: es el carrito abandonado.
      id: "abandonado", order_number: null, client_name: "Nathalie", vendor_name: null,
      status: null, total: 360, item_count: 1, created_at: haceDias(45),
      en_switch: false, switch_numero: null, fuente: "publicos", del_link: true,
      confirmado_cliente_at: null,
    },
    {
      // Del link, los MISMOS 45 días, pero el cliente SÍ lo confirmó: eso es
      // trabajo esperando, y se queda con los 90 días de siempre.
      id: "confirmado", order_number: null, client_name: "Marisol", vendor_name: null,
      status: null, total: 200, item_count: 1, created_at: haceDias(45),
      en_switch: false, switch_numero: null, fuente: "publicos", del_link: true,
      confirmado_cliente_at: haceDias(45),
    },
  ];

  it("el abandonado se esconde y vuelve con «Ver más»; el confirmado nunca se fue", async () => {
    sembrarFetch(true, VIEJOS);
    const { container } = render(<PedidosListClient marca="reebok" />);
    await waitFor(() => expect(chipEl(container, /^Pedidos/)).toBeTruthy(), { timeout: 3000 });
    abrirMeses(container);
    await waitFor(() => expect(container.querySelector('[data-pedido="confirmado"]')).toBeTruthy(), { timeout: 3000 });

    // A los 45 días sin confirmar, fuera de la lista — pero NO borrado.
    expect(container.querySelector('[data-pedido="abandonado"]')).toBeNull();

    verTodo(container);
    abrirMeses(container);
    expect(container.querySelector('[data-pedido="abandonado"]')).toBeTruthy();
  });
});
