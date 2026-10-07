/**
 * CANDADO · NUEVA GUÍA › «+ AGREGAR TRASLADO» (5-oct-2026, `GUIA_AGREGAR_TRASLADO_2026_10`).
 *
 * 🔴 Lo que NO puede cambiar: lo que se guarda. El renglón lleva el TEXTO
 * `Traslado` en facturas (empresa vacía con «Ninguna») y Observaciones la línea
 * «Traslado <cliente>: <contenido>», la MISMA del envío etiquetado.
 * Y la pantalla: el botón al lado de «+ Agregar factura», la tarjeta con el
 * chip «Traslado», quitarla saca su línea, y el enlace gris «Traslado» ya no está.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import EnviosApple, { BOTON_AGREGAR_FACTURA, BOTON_AGREGAR_TRASLADO, CHIP_TRASLADO } from "@/app/despachos/components/EnviosApple";
import { armarTraslado } from "@/app/despachos/components/AgregarTraslado";
import { emptyItem } from "@/app/despachos/components/constants";
import type { GuiaItem } from "@/app/despachos/components/types";
import { lineaDeTraslado, observacionesConTraslado } from "@/lib/guias/etiquetas-por-envio";

vi.mock("@/components/ClientePicker", () => ({
  default: ({ id, onChange }: { id: string; onChange: (n: string, c: string) => void }) => (
    <div>
      <button type="button" data-testid={`${id}-directorio`} onClick={() => onChange("Nova Lux, S.A.", "D-170")} />
      <input data-testid={`${id}-a-mano`} onChange={(e) => onChange(e.target.value, "")} />
    </div>
  ),
}));

afterEach(cleanup);

function Banco() {
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [obs, setObs] = useState("Llamar antes");
  return (
    <>
      <EnviosApple
        items={items}
        etiquetas={[]}
        onReemplazarItems={setItems}
        onQuitar={(i) => setItems(items.filter((_, j) => j !== i))}
        editor={() => null}
        destinoAutollenadoDe={(c) => (c === "D-170" ? "Paso Canoas" : null)}
        onLineaDeTraslado={(l, poner) => setObs((o) => observacionesConTraslado(o, l, poner))}
      />
      <pre data-testid="obs">{obs}</pre>
      <pre data-testid="items">{JSON.stringify(items)}</pre>
    </>
  );
}
const itemsEnPantalla = (): GuiaItem[] => JSON.parse(screen.getByTestId("items").textContent ?? "[]");

describe("armarTraslado (lo que se guarda)", () => {
  it("🔴 `Traslado` en facturas, empresa vacía con «Ninguna» y la MISMA línea del envío etiquetado", () => {
    const r = armarTraslado({ cliente: { nombre: " Nova Lux, S.A. ", codigo: "D-170" }, contenido: "3 muebles  ck", bultos: "3", destino: " Paso Canoas ", empresaKey: "", orden: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toMatchObject({ cliente: "Nova Lux, S.A.", cliente_codigo: "D-170", facturas: "Traslado", empresa: "", bultos: 3, direccion: "Paso Canoas" });
    const delEnvio = lineaDeTraslado({ cliente_nombre: "Nova Lux, S.A.", filas: [{ switch_factura_id: null, secuencial: "Traslado", nota: "3 MUEBLES CK" }] } as never);
    expect(r.linea).toBe(delEnvio);
    expect(r.linea).toBe("Traslado Nova Lux, S.A.: 3 MUEBLES CK");
  });
  it("con empresa elegida guarda su nombre canónico", () => {
    const r = armarTraslado({ cliente: { nombre: "Tienda X", codigo: "" }, contenido: "GANCHOS", bultos: "1", destino: "David", empresaKey: "vistana", orden: 1 });
    expect(r.ok && r.item.empresa).toBe("Vistana International");
  });
  it("lo que falta sale TODO de una vez", () => {
    const r = armarTraslado({ cliente: null, contenido: "", bultos: "0", destino: "", empresaKey: "", orden: 1 });
    expect(r).toEqual({ ok: false, falta: ["el cliente", "el contenido", "los bultos", "el destino"] });
  });
});

describe("la pantalla", () => {
  it("🔴 «+ Agregar traslado» al lado de «+ Agregar factura», y el enlace gris «Traslado» ya no está", () => {
    render(<Banco />);
    const factura = screen.getByRole("button", { name: BOTON_AGREGAR_FACTURA });
    const traslado = screen.getByRole("button", { name: BOTON_AGREGAR_TRASLADO });
    expect(traslado.className).toBe(factura.className);
    expect(traslado.parentElement).toBe(factura.parentElement);
    fireEvent.click(factura);
    fireEvent.click(screen.getByTestId("agregar-cliente-directorio"));
    expect(screen.queryByRole("button", { name: "Traslado" })).toBeNull();
  });

  it("🔴 destino «el de siempre», tarjeta con chip, línea en Observaciones; quitar la saca", () => {
    render(<Banco />);
    fireEvent.click(screen.getByRole("button", { name: BOTON_AGREGAR_TRASLADO }));
    fireEvent.click(screen.getByTestId("traslado-cliente-directorio"));
    expect((screen.getByLabelText("Destino") as HTMLInputElement).value).toBe("Paso Canoas");
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "3 muebles ck" } });
    fireEvent.change(screen.getByLabelText("Bultos"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la guía" }));

    const items = itemsEnPantalla();
    expect(items).toHaveLength(1); // ocupó la fila vacía
    expect(items[0]).toMatchObject({ facturas: "Traslado", empresa: "", bultos: 3, cliente_codigo: "D-170" });
    expect(screen.getByTestId("obs").textContent).toBe("Llamar antes\nTraslado Nova Lux, S.A.: 3 MUEBLES CK");
    const tarjeta = document.querySelector('[data-renglon="traslado"]') as HTMLElement;
    expect(tarjeta.textContent).toContain(CHIP_TRASLADO);
    expect(tarjeta.textContent).toContain("3 MUEBLES CK");
    expect(screen.queryByText("Facturas")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Quitar la factura de Nova Lux, S.A." }));
    expect(screen.getByTestId("obs").textContent).toBe("Llamar antes");
  });

  it("cliente escrito a mano y lo que falta al tocar «Agregar a la guía»", () => {
    render(<Banco />);
    fireEvent.click(screen.getByRole("button", { name: BOTON_AGREGAR_TRASLADO }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la guía" }));
    expect(screen.getByText("Falta: el cliente · el contenido · los bultos · el destino")).toBeTruthy();
    fireEvent.change(screen.getByTestId("traslado-cliente-a-mano"), { target: { value: "Bodega Colón" } });
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "PANELES" } });
    fireEvent.change(screen.getByLabelText("Bultos"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "Colón" } });
    fireEvent.change(screen.getByLabelText("Empresa del traslado"), { target: { value: "vistana" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la guía" }));
    expect(itemsEnPantalla()[0]).toMatchObject({ cliente: "Bodega Colón", cliente_codigo: "", empresa: "Vistana International", facturas: "Traslado" });
  });
});
