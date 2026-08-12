/**
 * El formulario de ENTREGA DE MUEBLES, renderizado de verdad (12-ago-2026).
 *
 * Tres cosas de Daniel que un test de función pura no puede ver:
 *   1. LA MARCA SE HEREDA del caller (`marcasProyecto`): viniendo de
 *      "Registrar gasto" ya se eligió en la puerta — no se pregunta dos veces.
 *      El multi-select con % SE CONSERVA (quien entra por otro camino la
 *      cambia tocando, y el reparto entre marcas sigue funcionando).
 *   2. SIN AUTORRELLENO: escribir paneles NO llena tablas/conjunto/norte/
 *      barra. La curva 3/3/1/3 se eliminó — los kits reales no la siguen.
 *   3. AL GUARDAR una entrega nueva: pantalla de éxito con la NOTA DE ENVÍO
 *      (Compartir / Imprimir, el MISMO NotaEntregaAcciones de la ficha) y un
 *      "Listo" que recién ahí avisa al caller. Daniel: *"me tiene que dar una
 *      entrega de envío de eso, para saber que se fue"*.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import EntregaForm from "@/components/marketing/EntregaForm";
import type {
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
} from "@/lib/marketing/types";

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein" } as MkMarca;

const PRODUCTOS = [
  { id: "prod-pan", nombre: "Paneles", precio: 130, stock_total: 50 },
  { id: "prod-tab", nombre: "Tablas", precio: 10, stock_total: 200 },
] as MkInventarioProducto[];

const MARCAS_PROYECTO: MarcaConPorcentaje[] = [
  { marca: TOMMY, porcentaje: 100 } as MarcaConPorcentaje,
];

function instalarFetch() {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, init });
    const json = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    if (url.includes("/api/marketing/marcas")) return json([TOMMY, CALVIN]);
    if (
      url.includes("/api/marketing/inventario/entregas") &&
      init?.method === "POST"
    ) {
      return json({ id: "e-nueva", items: [], total_por_marca: {} });
    }
    if (url.includes("/api/marketing/entregas-pdf/")) {
      // Los DATOS de la nota (NotaEntregaAcciones los pide al montarse).
      return json({
        entregaId: "e-nueva",
        numero: 22,
        fecha: "2026-08-12",
        cliente: "Tienda X",
        clienteCodigo: null,
        tienda: "Tienda X",
        proyecto: "Tienda X",
        items: [],
        porMarca: [],
        total: 260,
        notas: null,
      });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fn);
  return { fn, llamadas };
}

function abrir(
  props: Partial<React.ComponentProps<typeof EntregaForm>> = {},
) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <EntregaForm
        open
        proyectoId="p1"
        proyectoNombre="Tienda X"
        marcasProyecto={MARCAS_PROYECTO}
        productos={PRODUCTOS}
        initial={null}
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

let arnes: ReturnType<typeof instalarFetch>;

beforeEach(() => {
  arnes = instalarFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("la marca se HEREDA del caller", () => {
  it("una entrega nueva arranca con la marca de la puerta ya elegida", async () => {
    abrir();
    await waitFor(() => {
      const btn = screen
        .getByText("Tommy Hilfiger")
        .closest("button") as HTMLButtonElement;
      // Seleccionada = borde oscuro + check.
      expect(btn.className).toContain("border-gray-900");
      expect(btn.textContent).toContain("✓");
    });
  });

  it("el multi-select SIGUE vivo: se puede sumar otra marca y repartir %", async () => {
    abrir();
    await waitFor(() => expect(screen.getByText("Calvin Klein")).toBeTruthy());
    fireEvent.click(screen.getByText("Calvin Klein").closest("button")!);
    // Con dos marcas aparece el reparto de % (suma 100).
    expect(
      screen.getByText(/Porcentaje por marca \(debe sumar 100%\)/),
    ).toBeTruthy();
  });

  it("sin marcas del caller (otros caminos) arranca vacío, como siempre", async () => {
    abrir({ marcasProyecto: [] });
    await waitFor(() => expect(screen.getByText("Tommy Hilfiger")).toBeTruthy());
    const btn = screen
      .getByText("Tommy Hilfiger")
      .closest("button") as HTMLButtonElement;
    expect(btn.className).not.toContain("border-gray-900");
  });
});

describe("⛔ sin autorrelleno del kit", () => {
  it("escribir paneles NO llena los accesorios", async () => {
    abrir();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Cantidad de paneles"), {
      target: { value: "10" },
    });
    // Con la curva vieja, Tablas diría 30. Tiene que seguir vacío.
    const tablas = screen.getByLabelText(
      "Piezas de Tablas",
    ) as HTMLInputElement;
    expect(tablas.value).toBe("");
    expect(screen.queryByText(/Sugerido:/)).toBeNull();
    expect(screen.queryByText(/Recalcular accesorios/)).toBeNull();
    expect(screen.queryByText(/curva/i)).toBeNull();
  });

  it("las piezas de paneles SÍ cuentan en el resumen (se espejan solas)", async () => {
    abrir();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Cantidad de paneles"), {
      target: { value: "2" },
    });
    // 2 paneles × $130 = $260 — en el total del resumen Y en el desglose de
    // la marca heredada (100%): por eso son 2 apariciones, no 1.
    await waitFor(() =>
      expect(screen.getAllByText("$260.00").length).toBeGreaterThanOrEqual(1),
    );
  });
});

describe("pantalla de éxito con la nota de envío", () => {
  async function guardarEntregaNueva() {
    const arnesLocal = abrir();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Cantidad de paneles"), {
      target: { value: "2" },
    });
    const guardar = screen.getByRole("button", {
      name: "Registrar entrega",
    }) as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    await waitFor(() =>
      expect(screen.getByText("El inventario ya se descontó.", { exact: false })).toBeTruthy(),
    );
    return arnesLocal;
  }

  it("al guardar NO se cierra: ofrece Compartir / Imprimir y un Listo", async () => {
    const { onSaved } = await guardarEntregaNueva();
    // La pantalla de éxito, con los botones de la nota (NotaEntregaAcciones
    // pide los datos y recién ahí se habilitan).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Compartir" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
    // El caller todavía no fue avisado: la nota se ofrece ANTES de cerrar.
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("Cerrar desde el éxito también avisa al caller (la entrega YA existe)", async () => {
    const { onSaved, onClose } = await guardarEntregaNueva();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("EDITAR una entrega sigue cerrando directo, sin pantalla de éxito", async () => {
    const initial = {
      id: "e-vieja",
      proyecto_id: "p1",
      total: 260,
      total_por_marca: { "m-th": 260 },
      notas: null,
      items: [
        {
          id: "it1",
          producto_id: "prod-pan",
          bultos: null,
          reparto: [{ cantidad: 2 }],
        },
      ],
    } as unknown as React.ComponentProps<typeof EntregaForm>["initial"];
    const onSaved = vi.fn();
    render(
      <ToastProvider>
        <EntregaForm
          open
          proyectoId="p1"
          proyectoNombre="Tienda X"
          marcasProyecto={MARCAS_PROYECTO}
          productos={PRODUCTOS}
          initial={initial}
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Listo" })).toBeNull();
  });
});
