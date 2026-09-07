/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA PANTALLA DEL REDISEÑO, MONTADA DE VERDAD (7-sep-2026).
 *
 *  1. 🔴 AVISA, NUNCA BLOQUEA: el mismo recibo cargado dos veces y la fecha
 *     fuera del período salen con «Guardar igual».
 *  2. 🔴 EL GASTO NO PIDE RESPONSABLE — el campo se fue del formulario.
 *  3. 🔴 «Alimentación» viene puesta (61% de los recibos; antes «Transporte»,
 *     con 13%).
 *  4. 🔴 LA FOTO ES OPCIONAL y se arrastra o se toca — un solo cuadro.
 *  5. 🩸 «Editar» funciona en pantalla angosta: hasta hoy el menú lo ofrecía y
 *     el formulario solo existía en la tabla de escritorio.
 *  6. 🩸 La ficha angosta muestra el N° de factura — sin él, los dos recibos
 *     repetidos de Super 99 se veían idénticos.
 *
 * Fechas FIJAS, nunca `new Date()` en las aserciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import NuevoGastoDrawer from "@/app/caja/components/NuevoGastoDrawer";
import FichaGasto from "@/app/caja/components/FichaGasto";
import type { CajaGasto } from "@/app/caja/components/types";

// El período Nº3 real: abrió el 2-sep y 25 de sus 26 recibos son anteriores.
const PERIODO = {
  id: "p-3",
  numero: 3,
  fondo_inicial: 200,
  fecha_apertura: "2026-09-02",
  fecha_cierre: null,
  gastos: [
    { id: "g-1", fecha: "2026-09-03", proveedor: "Super 99", nro_factura: "196854200", total: 10.59 },
    { id: "g-2", fecha: "2026-09-03", proveedor: "La Parrillada", nro_factura: "", total: 5 },
  ],
};

let posts: Array<Record<string, unknown>>;

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
    if (url.includes("/api/caja/categorias")) return j(["Alimentación", "Transporte", "Varios"]);
    if (url.includes("/fotos")) return j({ fotos: [] });
    if (url.includes("/api/caja/gastos") && method === "POST") {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return j({ id: "g-nuevo" });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

function montarDrawer() {
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

/** Llena lo obligatorio con un recibo que NO dispara ningún aviso. */
async function llenarLimpio() {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-04" } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Almuerzo" } });
  fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Cochez" } });
  fireEvent.change(screen.getByLabelText("Nº de factura"), { target: { value: "750023" } });
  fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "1.39" } });
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Guardar gasto" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  }, { timeout: 3000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memStorage());
  stubApi();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ── 1. Avisa, nunca bloquea ─────────────────────────────────────────────────

describe("🔴 1. AVISA, NUNCA BLOQUEA", () => {
  it("un gasto igual al de Super 99 avisa ANTES de guardar, y no guarda todavía", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Super 99" } });
    fireEvent.change(screen.getByLabelText("Nº de factura"), { target: { value: "196854200" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-03" } });
    fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10.59" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));

    await screen.findByText(/Ya hay un gasto igual el 3 de septiembre/);
    expect(posts).toHaveLength(0);

    // 🔴 «Guardar igual» existe y guarda de verdad.
    fireEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].nro_factura).toBe("196854200");
  });

  it("un recibo anterior a la apertura del período avisa, con «Guardar igual»", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-06-23" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await screen.findByText(/antes de que abriera el período Nº 3/);
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].fecha).toBe("2026-06-23");
  });

  it("«Cancelar» NO guarda", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-06-23" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await screen.findByText(/antes de que abriera/);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText(/antes de que abriera/)).toBeNull());
    expect(posts).toHaveLength(0);
  });

  it("🔴 CONTROL: un recibo normal guarda DERECHO, sin ningún cuadro de por medio", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Guardar igual" })).toBeNull();
  });
});

// ── 2 y 3. Sin responsable, con Alimentación puesta ─────────────────────────

describe("🔴 2 y 3. EL GASTO NO PIDE RESPONSABLE, Y «ALIMENTACIÓN» VIENE PUESTA", () => {
  it("el formulario no tiene campo Responsable, y el gasto sale sin él", async () => {
    montarDrawer();
    expect(screen.queryByLabelText("Responsable")).toBeNull();
    expect(screen.queryByText("Responsable")).toBeNull();

    await llenarLimpio();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).not.toHaveProperty("responsable_id");
    expect(posts[0]).not.toHaveProperty("responsable");
  });

  it("«Alimentación» es la categoría con la que abre — es el 61% de los recibos", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].categoria).toBe("Alimentación");
  });

  it("🔴 CONTROL: es una PRESELECCIÓN — «taxi» en el concepto la cambia sola a Transporte", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Taxi al banco" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].categoria).toBe("Transporte");
  });

  it("🩸 «comida» vuelve a caer en Alimentación: la regla se comparaba CON acentos", async () => {
    // La lista de palabras dice «Alimentacion» y la categoría real es
    // «Alimentación»: comparadas con acentos, esa regla NO podía dispararse
    // nunca. Medido: de 10 gastos en «Transporte», 3 dicen comida.
    montarDrawer();
    await llenarLimpio();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Taxi al banco" } });
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Comida del equipo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].categoria).toBe("Alimentación");
  });
});

