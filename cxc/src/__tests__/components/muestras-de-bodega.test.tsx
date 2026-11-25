/**
 * 🔴 Muestras para bodega (25-nov-2026, Daniel aprobó el mockup): UNA lista,
 * lo por mandar arriba (con quién lo manda) y lo en camino abajo (con su guía);
 * el único toque es «No llegó», y solo en lo que viene en camino.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MuestrasDeBodega from "@/app/despachos/components/MuestrasDeBodega";
import { MUESTRAS_PARA_BODEGA_2026_11, type PedidoDeMuestras } from "@/lib/guias/muestras";

const m = (id: number, empresa_key: string, codigo: string, estado: string, extra = {}) => ({
  id, empresa_key, pedido_switch_id: 1, codigo, descripcion: "Women-Flip Flops", estado, pedida_por: "julio",
  pedida_en: "2026-11-25T13:00:00Z", enviada_por: null, enviada_en: null, reclamada_por: null, reclamada_en: null, guia_envio: null, ...extra,
});
const PEDIDOS = [
  { empresa_key: "fashion_shoes", pedido_switch_id: 2234, secuencial: "16-000002234", cliente_nombre: "City Moda Chorrera", muestras: [
    m(1, "fashion_shoes", "TWRHELO610", "enviada", { enviada_en: "2026-11-25T13:33:05Z", guia_envio: "j" }),
  ] },
  { empresa_key: "vistana", pedido_switch_id: 2516, secuencial: "16-000002516", cliente_nombre: "Golden Mall", muestras: [
    m(2, "vistana", "CK001", "falta"),
  ] },
] as unknown as PedidoDeMuestras[];

describe("🔴 lista de muestras de bodega", () => {
  it("interruptor prendido", () => expect(MUESTRAS_PARA_BODEGA_2026_11).toBe(true));

  it("por mandar arriba (con quién), en camino abajo (con guía); el título cuenta los dos", () => {
    render(<MuestrasDeBodega pedidos={PEDIDOS} onNoLlego={() => {}} />);
    expect(screen.getByText("1 por mandar · 1 en camino")).toBeTruthy();
    const [primero, segundo] = screen.getAllByRole("listitem");
    expect(within(primero).getByText(/Golden Mall/)).toBeTruthy();
    expect(within(primero).getByText("Por mandar")).toBeTruthy();
    expect(within(primero).getByText("Edwin")).toBeTruthy();
    expect(within(primero).queryByRole("button")).toBeNull();
    expect(within(segundo).getByText("En camino · j")).toBeTruthy();
  });

  it("«No llegó» es el único toque y reclama ESA referencia", () => {
    const onNoLlego = vi.fn();
    render(<MuestrasDeBodega pedidos={PEDIDOS} onNoLlego={onNoLlego} />);
    const botones = screen.getAllByRole("button");
    expect(botones.map((b) => b.textContent)).toEqual(["No llegó"]);
    fireEvent.click(botones[0]);
    expect(onNoLlego).toHaveBeenCalledWith(1);
  });
});
