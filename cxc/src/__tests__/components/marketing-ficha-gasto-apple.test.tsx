/**
 * Marketing › Editar factura, como ficha y no como asistente (7-oct-2026,
 * `FICHA_GASTO_2026_10`). Candado del rediseño APAGADO: con el interruptor
 * en `false`, la pantalla de edición es BYTE A BYTE la de antes (ver
 * `marketing-factura-form-poda.test.tsx`, que no se toca).
 *
 * «Se cobra a / A cargo de la empresa» YA vivía en esta pantalla antes de
 * este interruptor (commit 5669ea38, «también al EDITAR un gasto» — el
 * mismo día): acá se confirma que la ficha nueva no la rompe, además de lo
 * que SÍ es de este interruptor — el comprobante existente, sin numerar los
 * pasos, el control único de Impuesto y la tienda como buscador.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import type { MkMarca } from "@/lib/marketing/types";

vi.mock("@/lib/marketing/ficha-gasto-2026-10", async (original) => ({
  ...(await original<typeof import("@/lib/marketing/ficha-gasto-2026-10")>()),
  FICHA_GASTO_2026_10: true,
}));

// Importa DESPUÉS del mock: FacturaForm lee el interruptor al nivel de módulo.
const { FacturaForm } = await import("@/components/marketing/FacturaForm");

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein" } as MkMarca;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ existe: false, facturas: [] }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrirEdicion(onSubmit = vi.fn()) {
  render(
    <ToastProvider>
      <FacturaForm
        proyecto={{ id: "", marcas: [] }}
        marcasCatalogo={[TOMMY, CALVIN]}
        initial={{
          id: "f-145",
          numero_factura: "0000000145",
          fecha_factura: "2026-10-01",
          proveedor: "Impresora Comercial",
          concepto: "Vinil de vitrina",
          subtotal: 100,
          itbms: 0,
        }}
        initialMarcas={[{ marcaId: TOMMY.id, porcentaje: 100 }]}
        editarDatosDelGasto
        adjuntoPdfExistente={{ nombre: "factura-0145.pdf", url: "https://x/factura-0145.pdf" }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </ToastProvider>,
  );
  return onSubmit;
}

describe("7-oct-2026 · editar ya no es un asistente", () => {
  it("el PDF que ya existe se dice, sin un recuadro vacío para subir otro", () => {
    abrirEdicion();
    expect(screen.getByTestId("comprobante-existente").textContent).toBe("factura-0145.pdf");
    expect(screen.getByText("Reemplazar")).toBeTruthy();
    expect(screen.queryByText("Sube el PDF de la factura")).toBeNull();
    expect(screen.queryByText("La factura ya está")).toBeNull();
  });

  it("sin «Paso N» ni visto: los bloques se llaman por lo que son", () => {
    abrirEdicion();
    expect(screen.getByText("Datos de la factura")).toBeTruthy();
    expect(screen.queryByText("Revisa o llena los datos de la factura")).toBeNull();
    expect(screen.queryByText(/^1$/)).toBeNull();
  });

  it("un solo control «Impuesto», no dos que parecen contradecirse", () => {
    abrirEdicion();
    expect(screen.getByText("Impuesto")).toBeTruthy();
    expect(screen.getByText(/^Zona libre 15%$/)).toBeTruthy();
    // El control viejo (la casilla con esta frase) no convive con el nuevo.
    expect(screen.queryByText(/Compra en zona libre/)).toBeNull();
  });

  it("«Se cobra a» con «No recuperable», no la rejilla de 5 marcas", () => {
    abrirEdicion();
    expect(screen.getByText("Se cobra a")).toBeTruthy();
    expect(screen.getByText("No recuperable")).toBeTruthy();
    expect(screen.queryByText("A cargo de la empresa")).toBeNull();
    expect(screen.queryByText("Marca del gasto")).toBeNull();
  });

  it("elegir «No recuperable» y guardar manda marcasSeleccionadas vacío", async () => {
    const onSubmit = abrirEdicion();
    fireEvent.change(screen.getByLabelText("Se cobra a"), {
      target: { value: "__empresa__" },
    });
    fireEvent.click(screen.getByText("Guardar factura"));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [data] = onSubmit.mock.calls[0];
    expect(data.marcasSeleccionadas).toEqual([]);
    expect(data.pctALaMarca).toBe(0);
  });

  it("la tienda es un buscador que empieza vacío, no dos botones", () => {
    abrirEdicion();
    expect(screen.getByPlaceholderText("Sin tienda — buscar…")).toBeTruthy();
    expect(screen.queryByText("Sin tienda")).toBeNull(); // el enlace solo aparece con una tienda puesta
    expect(screen.queryByRole("button", { name: "Tienda" })).toBeNull();
  });

  it("deja la marca de siempre (100%) cuando no se toca «Se cobra a»", async () => {
    const onSubmit = abrirEdicion();
    fireEvent.click(screen.getByText("Guardar factura"));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [data] = onSubmit.mock.calls[0];
    expect(data.marcasSeleccionadas).toEqual([{ marcaId: TOMMY.id, porcentaje: 100 }]);
    expect(data.pctALaMarca).toBe(100);
  });
});
