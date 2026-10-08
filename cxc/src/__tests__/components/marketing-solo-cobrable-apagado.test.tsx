/**
 * Marketing › SOLO LO COBRABLE (7-oct-2026) — candado del interruptor APAGADO.
 *
 * Con `MKT_SOLO_COBRABLE_2026_10 = false`, las pantallas que el cambio toca se
 * dibujan BYTE POR BYTE como antes. Las fotos (`__snapshots__/solo-cobrable-
 * apagado-*.html`) se sacaron con el código de ANTES del cambio (37a9b537, la
 * rama del arreglo del ZIP #668): si una de estas pantallas cambia con el
 * interruptor apagado, esta prueba se pone roja.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { FacturaForm } from "@/components/marketing/FacturaForm";
import type { MkMarca } from "@/lib/marketing/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger", activo: true } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein", activo: true } as MkMarca;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ existe: false, facturas: [] }) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FOTO = (n: string) => `./__snapshots__/solo-cobrable-apagado-${n}.html`;

describe("solo lo cobrable · apagado = las pantallas de hoy, byte por byte", () => {
  it("el formulario de la factura, como lo abre «＋ Gasto» hoy (paso 3)", async () => {
    const { container } = render(
      <ToastProvider>
        <FacturaForm
          proyecto={{ id: "", marcas: [] }}
          marcasCatalogo={[TOMMY, CALVIN]}
          initialMarcas={[{ marcaId: TOMMY.id, porcentaje: 100 }]}
          marcaFija={TOMMY}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          historicoProveedores={["Impreco"]}
          onUploadPdfForIA={vi.fn(async () => null)}
          pdfObligatorio
        />
      </ToastProvider>,
    );
    // La fecha nace con «hoy»: se fija para que la foto no dependa del día.
    const html = container.innerHTML
      .replace(/value="\d{4}-\d{2}-\d{2}"/g, 'value="HOY"')
      .replace(/<span class="text-gray-900">\d{1,2} [a-z]{3,4} \d{4}<\/span>/g, '<span class="text-gray-900">HOY</span>');
    await expect(html).toMatchFileSnapshot(FOTO("factura-form"));
  });

  it("el formulario al EDITAR (sin la puerta)", async () => {
    const { container } = render(
      <ToastProvider>
        <FacturaForm
          proyecto={{ id: "", marcas: [] }}
          marcasCatalogo={[TOMMY, CALVIN]}
          initial={{ id: "f-1", numero_factura: "1", fecha_factura: "2026-10-01", proveedor: "Impreco", concepto: "Vinil", subtotal: 100, itbms: 0 }}
          initialMarcas={[{ marcaId: TOMMY.id, porcentaje: 100 }]}
          editarDatosDelGasto
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </ToastProvider>,
    );
    await expect(container.innerHTML).toMatchFileSnapshot(FOTO("factura-editar"));
  });

});
