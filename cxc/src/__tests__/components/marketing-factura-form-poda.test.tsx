/**
 * FacturaForm y PasoInstruccion tras la poda del 12-ago-2026.
 *
 *   1. ⛔ El paso "Estado del gasto" (toggle Creado|Pagado) se ELIMINÓ ENTERO
 *      del formulario — Daniel, textual: *"si quitalo"*. El estado sigue
 *      viajando en el payload: "creado" para lo nuevo (el default de la
 *      columna) y el valor de la fila al editar — editar un pago de
 *      impulsadora (nace "pagado") no lo puede devolver a "creado".
 *   2. Con `marcaFija` (la marca ya elegida en la puerta) el paso 3 no se
 *      dibuja: no quedaba nada que preguntar.
 *   3. 🔴 PasoInstruccion NUNCA tacha títulos: el check verde ya dice
 *      "completado". Con marcaFija el paso nacía completado → nacía tachado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider } from "@/components/ToastSystem";
import { FacturaForm } from "@/components/marketing/FacturaForm";
import { PasoInstruccion } from "@/components/marketing/PasoInstruccion";
import type { MkMarca } from "@/lib/marketing/types";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca;

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

function abrirForm(props: { marcaFija?: MkMarca | null } = {}) {
  render(
    <ToastProvider>
      <FacturaForm
        proyecto={{ id: "", marcas: [] }}
        marcasCatalogo={[TOMMY]}
        marcaFija={props.marcaFija ?? null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    </ToastProvider>,
  );
}

describe("⛔ el toggle Creado|Pagado no existe más en el formulario", () => {
  it("sin marcaFija: hay paso de Marca, pero NINGÚN control de estado", () => {
    abrirForm();
    expect(screen.getByText("Marca del gasto")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Creado" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Pagado" })).toBeNull();
    expect(screen.queryByText("Estado del gasto")).toBeNull();
  });

  it("con marcaFija: el paso 3 desaparece ENTERO (nada que preguntar)", () => {
    abrirForm({ marcaFija: TOMMY });
    expect(screen.queryByText("Marca del gasto")).toBeNull();
    expect(screen.queryByText("Estado del gasto")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Pagado" })).toBeNull();
    // Los pasos 1 y 2 siguen ahí — el formulario no perdió nada más.
    // ("Sube el PDF…" aparece 2 veces: título del paso + label del uploader.)
    expect(
      screen.getAllByText("Sube el PDF de la factura").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/Nº factura/)).toBeTruthy();
  });

  it("candado estático: el toggle no vuelve al código del formulario", () => {
    const src = leer("components/marketing/FacturaForm.tsx");
    expect(src).not.toContain("setEstadoPago");
    expect(src).not.toContain("Estado del gasto");
    expect(src).not.toContain(">Creado<");
    // El valor SIGUE viajando (los llamadores lo esperan) y al editar respeta
    // lo guardado — sin eso, editar un pago de impulsadora lo despagaría.
    expect(src).toMatch(
      /estadoPago:\s*EstadoPagoFactura\s*=\s*\n?\s*initial\?\.estado_pago === "pagado" \? "pagado" : "creado"/,
    );
  });
});

describe("🔴 PasoInstruccion no tacha títulos nunca", () => {
  it("un paso completado lleva check verde y el título SIN line-through", () => {
    render(
      <PasoInstruccion numero={3} titulo="Paso listo" descripcion="Ya está" completado />,
    );
    const titulo = screen.getByText("Paso listo");
    expect(titulo.className).not.toContain("line-through");
    expect(screen.getByText("Ya está").className).not.toContain("line-through");
  });

  it("candado estático: line-through no vuelve al componente", () => {
    expect(leer("components/marketing/PasoInstruccion.tsx")).not.toMatch(
      /className[^\n]*line-through|"line-through/,
    );
  });
});

describe("el badge de la tarjeta de factura", () => {
  it('solo existe para "Pagado" (impulsadoras): un "Creado" en todas sería ruido', () => {
    const src = leer("components/marketing/FacturaCard.tsx");
    expect(src).toContain('factura.estado_pago === "pagado"');
    expect(src).not.toMatch(/>\s*Creado\s*</);
  });
});
