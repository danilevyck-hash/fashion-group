// 🔴 Candado: los gestos del iPhone (27-nov-2026, `GESTOS_IPHONE_2026_11`).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esPantallaDeDetalle, SubirAlInicio, useMantenerPresionado } from "@/components/shared/GestosIphone";
import { pasoAlDeslizar } from "@/lib/guias/pedidos-flujo-simple";
import { GESTOS_IPHONE_2026_11 } from "@/lib/ui/gestos-iphone-2026-11";

afterEach(() => vi.useRealTimers());
const leer = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("gestos del iPhone", () => {
  it("está prendido y montado una vez en el layout", () => {
    expect(GESTOS_IPHONE_2026_11).toBe(true);
    const layout = leer("src/app/layout.tsx");
    expect(layout).toContain("<VolverDesdeElBorde />");
    expect(layout).toContain("<SubirAlInicio />");
  });

  it("Pedidos: deslizar a la derecha = el paso siguiente, con la regla de rol de los botones", () => {
    const bodega = { puedeMarcar: true, puedeRecibir: false };
    const secretaria = { puedeMarcar: false, puedeRecibir: true };
    expect(pasoAlDeslizar("pendiente", bodega)).toBe("en_preparacion");
    expect(pasoAlDeslizar("en_preparacion", bodega)).toBe("preparado");
    expect(pasoAlDeslizar("preparado", bodega)).toBeNull();
    expect(pasoAlDeslizar("pendiente", secretaria)).toBeNull();
    expect(pasoAlDeslizar("preparado", secretaria)).toBe("recibido");
    expect(pasoAlDeslizar("recibido", { puedeMarcar: true, puedeRecibir: true })).toBeNull();
  });

  it("Pedidos: «Preparado» abre los bultos y lo demás va por `moverSimple` con «Deshacer»", () => {
    const v = leer("src/app/despachos/components/PedidosView.tsx");
    expect(v).toMatch(/destino === "preparado"\s*\?\s*\(\) => \{ setPorPreparar\(p\)/);
    expect(v).toContain("execute: () => moverSimple(p, destino)");
  });

  it("volver desde el borde solo en pantallas de detalle", () => {
    expect(esPantallaDeDetalle("/clientes/D-25", "")).toBe(true);
    expect(esPantallaDeDetalle("/despachos/123", "")).toBe(true);
    expect(esPantallaDeDetalle("/reclamos", "?view=detail&id=9")).toBe(true);
    expect(esPantallaDeDetalle("/cxc", "")).toBe(false);
    expect(esPantallaDeDetalle("/despachos", "?tab=pedidos")).toBe(false);
  });

  it("mantener presionado 500 ms dispara, y el toque que sigue no abre", async () => {
    vi.useFakeTimers();
    const alMantener = vi.fn();
    const abrir = vi.fn();
    function Fila() {
      const m = useMantenerPresionado(alMantener);
      return <button type="button" onClick={abrir} {...m}>Cliente</button>;
    }
    render(<Fila />);
    const b = screen.getByText("Cliente");
    fireEvent.touchStart(b, { touches: [{ clientX: 50, clientY: 50 }] });
    await act(async () => { vi.advanceTimersByTime(499); });
    expect(alMantener).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2); });
    expect(alMantener).toHaveBeenCalledTimes(1);
    fireEvent.touchEnd(b);
    fireEvent.click(b);
    expect(abrir).not.toHaveBeenCalled();
    // Moverse cancela: es scroll, no mantener.
    fireEvent.touchStart(b, { touches: [{ clientX: 50, clientY: 50 }] });
    fireEvent.touchMove(b, { touches: [{ clientX: 50, clientY: 80 }] });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(alMantener).toHaveBeenCalledTimes(1);
  });

  it("CxC: la tarjeta sale de lo que ya está en pantalla (sin leer nada) y no abre el menú de iOS", () => {
    const v = leer("src/app/cxc/components/PanelCxcCelular.tsx");
    const tarjeta = v.slice(v.indexOf("function TarjetaSaldoPorEmpresa"));
    expect(tarjeta).not.toMatch(/fetch\(|useSWR/);
    expect(leer("src/components/shared/GestosIphone.tsx")).toContain('WebkitTouchCallout: "none"');
  });

  it("tocar el título sube la página al principio", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<><SubirAlInicio /><h1>Despachos</h1><button type="button">Nueva guía</button></>);
    fireEvent.click(screen.getByText("Nueva guía"));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Despachos"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});
