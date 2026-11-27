// 🔴 Candado: deslizar hacia abajo hace EXACTAMENTE lo que el toque de
// «Actualizar» (26-nov-2026). Si el gesto deja de llamar al mismo camino
// (syncConEnganche con las mismas opciones, el mismo onSuccess, el mismo
// freno mientras corre), esta prueba se pone roja.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sync = vi.fn();
vi.mock("@/components/shared/syncNowClient", () => ({ syncConEnganche: (o: unknown) => sync(o) }));

import SyncNowButton from "@/components/shared/SyncNowButton";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { PullToRefresh } from "@/components/ui";
import {
  accionDelGesto,
  distanciaConResistencia,
  DESLIZAR_ACTUALIZA_CON_SWITCH,
  TOPE_PX,
  UMBRAL_PX,
} from "@/lib/ui/deslizar-para-actualizar";

const opcion = { modulo: "facturas", empresa: "vistana" };
let rects: typeof Element.prototype.getClientRects;

beforeEach(() => {
  sync.mockReset();
  sessionStorage.setItem("cxc_role", "admin");
  rects = Element.prototype.getClientRects;
  // jsdom no dibuja: todo lo montado «se ve».
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  Element.prototype.getClientRects = rects;
  sessionStorage.clear();
});

describe("deslizar para actualizar", () => {
  it("está prendido", () => {
    expect(DESLIZAR_ACTUALIZA_CON_SWITCH).toBe(true);
  });

  it("el gesto llama al MISMO camino que tocar «Actualizar»", async () => {
    sync.mockResolvedValue({ tipo: "ok", resumen: "Datos al día" });
    const onSuccess = vi.fn();
    render(<SyncNowButton opciones={[opcion]} onSuccess={onSuccess} />);
    const boton = await screen.findByRole("button");

    fireEvent.click(boton);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const porToque = sync.mock.calls[0];

    await act(async () => {
      await accionDelGesto()!.ejecutar();
    });
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(sync.mock.calls[1]).toEqual(porToque);
  });

  it("mientras corre, el gesto no vuelve a disparar", async () => {
    let soltar: (v: unknown) => void = () => {};
    sync.mockReturnValue(new Promise((r) => (soltar = r)));
    render(<SyncNowButton opciones={[opcion]} onSuccess={() => {}} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(accionDelGesto()!.ocupado()).toBe(true));
    await act(async () => soltar({ tipo: "ok" }));
    await waitFor(() => expect(accionDelGesto()!.ocupado()).toBe(false));
  });

  it("sin permiso no se inscribe; el botón sigue siendo el de siempre", async () => {
    sessionStorage.setItem("cxc_role", "bodega");
    render(<SyncNowButton opciones={[opcion]} onSuccess={() => {}} />);
    await act(async () => {});
    expect(accionDelGesto()).toBeNull();
  });

  it("«Actualizar» gana a la recarga de la pantalla; sin él, recarga", async () => {
    const recarga = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <PullToRefresh onRefresh={recarga}>
        <SyncNowButton opciones={[opcion]} onSuccess={() => {}} />
      </PullToRefresh>,
    );
    await screen.findByRole("button");
    expect(accionDelGesto()!.tipo).toBe("actualizar");
    rerender(<PullToRefresh onRefresh={recarga}><p>sin botón</p></PullToRefresh>);
    await act(async () => {
      await accionDelGesto()!.ejecutar();
    });
    expect(recarga).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it("la acción propia de LineaDeFrescura también es la del gesto", async () => {
    const accion = vi.fn().mockResolvedValue(undefined);
    render(<LineaDeFrescura forma="celular" actualizado={null} onActualizar={accion} />);
    await act(async () => {
      await accionDelGesto()!.ejecutar();
    });
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it("resistencia como iOS: suave hasta el umbral, nunca pasa el tope", () => {
    expect(distanciaConResistencia(-10)).toBe(0);
    expect(distanciaConResistencia(UMBRAL_PX * 2)).toBe(UMBRAL_PX);
    expect(distanciaConResistencia(10_000)).toBeLessThanOrEqual(TOPE_PX);
  });

  it("el gesto está montado una vez en el layout", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("<DeslizarParaActualizar />");
  });
});
