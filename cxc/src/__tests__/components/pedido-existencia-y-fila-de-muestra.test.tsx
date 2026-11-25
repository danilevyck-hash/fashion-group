/**
 * 🔴 Despachos › Pedidos › el pedido abierto (25-nov-2026, Daniel):
 *   1. «Existencia» a la IZQUIERDA de «Cantidad»; sin dato «—», nunca 0.
 *   2. La muestra se marca tocando CUALQUIER parte del renglón (y con Enter),
 *      lo mismo que el círculo, sin marcar dos veces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/ToastSystem", () => ({ useToast: () => ({ toast: () => {} }) }));

import PedidoBultos from "@/app/despachos/components/PedidoBultos";
import { MUESTRA_TOCANDO_LA_FILA_2026_11, type ControlMuestras } from "@/app/despachos/components/MuestrasDelPedido";
import { PEDIDO_CON_EXISTENCIA_2026_11, textoExistencia } from "@/lib/guias/pedidos-bultos";

const LINEAS = [
  { codigo_barra_id: 1, codigo: "TWLENILA140", descripcion: "Women-Sneakers", talla: "-", color: "-", cantidad: 6, precio: null, total: null, bulto: null, existencia: 14 },
  { codigo_barra_id: 2, codigo: "FM0FM05393YBS", descripcion: "Men-Sneakers", talla: "-", color: "-", cantidad: 3, precio: null, total: null, bulto: null, existencia: null },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ lineas: LINEAS, resumen: "", sinTabla: false }) })));
});

function control(alternar = vi.fn()): ControlMuestras {
  return {
    activo: true, porCodigo: new Map(), elegidas: new Set(), puedePedir: true, alternar,
    abrirHoja: vi.fn(), pedir: async () => {}, rotuloPedir: null, lineaDelPedido: null, hoja: null,
  };
}

async function abrir(muestras: ControlMuestras) {
  render(
    <PedidoBultos
      pedido={{ empresa_key: "fashion_shoes", pedido_switch_id: 2228, secuencial: "16-2228", cliente_codigo: "D-25", cliente_nombre: "City Mall" }}
      puedePoner={false}
      ocultarBulto
      muestras={muestras}
      onVolver={() => {}}
    />,
  );
  return screen.findByText("Women-Sneakers");
}

describe("🔴 interruptores prendidos", () => {
  it("los dos", () => {
    expect(PEDIDO_CON_EXISTENCIA_2026_11).toBe(true);
    expect(MUESTRA_TOCANDO_LA_FILA_2026_11).toBe(true);
  });
});

describe("🔴 «Existencia» antes de «Cantidad»", () => {
  it("la columna va a la izquierda y sin dato dice «—»", async () => {
    await abrir(control());
    const cabeza = screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
    const ex = cabeza.findIndex((t) => t.includes("Existencia"));
    const cant = cabeza.findIndex((t) => t.includes("Cantidad"));
    expect(ex).toBeGreaterThan(-1);
    expect(ex).toBe(cant - 1);
    const [, f1, f2] = screen.getAllByRole("row");
    const celdas = (f: HTMLElement) => within(f).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas(f1)).toEqual(expect.arrayContaining(["14", "6"]));
    expect(celdas(f2)).toContain("—");
    expect(celdas(f2)).not.toContain("0");
  });
  it("«—» nunca es 0", () => {
    expect(textoExistencia(null)).toBe("—");
    expect(textoExistencia(undefined)).toBe("—");
    expect(textoExistencia(0)).toBe("0");
  });
});

describe("🔴 tocar el renglón marca la muestra", () => {
  it("tocar la descripción = tocar el círculo, una sola vez", async () => {
    const alternar = vi.fn();
    fireEvent.click(await abrir(control(alternar)));
    expect(alternar).toHaveBeenCalledTimes(1);
    expect(alternar).toHaveBeenCalledWith("TWLENILA140");
  });
  it("el círculo sigue andando y no marca dos veces", async () => {
    const alternar = vi.fn();
    await abrir(control(alternar));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pedir muestra de FM0FM05393YBS/ }));
    expect(alternar).toHaveBeenCalledTimes(1);
  });
  it("con el teclado: Enter sobre la fila", async () => {
    const alternar = vi.fn();
    const celda = await abrir(control(alternar));
    fireEvent.keyDown(celda.closest("tr")!, { key: "Enter" });
    expect(alternar).toHaveBeenCalledWith("TWLENILA140");
  });
  it("quien no pide muestras: tocar la fila no hace nada", async () => {
    const alternar = vi.fn();
    fireEvent.click(await abrir({ ...control(alternar), puedePedir: false }));
    expect(alternar).not.toHaveBeenCalled();
  });
});
