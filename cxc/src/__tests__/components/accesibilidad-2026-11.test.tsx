// Accesibilidad (15-nov-2026, `ACCESIBILIDAD_2026_11`): lo que Daniel aprobó
// de la auditoría. Las pruebas viejas de cada pantalla vigilan la pantalla de
// antes (interruptor apagado); esta vigila la nueva. Ningún monto cambia.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { render, screen, fireEvent } from "@testing-library/react";
import TiraTotales from "@/app/cxc/components/TiraTotales";
import EncabezadoOrdenable from "@/app/cxc/components/EncabezadoOrdenable";
import { clicConTeclado } from "@/lib/ui/clic-con-teclado";
import { ACCESIBILIDAD_2026_11 } from "@/lib/ui/accesibilidad-2026-11";
import type { ConsolidatedClient } from "@/lib/types";

const cliente = (p: Partial<ConsolidatedClient>) => ({ total: 0, current: 0, watch: 0, overdue: 0, ...p }) as ConsolidatedClient;

describe("accesibilidad 2026-11, prendida", () => {
  it("el interruptor está prendido", () => {
    expect(ACCESIBILIDAD_2026_11).toBe(true);
  });

  it("CxC computadora: el rótulo del tramo dice «días», en 14 px, y el monto no cambia", () => {
    render(
      <TiraTotales
        roleClients={[cliente({ total: 900, current: 600, watch: 300 })]}
        riskFilter="all"
        onRiskFilterChange={() => {}}
        sinPagar={null}
        sinPagarActivo={false}
        onToggleSinPagar={() => {}}
      />,
    );
    const rotulo = screen.getByText("91-120 días");
    expect(rotulo.className).toContain("text-sm");
    expect(document.body.textContent).toContain("$300.00");
    expect(document.body.innerHTML).not.toContain("text-[11px]");
  });

  it("CxC computadora: los encabezados que ordenan son botones con su nombre", () => {
    const toggle = vi.fn();
    render(
      <EncabezadoOrdenable sinSeleccion todosSeleccionados={false} onSeleccionarTodos={() => {}} toggleSort={toggle} sortArrow={(k) => (k === "total" ? "▼" : "")} />,
    );
    const b = screen.getByRole("button", { name: "Ordenar por +120 días" });
    fireEvent.click(b);
    expect(toggle).toHaveBeenCalledWith("overdue");
    expect(screen.getByRole("button", { name: "Ordenar por Total, de mayor a menor" })).toBeTruthy();
  });

  it("lo que se toca y no es botón se abre con Enter y con la barra espaciadora", () => {
    const abrir = vi.fn();
    render(<div data-testid="x" {...clicConTeclado(abrir)}>Fila</div>);
    const el = screen.getByTestId("x");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("role")).toBe("button");
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: " " });
    fireEvent.keyDown(el, { key: "a" });
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it("una fila de tabla conserva su papel de fila", () => {
    const props = clicConTeclado(() => {}, { fila: true }) as Record<string, unknown>;
    expect(props.role).toBeUndefined();
    expect(props.tabIndex).toBe(0);
  });

  it("globals.css respeta «reducir movimiento» y muestra el foco", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid/);
    expect(css).toMatch(/\[data-tab-bar\]\[data-solido\]/);
  });

  it("la barra de pestañas: rótulos de 12 px y fondo sólido", () => {
    const header = readFileSync("src/components/AppHeader.tsx", "utf8");
    expect(header).toContain('ACCESIBILIDAD_2026_11 ? "text-[12px] font-semibold"');
    expect(header).toContain('data-solido={ACCESIBILIDAD_2026_11 ? "" : undefined}');
  });

  it("los tonos de aviso bajaron un paso (texto ≥ 4,5:1)", () => {
    const tw = readFileSync("tailwind.config.ts", "utf8");
    expect(tw).toContain("amber: { 600: '#b45309' }");
    expect(tw).toContain("emerald: { 600: '#047857' }");
    expect(tw).toContain("red: { 500: '#dc2626', 600: '#b91c1c' }");
  });
});
