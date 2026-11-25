// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — 25-nov-2026 (foto de la computadora de bodega):
//   1. La cápsula de empresa con una empresa elegida salía VACÍA (blanco sobre
//      blanco: en el CSS final `bg-white`/`text-white` le ganan a `bg-gray-900`).
//   2. En la computadora, la empresa va en la fila de los estados, junto a «Imprimir».
//   3. Las listas se vuelven a leer de la BASE al volver a la ventana
//      (`useReleerAlVolver`), nunca de Switch.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChipSelector, CLASE_CHIP_PUESTO } from "@/components/celular/BarraDeControles";
import { debeReleer, RELEER_AL_VOLVER_2026_11, RELEER_AL_VOLVER_MIN_MS, useReleerAlVolver } from "@/lib/hooks/useReleerAlVolver";
import { PEDIDOS_EMPRESA_JUNTO_A_IMPRIMIR } from "@/lib/ui/pedidos-conteos-2026-11";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const OPCIONES = [
  { valor: "todas", etiqueta: "Todas las empresas" },
  { valor: "active_shoes", etiqueta: "Active Shoes" },
];

describe("La cápsula de empresa no sale vacía", () => {
  it("con una empresa elegida dice cuál y va negra con «!» (le gana al blanco de la base)", () => {
    const { container } = render(<ChipSelector rotulo="Empresa" sinRotulo valor="active_shoes" opciones={OPCIONES} onCambiar={() => {}} />);
    const chip = container.querySelector("[data-chip-selector]")!;
    expect(chip.textContent).toContain("Active Shoes");
    for (const c of ["!bg-gray-900", "!text-white", "!border-gray-900"]) expect(chip.className).toContain(c);
    expect(CLASE_CHIP_PUESTO.split(" ").every((c) => c.startsWith("!"))).toBe(true);
  });

  it("con «Todas las empresas» va blanca y dice el rótulo", () => {
    const { container } = render(<ChipSelector rotulo="Empresa" sinRotulo valor="todas" opciones={OPCIONES} onCambiar={() => {}} />);
    const chip = container.querySelector("[data-chip-selector]")!;
    expect(chip.textContent).toContain("Todas las empresas");
    expect(chip.className).not.toContain("!bg-gray-900");
  });
});

describe("Pedidos en la computadora: la empresa junto a «Imprimir»", () => {
  const src = leer("src/app/despachos/components/PedidosView.tsx");
  it("interruptor prendido", () => expect(PEDIDOS_EMPRESA_JUNTO_A_IMPRIMIR).toBe(true));
  it("el selector está en la fila de los estados, antes de «Imprimir», solo en la computadora", () => {
    const fila = src.slice(src.indexOf("const chips = ("), src.indexOf("const dosPorDos"));
    expect(fila.indexOf("data-empresa-junto-a-imprimir")).toBeGreaterThan(-1);
    expect(fila.indexOf("data-empresa-junto-a-imprimir")).toBeLessThan(fila.indexOf("Imprimir\n"));
    expect(src).toMatch(/empresaJuntoAImprimir = conConteos && !barra && PEDIDOS_EMPRESA_JUNTO_A_IMPRIMIR/);
    // Y no se repite en la fila de abajo.
    expect(src).toContain("NUEVO && hayQueElegirEmpresa && !empresaJuntoAImprimir ? (");
    // Y el resumen, «el más viejo» y «Actualizado» quedan en UNA línea.
    expect(src).toMatch(/empresaJuntoAImprimir \? \(\s*\/\/[^\n]*\n\s*<div data-una-linea/);
  });
});

describe("La fila de pestañas no dibuja ▲▼ en Windows", () => {
  it("sin desborde vertical, sin barra nativa, y las pestañas no bajan 1 px", async () => {
    const { CLASE_FILA_PESTANAS } = await import("@/lib/ui/fila-pestanas");
    for (const c of ["overflow-y-hidden", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden"]) expect(CLASE_FILA_PESTANAS).toContain(c);
    for (const f of ["src/app/despachos/page.tsx", "src/app/boston/BostonShell.tsx"]) {
      const src = leer(f);
      expect(src, f).toContain("className={CLASE_FILA_PESTANAS}");
      expect(src, f).not.toMatch(/-mb-px/);
    }
  });
});

describe("useReleerAlVolver — relee al volver a la ventana", () => {
  afterEach(() => vi.useRealTimers());

  it("interruptor prendido y freno de 10 s", () => {
    expect(RELEER_AL_VOLVER_2026_11).toBe(true);
    expect(debeReleer(true, RELEER_AL_VOLVER_MIN_MS, 0)).toBe(true);
    expect(debeReleer(true, RELEER_AL_VOLVER_MIN_MS - 1, 0)).toBe(false);
    expect(debeReleer(false, 10 * RELEER_AL_VOLVER_MIN_MS, 0)).toBe(false);
  });

  it("al volver (focus / visibilitychange) llama UNA vez, y no antes del freno", () => {
    vi.useFakeTimers();
    const releer = vi.fn();
    renderHook(() => useReleerAlVolver(releer));
    window.dispatchEvent(new Event("focus"));
    expect(releer).not.toHaveBeenCalled(); // recién montado: ya leyó
    vi.advanceTimersByTime(RELEER_AL_VOLVER_MIN_MS);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(releer).toHaveBeenCalledTimes(1);
  });

  it("apagado (`activo = false`) no escucha", () => {
    vi.useFakeTimers();
    const releer = vi.fn();
    renderHook(() => useReleerAlVolver(releer, false));
    vi.advanceTimersByTime(RELEER_AL_VOLVER_MIN_MS * 2);
    window.dispatchEvent(new Event("focus"));
    expect(releer).not.toHaveBeenCalled();
  });

  it("lo usan las listas de Despachos, Recordatorios y Préstamos, en segundo plano", () => {
    expect(leer("src/app/despachos/components/PedidosView.tsx")).toContain("useReleerAlVolver(() => void cargar(true))");
    expect(leer("src/app/despachos/components/EtiquetasPorEnvio.tsx")).toContain("useReleerAlVolver(() => void cargar(true))");
    const pagina = leer("src/app/despachos/page.tsx");
    expect(pagina).toContain("useReleerAlVolver(");
    expect(pagina).toContain('v === "guias") void s.loadGuias(true)');
    expect(leer("src/app/recordatorios/RecordatoriosClient.tsx")).toContain("useReleerAlVolver(() => { void loadCheques(true)");
    expect(leer("src/app/prestamos/PrestamosClient.tsx")).toContain("useReleerAlVolver(() => void recargar(true)");
  });

  it("🔴 releer NUNCA llama a Switch (entrar a Despachos no llama a Switch)", () => {
    const gancho = leer("src/lib/hooks/useReleerAlVolver.ts");
    expect(gancho).not.toMatch(/fetch\(/);
    const pagina = leer("src/app/despachos/page.tsx");
    const bloque = pagina.slice(pagina.indexOf("useReleerAlVolver(() => {"), pagina.indexOf("if (!authChecked) return null;"));
    expect(bloque).not.toMatch(/sync-now|facturas-hoy|switch/i);
  });
});
