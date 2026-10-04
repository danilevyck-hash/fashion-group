/**
 * 🔴 CANDADO — LA HOJA DEL «···» MUESTRA SUS OPCIONES, NO SOLO «CANCELAR»
 * (4-oct-2026).
 *
 * 🩸 Daniel, en Comisiones › Multifashion desde su iPhone: tocaba «···» y solo
 * veía «Cancelar» sobre una franja borrosa. La hoja no traía ninguna opción y
 * el vidrio v2 (22 % de blanco) dejaba ver a través la barra de pestañas y la
 * barra negra del total. Ver `HojaMenuCel` en `components/celular/Piezas.tsx`
 * y `docs/diseno.md` › «Detalles aprendidos».
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { HojaMenuCel } from "@/components/celular/Piezas";

const leer = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");

afterEach(cleanup);

describe("HojaMenuCel", () => {
  it("dibuja sus opciones con texto visible, además de «Cancelar», fuera del árbol de la pantalla", () => {
    const { container } = render(
      <div style={{ transform: "translateY(0)" }}>
        <HojaMenuCel abierta onCerrar={() => {}} data-menu-prueba>
          <button type="button">Descargar</button>
          <button type="button">Actualizar ahora</button>
        </HojaMenuCel>
      </div>,
    );
    const hoja = screen.getByRole("dialog", { name: "Más opciones" });
    expect(hoja.textContent).toContain("Descargar");
    expect(hoja.textContent).toContain("Actualizar ahora");
    expect(hoja.textContent).toContain("Cancelar");
    // Por portal: un `transform` de la pantalla no la deja bajo la barra de pestañas.
    expect(container.contains(hoja)).toBe(false);
    expect(hoja.parentElement).toBe(document.body);
  });

  it("sin opciones no se dibuja: nunca una hoja con solo «Cancelar»", () => {
    render(
      <HojaMenuCel abierta onCerrar={() => {}}>
        {false}
        {null}
      </HojaMenuCel>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Cancelar")).toBeNull();
  });
});

describe("las pantallas del «···» del celular", () => {
  it("Ventas y Comisiones usan la hoja común y Comisiones esconde el «···» si no hay qué ofrecer", () => {
    const ventas = leer("src/components/ventas/celular/MenuVentasCelular.tsx");
    const comisiones = leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx");
    expect(ventas).toContain("<HojaMenuCel");
    expect(comisiones).toContain("<HojaMenuCel");
    expect(comisiones).toMatch(/\{conDescarga && <BotonPuntos/);
    // Nadie vuelve a armar la hoja a mano.
    for (const src of [ventas, comisiones]) expect(src).not.toMatch(/fixed inset-0 z-\[60\] flex flex-col justify-end/);
  });

  it("el panel de vidrio con opciones es casi opaco (la barra de pestañas y la cápsula siguen transparentes)", () => {
    const css = leer("src/app/globals.css");
    const regla = css.match(/html\[data-vidrio="v2"\] \.vidrio\.rounded-2xl \{([^}]*)\}/)?.[1] ?? "";
    const alfa = Number(regla.match(/background-color: rgb\(255 255 255 \/ ([\d.]+)\)/)?.[1] ?? 0);
    expect(alfa).toBeGreaterThanOrEqual(0.85);
    expect(regla).not.toMatch(/brightness/);
  });
});
