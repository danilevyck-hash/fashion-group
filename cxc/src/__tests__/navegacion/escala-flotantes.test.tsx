// ============================================================================
// 🔴 CON LA ESCALA v3, LO FLOTANTE QUEDA PEGADO A SU BOTÓN (2-oct-2026).
//
// La escala pone `zoom` en <html>. El navegador MIDE en píxeles de la pantalla
// (`getBoundingClientRect`, `innerWidth`), pero lo que se escribe en el estilo se
// vuelve a multiplicar por el zoom. 🩸 Medido sin la corrección: el menú del
// usuario quedaba 101 px corrido en 1440 y fuera de la pantalla en 1920.
//
// Aquí, sin servidor: se finge la raíz con zoom y el ancla medida en píxeles de
// la pantalla, y se comprueba que lo ESCRITO, multiplicado por la escala, cae
// exactamente pegado al ancla. Vale para los desplegables, el calendario y el
// menú del usuario (los tres usan `DesplegableFlotante`, con o sin vidrio) y
// para el «···» (`OverflowMenu`).
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { escalaRaiz } from "@/lib/ui/escala-raiz";

const ESCALA = 1.0714; // 1440 px: letra 14 → 15.
const ANCHO_PANTALLA = 1440;
const ALTO_PANTALLA = 900;

/** Finge la raíz escalada: `zoom` en <html> y la pantalla medida en píxeles reales. */
function fingirEscala(escala: number) {
  const original = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const cs = original.call(window, el, pseudo);
    if (el === document.documentElement) {
      return new Proxy(cs, { get: (t, p) => (p === "zoom" ? String(escala) : Reflect.get(t, p)) });
    }
    return cs;
  });
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(ANCHO_PANTALLA);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(ALTO_PANTALLA);
}

/** Un rectángulo medido en la pantalla (lo que devuelve el navegador con zoom). */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Desplegable({ alinear, ancho }: { alinear?: "izquierda" | "derecha"; ancho?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} data-ancla>ancla</button>
      <DesplegableFlotante abierto anclaRef={ref} alinear={alinear} ancho={ancho} marca="prueba">
        <p>contenido</p>
      </DesplegableFlotante>
    </>
  );
}

function montarDesplegable(anclaEnPantalla: DOMRect, props: { alinear?: "izquierda" | "derecha"; ancho?: number } = {}) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-ancla") ? anclaEnPantalla : rect(0, 0, 0, 0);
  });
  render(<Desplegable {...props} />);
  const panel = document.querySelector<HTMLElement>('[data-desplegable="prueba"]')!;
  const px = (v: string) => parseFloat(v);
  return {
    // Lo que se VE: lo escrito en el estilo, multiplicado por la escala.
    left: px(panel.style.left) * ESCALA,
    top: px(panel.style.top) * ESCALA,
    width: px(panel.style.width) * ESCALA,
  };
}

describe("escala v3: la raíz se lee bien", () => {
  it("sin escala vale 1; con la raíz escalada, la escala", () => {
    expect(escalaRaiz()).toBe(1);
    fingirEscala(ESCALA);
    expect(escalaRaiz()).toBeCloseTo(ESCALA, 4);
  });
});

describe("escala v3: desplegables, calendario y menú del usuario (DesplegableFlotante)", () => {
  it("abre pegado DEBAJO de su ancla, alineado a su borde izquierdo (desplegable, calendario)", () => {
    fingirEscala(ESCALA);
    const ancla = rect(383, 152, 47, 47); // el 📅 de Asistencia, medido en 1440
    const visto = montarDesplegable(ancla);
    expect(visto.left).toBeCloseTo(ancla.left, 0);
    expect(visto.top).toBeCloseTo(ancla.bottom + 4 * ESCALA, 0);
  });

  it("alineado a la DERECHA (menú del usuario): su borde derecho coincide con el del botón y no se sale", () => {
    fingirEscala(ESCALA);
    const boton = rect(1314, 0, 100, 47); // «Daniel» arriba a la derecha, en 1440
    const visto = montarDesplegable(boton, { alinear: "derecha", ancho: 224 });
    expect(visto.left + visto.width).toBeCloseTo(boton.right, 0);
    expect(visto.left + visto.width).toBeLessThanOrEqual(ANCHO_PANTALLA);
  });

  it("CONTROL: sin dividir entre la escala, el menú se saldría de la pantalla (el defecto medido)", () => {
    const boton = rect(1314, 0, 100, 47);
    const izquierdaSinDividir = (boton.right - 224 * ESCALA) * ESCALA; // lo que pasaba
    expect(izquierdaSinDividir + 224 * ESCALA * ESCALA).toBeGreaterThan(ANCHO_PANTALLA);
  });
});

describe("escala v3: el «···» (OverflowMenu)", () => {
  it("abre pegado a su botón, en píxeles de la pantalla", () => {
    fingirEscala(ESCALA);
    const boton = rect(1200, 300, 44, 44);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.closest("[data-boton-menu]") || this.hasAttribute("data-boton-menu") ? boton : rect(0, 0, 0, 0);
    });
    const { container } = render(
      <div data-boton-menu>
        <OverflowMenu items={[{ label: "Descargar", onClick: () => {} }]} />
      </div>,
    );
    const disparador = container.querySelector("button")!;
    disparador.setAttribute("data-boton-menu", "");
    fireEvent.click(disparador);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    const top = parseFloat(menu!.style.top) * ESCALA;
    expect(top).toBeCloseTo(boton.bottom + 4 * ESCALA, 0);
  });
});

describe("escala v3: el vidrio va sobre el mismo desplegable", () => {
  it("el menú del usuario y los desplegables con vidrio usan DesplegableFlotante (la misma corrección)", () => {
    const menu = readFileSync(join(__dirname, "../../components/estructura/MenuDelUsuario.tsx"), "utf8");
    expect(menu).toContain("<DesplegableFlotante");
    const desplegable = readFileSync(join(__dirname, "../../components/ui/DesplegableFlotante.tsx"), "utf8");
    expect(desplegable).toContain("vidrioSobre(");
    expect(desplegable).toMatch(/const z = escalaRaiz\(\);/);
  });
});
