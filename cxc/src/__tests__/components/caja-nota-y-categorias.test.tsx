/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — «DESCRIPCIÓN» ES «NOTA» Y OPCIONAL, Y LA CATEGORÍA SE CREA DESDE EL
 * FORMULARIO (20-sep-2026).
 *
 * Daniel, textual: *«opino eliminar descripción y se convierta como nota como
 * en guías, en caso tal que quieran apuntar algo, y la categoría está, y si
 * algún momento hay una categoría nueva, pon el más para configurarla y que los
 * que tengan el módulo las puedan crear para siempre en todos los usuarios»*.
 *
 * 🩸 «Descripción» era obligatoria y decía «Comida» en 38 de los 77 recibos,
 * con la categoría al lado diciendo «Alimentación»: el mismo dato dos veces.
 *
 * Lo que este archivo vigila:
 *  - el campo se llama NOTA y el gasto se guarda sin ella;
 *  - lo obligatorio sigue siendo lo que identifica el recibo (proveedor,
 *    categoría y monto);
 *  - el «＋» crea una categoría en el SERVIDOR, la deja elegida y dice que
 *    queda para todos;
 *  - la repetida se rechaza sin ir al servidor;
 *  - 🩸 las cuatro reglas de sugerencia muertas se borraron, y las cuatro que
 *    sí tienen categoría detrás siguen funcionando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import NuevoGastoDrawer from "@/app/caja/components/NuevoGastoDrawer";

const PERIODO = { id: "p-3", numero: 3, fondo_inicial: 200, fecha_apertura: "2026-09-02", fecha_cierre: null };

let posts: Array<Record<string, unknown>>;
let categoriasCreadas: Array<Record<string, unknown>>;

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
  categoriasCreadas = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/api/caja/categorias") && method === "POST") {
      categoriasCreadas.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return j({ ok: true });
    }
    if (url.includes("/api/caja/categorias")) return j(["Alimentación", "Materiales", "Transporte"]);
    if (url.includes("/api/caja/gastos") && method === "POST") {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return j({ id: "g-nuevo" });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

function montar(isOwner = false) {
  render(
    <NuevoGastoDrawer
      open
      onClose={vi.fn()}
      periodo={PERIODO as never}
      totalGastado={0}
      isOwner={isOwner}
      onSaved={vi.fn()}
    />,
  );
}

/** Lo obligatorio DE VERDAD: fecha, proveedor y monto (la categoría viene puesta). */
async function llenarSinNota() {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-03" } });
  fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Super 99" } });
  fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10.59" } });
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

describe("🔴 «DESCRIPCIÓN» ES «NOTA», Y ES OPCIONAL", () => {
  it("el campo se llama Nota, y el viejo «Descripción» ya no está", () => {
    montar();
    expect(screen.getByLabelText("Nota")).toBeTruthy();
    expect(screen.queryByLabelText("Descripción")).toBeNull();
  });

  it("🔴 el gasto se guarda SIN nota", async () => {
    montar();
    await llenarSinNota();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].descripcion).toBe("");
    expect(posts[0].proveedor).toBe("Super 99");
  });

  it("y con nota, se guarda en la misma columna de siempre", async () => {
    montar();
    await llenarSinNota();
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Era para la visita" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].descripcion).toBe("Era para la visita");
  });

  it("CONTROL: lo que identifica el recibo SIGUE siendo obligatorio", async () => {
    montar();
    fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10.59" } });
    // Sin proveedor no se guarda, por más nota que haya.
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Comida" } });
    expect((screen.getByRole("button", { name: "Guardar gasto" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("🔴 EL «＋» CREA UNA CATEGORÍA PARA TODO EL EQUIPO", () => {
  it("el botón existe para cualquiera que tenga el módulo (no solo el dueño)", () => {
    montar(false);
    expect(screen.getByRole("button", { name: "Crear categoría" })).toBeTruthy();
  });

  it("crea en el SERVIDOR, lo dice, y deja la nueva elegida", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
    fireEvent.change(screen.getByLabelText("Nombre de la categoría nueva"), { target: { value: "rifa navideña" } });
    expect(screen.getByText(/Queda guardada para todos/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(categoriasCreadas).toHaveLength(1));
    expect(categoriasCreadas[0].nombre).toBe("Rifa navideña");

    await llenarSinNota();
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].categoria).toBe("Rifa navideña");
  });

  it("la repetida se dice y NO viaja al servidor (clave exacta, sin acentos)", async () => {
    montar();
    // Se espera a que el catálogo esté cargado: la lista con la que se compara
    // llega del servidor al abrir el formulario.
    await llenarSinNota();
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
    fireEvent.change(screen.getByLabelText("Nombre de la categoría nueva"), { target: { value: "alimentacion" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await screen.findByText(/ya está en la lista/);
    expect(categoriasCreadas).toHaveLength(0);
  });
});

describe("🩸 LAS CUATRO REGLAS DE SUGERENCIA MUERTAS SE BORRARON", () => {
  const form = readFileSync(join(process.cwd(), "src/app/caja/components/GastoForm.tsx"), "utf8");

  it("Combustible, Limpieza, Envios y Servicios no existen en el catálogo: sus reglas se fueron", () => {
    for (const muerta of ["Combustible", "Limpieza", "Envios", "Servicios"]) {
      expect(form).not.toContain(`cat: "${muerta}"`);
    }
    expect(form).not.toContain("gasolina");
    expect(form).not.toContain("detergente");
  });

  it("🔴 CONTROL: las cuatro que SÍ tienen categoría detrás siguen ahí y siguen sugiriendo", async () => {
    for (const viva of ["Transporte", "Alimentacion", "Papeleria", "Mantenimiento"]) {
      expect(form).toContain(`cat: "${viva}"`);
    }
    montar();
    await llenarSinNota();
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Taxi al banco" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].categoria).toBe("Transporte");
  });
});
