/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — EL FORMULARIO DE ALTA, MONTADO DE VERDAD (4-sep-2026).
 *
 * El patrón real de uso (medido en producción) es la TANDA: la secretaria
 * acumula ~38 recibos de semanas atrás y los teclea todos en una sentada con
 * «Guardar y nuevo». De ahí las reglas de este archivo:
 *
 *  - la FECHA elegida se queda para el siguiente gasto (volvía a hoy en cada
 *    uno y había que corregirla 38 veces);
 *  - el ITBMS arranca PLEGADO (lo tienen 9 de 77 gastos) y abrirlo no cambia
 *    la cuenta: total = subtotal + itbms, con itbms = 0 si está plegado;
 *  - el N° de factura es opcional: vacío guarda (43 de 77 lo tienen);
 *  - 🔴 el PROVEEDOR sigue siendo texto libre SIN lista de sugerencias.
 *    Daniel dijo *«no»* a la lista de proveedores ya usados — candado
 *    explícito: si aparece un datalist o un listbox ahí, esto se pone rojo.
 *
 * Fechas FIJAS (2026-06-15), nunca `new Date()` en las aserciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import NuevoGastoDrawer from "@/app/caja/components/NuevoGastoDrawer";

const FECHA_RECIBO = "2026-06-15";
const PERIODO = { id: "p-1", fondo_inicial: 200 };

let posts: Array<Record<string, unknown>>;

/** jsdom trae un `localStorage` a medias en este arnés: memoria propia. */
function memStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  } as Storage;
}

function stubApi() {
  posts = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/api/caja/categorias")) return j(["Transporte", "Varios"]);
    if (url.includes("/api/caja/responsables")) return j([{ id: "r1", nombre: "Maria", activo: true }]);
    if (url.includes("/api/caja/gastos") && method === "POST") {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return j({ id: "g-nuevo" });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

function montar() {
  const onSaved = vi.fn();
  render(
    <NuevoGastoDrawer
      open
      onClose={vi.fn()}
      periodo={PERIODO}
      totalGastado={0}
      isOwner={false}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

/** Llena lo obligatorio y espera a que el botón se encienda (el responsable
 *  recordado llega recién cuando carga el catálogo). */
async function llenarMinimo() {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: FECHA_RECIBO } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Taxi al banco" } });
  fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "La Gran Parrilla" } });
  fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10" } });
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Guardar y nuevo" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  }, { timeout: 3000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memStorage());
  // Responsable recordado (fg_last_*): así el formulario queda completo sin
  // pelear con el SearchableSelect en jsdom.
  localStorage.setItem("fg_last_caja_responsable", "r1");
  stubApi();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 «Guardar y nuevo» conserva la fecha elegida", () => {
  it("tras guardar, la fecha sigue siendo la del recibo (no vuelve a hoy)", async () => {
    montar();
    await llenarMinimo();

    fireEvent.click(screen.getByRole("button", { name: "Guardar y nuevo" }));
    await waitFor(() => expect(posts).toHaveLength(1));

    expect(posts[0].fecha).toBe(FECHA_RECIBO);
    // La fecha SE QUEDA para el siguiente recibo de la tanda…
    expect((screen.getByLabelText("Fecha") as HTMLInputElement).value).toBe(FECHA_RECIBO);
    // …y lo que sí se limpia, se limpió.
    expect((screen.getByLabelText("Descripción") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Subtotal") as HTMLInputElement).value).toBe("");
  });
});

describe("el ITBMS arranca plegado y no cambia la cuenta", () => {
  it("plegado: sin selector, y el gasto sale con itbms 0 y total = subtotal", async () => {
    montar();
    await llenarMinimo();

    // Plegado: ni selector de porcentaje, ni línea calculada, ni Total aparte.
    expect(screen.queryByText(/Calculado al/)).toBeNull();
    expect(screen.queryByLabelText("Total")).toBeNull();
    expect(screen.getByRole("button", { name: /Agregar ITBMS/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar y nuevo" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].itbms).toBe(0);
    expect(posts[0].total).toBe(10);
    expect(posts[0].subtotal).toBe(10);
  });

  it("abierto en 0% la cuenta es idéntica; en 7% suma exactamente el impuesto", async () => {
    montar();
    await llenarMinimo();

    fireEvent.click(screen.getByRole("button", { name: /Agregar ITBMS/ }));
    // El único <select> nativo del formulario es el de ITBMS (responsable y
    // categoría son inputs con role combobox, por eso se busca por tag).
    const selector = document.querySelector("select") as HTMLSelectElement;
    expect(selector).toBeTruthy();
    // Abierto con 0%: mismo total que plegado.
    fireEvent.click(screen.getByRole("button", { name: "Guardar y nuevo" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].itbms).toBe(0);
    expect(posts[0].total).toBe(10);

    // Con 7%: total = subtotal + itbms, y nada más. El selector sigue abierto
    // (dentro de la misma tanda no se vuelve a plegar solo).
    await llenarMinimo();
    fireEvent.change(selector, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y nuevo" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].itbms).toBe(0.7);
    expect(posts[1].total).toBe(10.7);
  });
});

describe("el N° de factura es opcional", () => {
  it("factura vacía guarda sin pedir nada", async () => {
    montar();
    await llenarMinimo();
    expect((screen.getByLabelText("Nº de factura") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Guardar y nuevo" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].nro_factura).toBe("");
  });
});

describe("🔴 el proveedor es texto libre, SIN lista de sugerencias (Daniel: «no»)", () => {
  it("escribir en Proveedor no abre ninguna lista, ni datalist, ni listbox", async () => {
    montar();

    const proveedor = screen.getByLabelText("Proveedor") as HTMLInputElement;
    expect(proveedor.tagName).toBe("INPUT");
    // Sin datalist atado al campo…
    expect(proveedor.getAttribute("list")).toBeNull();
    expect(document.querySelector("datalist")).toBeNull();

    fireEvent.focus(proveedor);
    fireEvent.change(proveedor, { target: { value: "La Gran" } });
    // …y escribir no despliega opciones de ningún tipo.
    expect(screen.queryAllByRole("listbox")).toHaveLength(0);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
