// 🔴 EN 390 PX EL TÍTULO DE LA FILA NO SE PARTE LETRA POR LETRA (24-sep-2026).
// Medido en /marketing/tommy-hilfiger: «Período 2026» en una caja de 5 × 248 px
// y «mid 2026 · PVH» en 0 × 248 px, porque chip + monto + ZIP + Cerrar son
// `shrink-0` y el título no tenía ancho mínimo. La fila envuelve en el celular
// (título ≥ 45 %, acciones en su propia línea) y sigue en una línea en `sm`.
// Mutaciones cazadas: quitar `flex-wrap` · quitar `min-w-[45%]` · quitar
// `basis-full` de las acciones · quitar `sm:flex-nowrap`.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FilaNivel } from "@/app/marketing/components/FilaNivel";

describe("Marketing › FilaNivel en el celular", () => {
  afterEach(() => cleanup());
  it("la fila envuelve con el dedo y va en una línea con el mouse; el título reserva su ancho", () => {
    render(
      <FilaNivel
        chip={<span>ABIERTO</span>}
        titulo="Período 2026"
        subtitulo="16 gastos · 42 días abierto"
        monto="$21,530.98"
        acciones={<><button>ZIP</button><button>Cerrar</button></>}
        onClick={() => {}}
      />,
    );
    const titulo = screen.getByText("Período 2026");
    const fila = titulo.closest("[class*='min-h-[56px]']")!;
    expect(fila.className).toContain("flex-wrap");
    expect(fila.className).toContain("sm:flex-nowrap");
    expect(titulo.parentElement!.className).toContain("min-w-[45%]");
    expect(titulo.parentElement!.className).toContain("sm:min-w-0");
    const acciones = screen.getByText("ZIP").parentElement!;
    expect(acciones.className).toContain("basis-full");
    expect(acciones.className).toContain("sm:basis-auto");
  });
});
