/**
 * CANDADO · NUEVA GUÍA › «ENVÍO SIN FACTURA» (26-nov-2026, `GUIA_ENVIO_SIN_FACTURA_2026_11`).
 * Un solo botón junto a «+ Agregar factura» (ya no «+ Agregar traslado»); el
 * renglón guarda «Sin factura · <qué lleva>» y la tarjeta lleva el chip.
 * «0000» en un renglón nuevo no deja guardar.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import EnviosApple, { BOTON_AGREGAR_FACTURA, BOTON_AGREGAR_TRASLADO } from "@/app/despachos/components/EnviosApple";
import { emptyItem } from "@/app/despachos/components/constants";
import type { GuiaItem } from "@/app/despachos/components/types";
import { BOTON_ENVIO_SIN_FACTURA, CHIP_SIN_FACTURA } from "@/lib/guias/envio-sin-factura";
import { faltaParaGuardar, validarGuia } from "@/app/despachos/components/guia-form-logic";

vi.mock("@/components/ClientePicker", () => ({
  default: ({ id, onChange }: { id: string; onChange: (n: string, c: string) => void }) => (
    <button type="button" data-testid={`${id}-directorio`} onClick={() => onChange("Nova Lux, S.A.", "D-170")} />
  ),
}));

afterEach(cleanup);

function Banco() {
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  return (
    <>
      <EnviosApple
        items={items}
        etiquetas={[]}
        onReemplazarItems={setItems}
        onQuitar={(i) => setItems(items.filter((_, j) => j !== i))}
        editor={() => null}
        destinoAutollenadoDe={(c) => (c === "D-170" ? "Paso Canoas" : null)}
      />
      <pre data-testid="items">{JSON.stringify(items)}</pre>
    </>
  );
}

describe("Envío sin factura en Nueva guía", () => {
  it("🔴 el botón reemplaza «+ Agregar traslado» y guarda «Sin factura · qué lleva»", () => {
    render(<Banco />);
    expect(screen.queryByRole("button", { name: BOTON_AGREGAR_TRASLADO })).toBeNull();
    const factura = screen.getByRole("button", { name: BOTON_AGREGAR_FACTURA });
    const sinFactura = screen.getByRole("button", { name: BOTON_ENVIO_SIN_FACTURA });
    expect(sinFactura.parentElement).toBe(factura.parentElement);

    fireEvent.click(sinFactura);
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la guía" }));
    expect(screen.getByText(/Falta: qué lleva · la empresa · el cliente · los bultos · el destino/)).toBeTruthy();

    // La sugerencia se TOCA; nada se pone solo.
    expect((screen.getByLabelText("Qué lleva") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Mobiliario" }));
    expect((screen.getByLabelText("Qué lleva") as HTMLInputElement).value).toBe("Mobiliario");
    fireEvent.change(screen.getByLabelText("Empresa"), { target: { value: "Fashion Shoes" } });
    fireEvent.click(screen.getByTestId("sin-factura-cliente-directorio"));
    expect((screen.getByLabelText("Destino") as HTMLInputElement).value).toBe("Paso Canoas");
    fireEvent.change(screen.getByLabelText("Bultos"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la guía" }));

    const items: GuiaItem[] = JSON.parse(screen.getByTestId("items").textContent ?? "[]");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ facturas: "Sin factura · Mobiliario", empresa: "Fashion Shoes", bultos: 4, cliente_codigo: "D-170" });
    const tarjeta = document.querySelector('[data-renglon="sin-factura"]') as HTMLElement;
    expect(tarjeta.textContent).toContain(CHIP_SIN_FACTURA);
    expect(tarjeta.textContent).toContain("Mobiliario");
  });

  it("🔴 «0000» en un renglón NUEVO no se guarda; el viejo (con id) sí", () => {
    const base = { fecha: "2026-11-26", modoEntrega: "entrega_directa" as const, transportistaId: null, entregadoPor: "" };
    const nuevo: GuiaItem = { ...emptyItem(1), uid: "a", cliente: "Nova Lux, S.A.", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "0000", bultos: 4 };
    expect(validarGuia({ ...base, items: [nuevo] }).has("item-a-facturas-cero")).toBe(true);
    expect(faltaParaGuardar({ ...base, items: [nuevo] }).join(" ")).toContain("Envío sin factura");
    expect(validarGuia({ ...base, items: [{ ...nuevo, id: "viejo" }] }).size).toBe(0);
    // Sin factura con «Ninguna» (empresa vacía) sí se guarda.
    const sobre = { ...nuevo, empresa: "", facturas: "Sin factura · Documentos" };
    expect(validarGuia({ ...base, items: [sobre] }).size).toBe(0);
  });
});