// ── 4. La foto ──────────────────────────────────────────────────────────────

describe("🔴 4. LA FOTO DEL RECIBO — un cuadro, opcional, se arrastra o se toca", () => {
  it("hay UN solo cuadro, y dice que es opcional y que se puede arrastrar", () => {
    montarDrawer();
    const zona = screen.getByRole("button", { name: "Foto del recibo" });
    expect(zona.textContent).toContain("Arrastra");
    expect(zona.textContent).toContain("opcional");
    expect(screen.getAllByRole("button", { name: "Foto del recibo" })).toHaveLength(1);
  });

  it("🔴 sin foto se guarda igual: es opcional, no obligatoria", async () => {
    montarDrawer();
    await llenarLimpio();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
  });

  it("🔴 la lista SUMA: dos elegidas en dos veces quedan las dos", () => {
    montarDrawer();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const a = new File(["a"], "recibo-1.jpg", { type: "image/jpeg" });
    const b = new File(["b"], "recibo-2.jpg", { type: "image/jpeg" });

    fireEvent.change(input, { target: { files: [a] } });
    expect(screen.getByText("recibo-1.jpg")).toBeTruthy();
    fireEvent.change(input, { target: { files: [b] } });
    expect(screen.getByText("recibo-1.jpg")).toBeTruthy();
    expect(screen.getByText("recibo-2.jpg")).toBeTruthy();

    // Y se quita UNA sin perder la otra.
    fireEvent.click(screen.getByRole("button", { name: "Quitar recibo-1.jpg" }));
    expect(screen.queryByText("recibo-1.jpg")).toBeNull();
    expect(screen.getByText("recibo-2.jpg")).toBeTruthy();
  });

  it("un archivo que no es foto ni PDF se rechaza diciendo qué hacer", () => {
    montarDrawer();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const malo = new File(["x"], "planilla.xlsx", { type: "application/vnd.ms-excel" });
    fireEvent.change(input, { target: { files: [malo] } });
    expect(screen.getByText(/no es una foto ni un PDF/)).toBeTruthy();
  });
});

// ── 5 y 6. La ficha angosta ─────────────────────────────────────────────────

const GASTO: CajaGasto = {
  id: "g-1",
  periodo_id: "p-3",
  fecha: "2026-09-03",
  descripcion: "Comida",
  proveedor: "Super 99",
  nro_factura: "196854200",
  categoria: "Alimentación",
  subtotal: 10.59,
  itbms: 0,
  total: 10.59,
};

function montarFicha(extra: Partial<React.ComponentProps<typeof FichaGasto>> = {}) {
  const onEditar = vi.fn();
  const onGuardar = vi.fn();
  const props = {
    gasto: GASTO,
    isOpen: true,
    categorias: ["Alimentación", "Varios"],
    editando: false,
    editGasto: {},
    setEditGasto: vi.fn(),
    onEditar,
    onCancelar: vi.fn(),
    onGuardar,
    onEliminar: vi.fn(),
    ...extra,
  };
  render(<FichaGasto {...props} />);
  return { onEditar, onGuardar };
}

describe("🩸 5 y 6. LA FICHA ANGOSTA: «Editar» hace algo, y se ve el N° de factura", () => {
  it("muestra el N° de factura — sin él, dos recibos repetidos se ven idénticos", () => {
    montarFicha();
    expect(screen.getByText("#196854200")).toBeTruthy();
  });

  it("🔴 «Editar» abre el formulario DENTRO de la ficha, con todos los campos", () => {
    montarFicha({ editando: true, editGasto: { ...GASTO } });
    expect(screen.getByLabelText("Fecha")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
    expect(screen.getByLabelText("Proveedor")).toBeTruthy();
    expect(screen.getByLabelText("Nº de factura")).toBeTruthy();
    expect(screen.getByLabelText("Subtotal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("editar y guardar llama al MISMO guardado de la tabla de escritorio", () => {
    const { onGuardar } = montarFicha({ editando: true, editGasto: { ...GASTO } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });

  it("🔴 la ficha NO pide responsable: ese campo se fue del gasto", () => {
    montarFicha({ editando: true, editGasto: { ...GASTO } });
    expect(screen.queryByLabelText("Responsable")).toBeNull();
  });

  it("🔴 CONTROL: con el período CERRADO no hay menú de acciones", () => {
    montarFicha({ isOpen: false });
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
  });

  it("el menú ofrece Editar, la foto del recibo y Eliminar", () => {
    const { onEditar } = montarFicha();
    const menu = document.querySelector("button[aria-haspopup], button[aria-label*='cciones']") as HTMLElement
      || screen.getAllByRole("button")[0];
    fireEvent.click(menu);

    const cuerpo = within(document.body);
    expect(cuerpo.getByText("Editar")).toBeTruthy();
    expect(cuerpo.getByText("Foto del recibo")).toBeTruthy();
    expect(cuerpo.getByText("Eliminar")).toBeTruthy();

    fireEvent.click(cuerpo.getByText("Editar"));
    expect(onEditar).toHaveBeenCalled();
  });
});
