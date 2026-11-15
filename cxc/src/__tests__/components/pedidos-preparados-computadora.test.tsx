// 🔴 vivo-01 (revisión en vivo, 14-nov-2026): «Preparados» en la computadora
// se veía en «Cargando…» con «Pendientes» marcado. No era la lista: la foto de
// página entera de Playwright mide un instante 1 px de ancho, la barra del
// celular se prendía y se apagaba, y `ProveedorBarraCelular` cambiaba de `<>` a
// `<Provider>`: React volvía a montar toda la pantalla y perdía la pestaña.
// Lo mismo le pasaba a quien achicaba la ventana por debajo de 640 px.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import PedidosView from "@/app/despachos/components/PedidosView";
import { ToastProvider } from "@/components/ToastSystem";
import { ProveedorBarraCelular } from "@/components/celular/BarraDeControles";
import { MONTAJE_ESTABLE } from "@/lib/ui/revision-110-vivo";

const ped = (id: number, estado: string, extra: object = {}) => ({
  empresa_key: "fashion_shoes", pedido_switch_id: id, secuencial: `16-00000${id}`, fecha: "2026-11-02",
  cliente_codigo: "C-1", cliente_nombre: `Cliente ${id}`, vendedor_nombre: "Reynaldo Espinosa",
  estado, cambiado_por: "Julio", cambiado_en: "2026-11-02T21:00:00Z", piezas: 1552,
  preparado_por: "Julio", preparado_en: "2026-11-02T21:00:00Z", ...extra,
});

let lecturas = 0;
beforeEach(() => {
  lecturas = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    lecturas++;
    return new Response(JSON.stringify({
      pedidos: [ped(1, "pendiente"), ped(2, "en_preparacion"), ped(3, "preparado"), ped(4, "preparado", { bultos: 23 })],
      actualizado: "2026-11-14T20:47:00Z", empresas: ["fashion_shoes"],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

function Pantalla({ celular }: { celular: boolean }) {
  return (
    <ToastProvider>
      <ProveedorBarraCelular activo={celular} activa="pedidos">
        <PedidosView puedeMarcar puedeRecibir puedeCambiarBultos />
      </ProveedorBarraCelular>
    </ToastProvider>
  );
}

describe("vivo-01 · Despachos › Pedidos (computadora) › Preparados", () => {
  it("el interruptor está prendido", () => expect(MONTAJE_ESTABLE).toBe(true));

  it("dibuja la lista de Preparados con su pastilla marcada", async () => {
    render(<Pantalla celular={false} />);
    await screen.findByText("Cliente 1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Preparados/ })); });
    await waitFor(() => expect(screen.getByText("Cliente 3")).toBeTruthy());
    expect(screen.queryByText("Cargando…")).toBeNull();
    expect(screen.getByRole("button", { name: /^Preparados/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("1,552 unidades").length).toBeGreaterThan(0);
  });

  it("cruzar los 640 px (la barra del celular se prende y se apaga) NO vuelve a montar la pantalla", async () => {
    const { rerender } = render(<Pantalla celular={false} />);
    await screen.findByText("Cliente 1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Preparados/ })); });
    await waitFor(() => expect(screen.getByText("Cliente 3")).toBeTruthy());
    const antes = lecturas;
    rerender(<Pantalla celular />);
    rerender(<Pantalla celular={false} />);
    await act(async () => {});
    expect(lecturas).toBe(antes); // ni una lectura de más: no se montó de nuevo
    expect(screen.queryByText("Cargando…")).toBeNull();
    expect(screen.getByRole("button", { name: /^Preparados/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

it("el proveedor conserva el estado de lo de adentro al cambiar `activo`", () => {
  function Contador() {
    const [n, setN] = useState(0);
    return <button onClick={() => setN(n + 1)}>n={n}</button>;
  }
  const { rerender } = render(<ProveedorBarraCelular activo={false}><Contador /></ProveedorBarraCelular>);
  fireEvent.click(screen.getByText("n=0"));
  rerender(<ProveedorBarraCelular activo><Contador /></ProveedorBarraCelular>);
  expect(screen.getByText("n=1")).toBeTruthy();
});
