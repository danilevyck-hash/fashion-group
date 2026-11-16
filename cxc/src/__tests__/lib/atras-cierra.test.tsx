// ============================================================================
// 🔴 EL GESTO DE VOLVER CIERRA LO QUE SE ABRIÓ (16-nov-2026, `ATRAS_CIERRA_2026_11`).
//
// En el celular el detalle de un pedido y las hojas que suben desde abajo no
// se sumaban al historial, y el gesto de volver de iOS sacaba del módulo.
// `useAtrasCierra` (el patrón de Caja menuda): abrir hace `pushState`, el
// gesto de volver cierra, «Cerrar» hace `history.back()` una sola vez y cerrar
// por otro camino deja la entrada marcada muerta (nunca un `back()` que choque
// con una navegación). Y quién lo usa: si alguien lo desenchufa, rojo.
//
// Mutaciones cazadas: (1) abrir sin `pushState` · (2) `popstate` que no cierra
// · (3) doble toque = dos `back()` · (4) cerrar por código llama `back()` ·
// (5) apagado toca el historial · (6) una pantalla desenchufada · (7) las
// pestañas de Despachos vuelven a `replaceState` fijo · (8) «‹ Volver» sin `subirA`.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useAtrasCierra } from "@/lib/hooks/useAtrasCierra";
import { ATRAS_CIERRA_2026_11 } from "@/lib/ui/atras-cierra-2026-11";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montar(activo = true) {
  const cerrar = vi.fn();
  const r = renderHook(({ abierto }) => useAtrasCierra(abierto, cerrar, activo), {
    initialProps: { abierto: false },
  });
  return { ...r, cerrar };
}

describe("useAtrasCierra", () => {
  it("el interruptor está prendido", () => {
    expect(ATRAS_CIERRA_2026_11).toBe(true);
  });

  it("abrir suma una entrada y el gesto de volver cierra", async () => {
    const { rerender, cerrar } = montar();
    const antes = window.history.length;
    rerender({ abierto: true });
    expect(window.history.length).toBe(antes + 1);
    act(() => window.history.back());
    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(1));
  });

  it("«Cerrar» vuelve UNA sola vez aunque se toque dos veces, y corre lo de después", async () => {
    const { rerender, result, cerrar } = montar();
    rerender({ abierto: true });
    const back = vi.spyOn(window.history, "back");
    const despues = vi.fn();
    act(() => {
      result.current(despues);
      result.current(despues);
    });
    expect(back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(1));
    expect(despues).toHaveBeenCalledTimes(1);
  });

  it("cerrar por código no llama a back(): la entrada queda marcada muerta", () => {
    const { rerender } = montar();
    rerender({ abierto: true });
    const back = vi.spyOn(window.history, "back");
    rerender({ abierto: false });
    expect(back).not.toHaveBeenCalled();
    expect((window.history.state as Record<string, unknown>).fgAtrasMuerta).toBe(true);
  });

  it("apagado no toca el historial y «Cerrar» cierra directo", () => {
    const { rerender, result, cerrar } = montar(false);
    const antes = window.history.length;
    rerender({ abierto: true });
    expect(window.history.length).toBe(antes);
    act(() => result.current());
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});

describe("quién lo usa", () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), "src", r), "utf8");
  it.each([
    "app/despachos/components/PedidosView.tsx",
    "app/despachos/components/EtiquetasPorEnvio.tsx",
    "components/celular/Piezas.tsx",
    "components/ui.tsx",
    "app/cxc/page.tsx",
    "components/ventas/celular/HojaClienteCelular.tsx",
    "components/comisiones/ComisionesPorEmpresaView.tsx",
    "components/comisiones/ComisionesConsolidadoView.tsx",
    "app/caja/[periodoId]/page.tsx",
  ])("%s usa useAtrasCierra", (f) => {
    expect(leer(f)).toMatch(/useAtrasCierra\(/);
  });
  it("Caja ya no arma su propio pushState", () => {
    expect(leer("app/caja/[periodoId]/page.tsx")).not.toMatch(/pushState/);
  });
  it("las pestañas de Despachos deciden con modoDeHistorial y escuchan el gesto", () => {
    const s = leer("app/despachos/page.tsx");
    expect(s).toMatch(/modoDeHistorial\("vista"/);
    expect(s).toMatch(/addEventListener\("popstate"/);
  });
  it("«‹ Volver» sube con subirA()", () => {
    expect(leer("components/celular/TituloQueVuelve.tsx")).toMatch(/subirA\(router, href\)/);
  });
});
