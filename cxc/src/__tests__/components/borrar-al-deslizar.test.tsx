// 🔴 Candado: deslizar para eliminar, como en el iPhone (27-nov-2026,
// `GESTOS_IPHONE_2026_11`). El renglón se esconde, queda «Deshacer» 5 s y
// recién entonces corre el MISMO borrado de la pantalla. Deshacer = no se
// llama a nada. Si el borrado falla, el renglón vuelve.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SwipeableRow } from "@/components/ui";
import { GESTOS_IPHONE_2026_11 } from "@/lib/ui/gestos-iphone-2026-11";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function deslizar(el: HTMLElement, hasta: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 340, clientY: 20 }] });
  for (let x = 340; x >= 340 - hasta; x -= 20) {
    fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: 21 }] });
  }
  fireEvent.touchEnd(el, { touches: [] });
}

function Fila({ alEliminar, abrir = () => {}, propio = false }: { alEliminar: () => unknown; abrir?: () => void; propio?: boolean }) {
  return (
    <SwipeableRow eliminar={{ alEliminar, mensaje: "Reclamo eliminado", deshacerPropio: propio }}>
      <button type="button" onClick={abrir}>R-101</button>
    </SwipeableRow>
  );
}

describe("deslizar para eliminar", () => {
  it("está prendido", () => {
    expect(GESTOS_IPHONE_2026_11).toBe(true);
  });

  it("deslizar hasta el final esconde el renglón y borra a los 5 s", async () => {
    const alEliminar = vi.fn().mockResolvedValue(true);
    render(<Fila alEliminar={alEliminar} />);
    deslizar(screen.getByText("R-101"), 300);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText("R-101")).toBeNull();
    expect(screen.getByText("Deshacer")).toBeTruthy();
    expect(alEliminar).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(alEliminar).toHaveBeenCalledTimes(1);
  });

  it("«Deshacer» devuelve el renglón y no borra nada", async () => {
    const alEliminar = vi.fn();
    render(<Fila alEliminar={alEliminar} />);
    deslizar(screen.getByText("R-101"), 300);
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByText("Deshacer"));
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(alEliminar).not.toHaveBeenCalled();
    expect(screen.getByText("R-101")).toBeTruthy();
  });

  it("deslizar corto muestra «Eliminar»; tocarlo borra con «Deshacer», sin abrir el renglón", async () => {
    const alEliminar = vi.fn().mockResolvedValue(true);
    const abrir = vi.fn();
    render(<Fila alEliminar={alEliminar} abrir={abrir} />);
    deslizar(screen.getByText("R-101"), 100);
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByText("R-101")); // el toque tras deslizar cierra, no abre
    expect(abrir).not.toHaveBeenCalled();
    deslizar(screen.getByText("R-101"), 100);
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByText("Eliminar"));
    expect(screen.queryByText("R-101")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(alEliminar).toHaveBeenCalledTimes(1);
  });

  it("si el borrado no se hizo, el renglón vuelve", async () => {
    render(<Fila alEliminar={() => false} />);
    deslizar(screen.getByText("R-101"), 300);
    await act(async () => { vi.advanceTimersByTime(5500); });
    expect(screen.getByText("R-101")).toBeTruthy();
  });

  it("la pantalla con su propio «Deshacer» recibe el borrado al instante, sin otro aviso", async () => {
    const alEliminar = vi.fn();
    render(<Fila alEliminar={alEliminar} propio />);
    deslizar(screen.getByText("R-101"), 300);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(alEliminar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deshacer")).toBeNull();
  });

  it("cada pantalla pasa SU mismo borrado (no un camino nuevo)", () => {
    const leer = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    expect(leer("src/app/reclamos/ReclamosClient.tsx")).toContain("onDeleteReclamo={(id) => borrarConDeshacer([id])}");
    expect(leer("src/app/caja/hooks/useCajaState.ts")).toMatch(/doDeleteGasto[\s\S]*await borrarGasto\(gastoId\)/);
    expect(leer("src/components/catalogo/ComprobantesPanel.tsx")).toContain("onEliminarDeUna: () => borrarPedido(pedido)");
    expect(leer("src/app/marketing/mobiliario/page.tsx")).toContain("await borrarProducto(deleteProd)");
  });
});
