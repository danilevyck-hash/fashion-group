/**
 * 🔴 Muestras del vendedor (25-nov-2026, Daniel aprobó el mockup con 4 cambios):
 * sin «Por mandar» por renglón; «No llegó · reenviar» en rojo y ARRIBA de todo;
 * después del pedido más viejo al más nuevo; todo marcado, desmarcar por
 * referencia o por pedido, y UN «Enviar N muestras» con guía obligatoria.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import MuestrasDelVendedor, { ordenDelVendedor } from "@/app/despachos/components/MuestrasDelVendedor";
import { MUESTRAS_DEL_VENDEDOR_2026_11, type PedidoDeMuestras } from "@/lib/guias/muestras";

let n = 0;
const P = (empresa_key: string, id: number, cliente: string, pedida_en: string, refs: [string, string?][]) => ({
  empresa_key, pedido_switch_id: id, secuencial: `16-${id}`, cliente_nombre: cliente,
  muestras: refs.map(([codigo, estado]) => ({
    id: ++n, empresa_key, pedido_switch_id: id, codigo, descripcion: "Men-Sneakers", estado: estado ?? "falta", pedida_por: "julio",
    pedida_en, enviada_por: null, enviada_en: null, reclamada_por: null, reclamada_en: null, guia_envio: null,
  })),
});
const PEDIDOS = [
  P("fashion_shoes", 2217, "Viva Panama Dutty Free", "2026-11-25T13:00:00Z", [["FW0FW07859DW6"]]),
  P("fashion_shoes", 2238, "R.J.A.S.A.", "2026-11-23T13:00:00Z", [["FM0FM05399BDS"], ["FM0FM05199YBS"]]),
  P("active_shoes", 557, "Jerusalem De Panama", "2026-11-24T13:00:00Z", [["100225490"], ["100260642", "no_llego"]]),
] as unknown as PedidoDeMuestras[];

const dibujar = (onEnviar = vi.fn()) => {
  render(<ToastProvider><MuestrasDelVendedor pedidos={PEDIDOS} onEnviar={onEnviar} /></ToastProvider>);
  return onEnviar;
};

describe("🔴 lista de muestras del vendedor", () => {
  it("interruptor prendido", () => expect(MUESTRAS_DEL_VENDEDOR_2026_11).toBe(true));

  it("«No llegó» arriba (pedido y referencia); después del pedido más viejo al más nuevo", () => {
    const o = ordenDelVendedor(PEDIDOS);
    expect(o.map((p) => p.pedido_switch_id)).toEqual([557, 2238, 2217]);
    expect(o[0].muestras.map((m) => m.codigo)).toEqual(["100260642", "100225490"]);
  });

  it("sin «Por mandar» por renglón; solo «No llegó · reenviar» en rojo", () => {
    dibujar();
    expect(screen.queryByText("Por mandar")).toBeNull();
    expect(screen.queryByText("Reclamada")).toBeNull();
    const aviso = screen.getByText("No llegó · reenviar");
    expect(aviso.className).toContain("text-red-700");
  });

  it("todo marcado; desmarcar por referencia y por pedido cambia el botón; la guía es obligatoria", () => {
    const onEnviar = dibujar();
    expect(screen.getAllByRole("button", { name: "Enviar 5 muestras" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Enviar FM0FM05199YBS"));
    fireEvent.click(screen.getByLabelText("Enviar las muestras del pedido 2217"));
    const boton = screen.getAllByRole("button", { name: "Enviar 3 muestras" })[0];
    fireEvent.click(boton);
    const marcar = screen.getByRole("button", { name: "Marcar enviadas" }) as HTMLButtonElement;
    expect(marcar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Guía o comentario"), { target: { value: "G1" } });
    fireEvent.click(marcar);
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect([...onEnviar.mock.calls[0][0]].sort()).toEqual(
      PEDIDOS.flatMap((p) => p.muestras).filter((m) => !["FM0FM05199YBS", "FW0FW07859DW6"].includes(m.codigo)).map((m) => m.id).sort(),
    );
    expect(onEnviar.mock.calls[0][1]).toBe("G1");
  });

  it("cada pedido dice su empresa", () => {
    dibujar();
    const items = screen.getAllByRole("listitem").filter((li) => li.querySelector("label > span.font-semibold"));
    expect(within(items[0]).getByText(/Active Shoes/)).toBeTruthy();
  });
});
