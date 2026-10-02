// ============================================================================
// Lo que encontró la auditoría de botones del 2-oct-2026
// (`scripts/auditar-botones.ts`), cada defecto con su candado:
//
//   1. El globo de «6 empresas» (Ventas › Clientes) solo se abría con el
//      mouse: en el iPad y el iPhone tocarlo no hacía nada.
//   2. Marcaciones a 390 px medía 420 de ancho: la línea «Entrada · Almuerzo ·
//      Salida» no tenía dónde partirse, y el ☰ quedaba fuera del dedo.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), "utf8");

afterEach(cleanup);

describe("el globo se abre al tocar", () => {
  it("un toque (clic, sin mouse encima) lo abre", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">6 empresas</button>
          </TooltipTrigger>
          <TooltipContent>Vistana $100.00</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.queryAllByText("Vistana $100.00")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "6 empresas" }));
    expect(screen.getAllByText("Vistana $100.00").length).toBeGreaterThan(0);
  });
});

describe("las marcas del día se pueden partir en el celular", () => {
  it("el « · » va afuera del tramo que no se parte", () => {
    const src = leer("src/app/asistencia/MarcacionesTab.tsx");
    const marcas = src.slice(src.indexOf("function Marcas("), src.indexOf("function Marcas(") + 1200);
    expect(marcas).toMatch(/\{i > 0 && <span className="text-gray-300"> · <\/span>\}\s*<span className="whitespace-nowrap">/);
  });
});
