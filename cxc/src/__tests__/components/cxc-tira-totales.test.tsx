// ─────────────────────────────────────────────────────────────────────────────
// LA TIRA DE TOTALES — PARADA SOBRE SUS COLUMNAS (5-sep-2026).
//
// 🩸 Eran cuatro píldoras redondas flotando en su propia línea, con el nombre
// largo del tramo adentro, a media pantalla de la columna que resumen. Y eran
// uno de SEIS bloques antes de ver al primer cliente.
//
// Ahora es UNA tira gris en la MISMA grilla de 12 columnas que la tabla
// (4/2/2/2/2), así que cada total queda parado sobre su columna.
//
// 🔴 EL CHIP DICE SOLO EL RANGO («0-90d»). El nombre largo NO desapareció del
// sistema: sigue en el celular, el papel, el correo y el `title` de cada chip,
// y todos salen de `tramoLabel()` — la misma fuente única de siempre. Cambió
// DÓNDE se dice, no cuántos nombres hay.
//
// ⚠️ NI UN NÚMERO SE MOVIÓ: los tramos siguen siendo 0-90 / 91-120 / 121+.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import TiraTotales from "@/app/cxc/components/TiraTotales";
import { AGING, AGING_ORDER, tramoLabel } from "@/lib/cxc-aging";
import type { ConsolidatedClient } from "@/lib/types";

afterEach(cleanup);

// Dos clientes con saldo en los tres tramos: si las cifras cambiaran, se ve.
const CLIENTES = [
  { nombre_normalized: "UNO", total: 300, current: 100, watch: 100, overdue: 100, companies: {} },
  { nombre_normalized: "DOS", total: 300, current: 200, watch: 50, overdue: 50, companies: {} },
] as unknown as ConsolidatedClient[];

const pintar = (extra: Partial<React.ComponentProps<typeof TiraTotales>> = {}) =>
  render(
    <TiraTotales
      roleClients={CLIENTES}
      riskFilter="all"
      onRiskFilterChange={vi.fn()}
      sinPagar={null}
      sinPagarActivo={false}
      onToggleSinPagar={vi.fn()}
      {...extra}
    />,
  );

describe("🔴 la tira vive en la MISMA grilla que la tabla", () => {
  it("es `grid-cols-12` con el reparto 4/2/2/2/2", () => {
    const { container } = pintar();
    const tira = container.firstElementChild as HTMLElement;
    expect(tira.className).toContain("grid-cols-12");
    const spans = [...tira.children].map((c) =>
      (c.className.match(/col-span-(\d+)/) ?? [])[1]);
    expect(spans).toEqual(["4", "2", "2", "2", "2"]);
  });
});

describe("🔴 el chip dice SOLO el rango", () => {
  it("«0-90d» · «91-120d» · «121d+», sin el nombre largo adentro", () => {
    pintar();
    for (const k of AGING_ORDER) {
      expect(screen.getByText(AGING[k].colLabel), `falta «${AGING[k].colLabel}»`).toBeTruthy();
      expect(screen.queryByText(tramoLabel(k)), `el nombre largo volvió al chip de ${k}`).toBeNull();
    }
  });

  it("pero el nombre COMPLETO sigue estando, en el `title` de cada chip", () => {
    pintar();
    for (const k of AGING_ORDER) {
      const chip = screen.getByText(AGING[k].colLabel).closest("button")!;
      expect(chip.getAttribute("title"), `el ${k} perdió su nombre largo`).toContain(tramoLabel(k));
    }
  });

  it("el rótulo sale de `cxc-aging`, no de una lista escrita acá", () => {
    const src = require("fs").readFileSync(
      require("path").join(process.cwd(), "src/app/cxc/components/TiraTotales.tsx"), "utf8");
    expect(src).toContain('from "@/lib/cxc-aging"');
    for (const k of AGING_ORDER) {
      expect(src, `«${AGING[k].label}» volvió escrito a mano`).not.toContain(`"${AGING[k].label}"`);
    }
  });
});

describe("⚠️ NINGÚN número ni corte se movió", () => {
  it("los tramos siguen siendo 0-90 / 91-120 / 121+", () => {
    expect(AGING.current.colLabel).toBe("0-90d");
    expect(AGING.watch.colLabel).toBe("91-120d");
    expect(AGING.overdue.colLabel).toBe("121d+");
  });

  it("las sumas por tramo son las de siempre (600 · 300 · 150 · 150)", () => {
    pintar();
    const texto = document.body.textContent ?? "";
    for (const monto of ["600.00", "300.00", "150.00"]) {
      expect(texto, `falta $${monto}`).toContain(monto);
    }
  });

  it("los conteos por tramo no cambiaron", () => {
    const { container } = pintar();
    const botones = [...container.querySelectorAll("button")];
    // Tres tramos + Total. La celda 1 sin aviso no es un botón.
    expect(botones.length).toBe(4);
  });

  it("tocar un chip avisa con su CLAVE, no con su rótulo", () => {
    const onChange = vi.fn();
    pintar({ onRiskFilterChange: onChange });
    fireEvent.click(screen.getByText(AGING.overdue.colLabel).closest("button")!);
    expect(onChange).toHaveBeenCalledWith("overdue");
  });

  it("el chip de Total dice el conteo, que es donde vive ahora", () => {
    pintar();
    expect(screen.getByText("Total · 2")).toBeTruthy();
  });
});

describe("🔴 la celda 1: el aviso «sin pagar hace +90 d»", () => {
  it("dice cuántos son y cuánto deben, y es TOCABLE", () => {
    const toggle = vi.fn();
    pintar({ sinPagar: { cuantos: 37, monto: 647944.31 }, onToggleSinPagar: toggle });
    const aviso = screen.getByText("37 sin pagar hace +90 d");
    expect(screen.getByText("$647,944.31")).toBeTruthy();
    fireEvent.click(aviso.closest("button")!);
    expect(toggle).toHaveBeenCalled();
  });

  it("encendido se ve encendido (aria-pressed), y dice cómo apagarlo", () => {
    pintar({ sinPagar: { cuantos: 37, monto: 647944.31 }, sinPagarActivo: true });
    const boton = screen.getByText("37 sin pagar hace +90 d").closest("button")!;
    expect(boton.getAttribute("aria-pressed")).toBe("true");
    expect(boton.getAttribute("title")).toContain("volver a ver a todos");
  });

  it("sin ninguno, la celda vuelve a decir «N clientes» — nunca «0 sin pagar»", () => {
    pintar({ sinPagar: { cuantos: 0, monto: 0 } });
    expect(screen.getByText("2 clientes")).toBeTruthy();
    expect(screen.queryByText(/sin pagar/)).toBeNull();
  });

  it("y tampoco cuando no hay dato todavía", () => {
    pintar({ sinPagar: null });
    expect(screen.getByText("2 clientes")).toBeTruthy();
  });
});
