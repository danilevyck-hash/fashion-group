// ============================================================================
// 🔴 EL RENGLÓN 2 DE LA BARRA DEL CELULAR NO SE ENCIMA (2-oct-2026).
//
// 🩸 En Asistencia (barra v3.3), a la izquierda de «Empresa: Todas ▾» se veía
// un «[» suelto: era el borde del 📅. El período declaraba que cabía en 200 px
// (`flex-[1_1_200px] min-w-0`), el renglón subía el chip a su lado, y el
// período real (‹ fecha › + 📅, ~256 px) quedaba DEBAJO del chip.
//
// La regla: un control del renglón 2 nunca se encoge por debajo de lo que
// mide; si no cabe al lado, el chip baja solo (`flex-wrap`).
//
// Mutaciones que caza: (1) vuelve `min-w-0` o una base encogible al período ·
// (2) el período deja de usar la clase compartida · (3) el renglón 2 pierde el
// `flex-wrap` cuando lleva el chip al lado.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "fs";
import path from "path";
import SelectorPeriodo, { CLASE_PERIODO_EN_LA_BARRA } from "@/components/asistencia/SelectorPeriodo";

afterEach(cleanup);

const SRC = path.resolve(__dirname, "../..");

describe("renglón 2: el período nunca se encoge por debajo de lo que mide", () => {
  it("la clase del período en la barra no deja que se encoja", () => {
    expect(CLASE_PERIODO_EN_LA_BARRA).toContain("flex-[1_0_auto]");
    expect(CLASE_PERIODO_EN_LA_BARRA).not.toMatch(/min-w-0|flex-\[1_1_|flex-1\b/);
  });

  it("el período a todo el ancho la usa, sin `min-w-0`", () => {
    const { container } = render(
      <SelectorPeriodo desde="2026-09-16" hasta="2026-09-30" hoy="2026-10-02" onElegir={() => {}} anchoCompleto />,
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.className).toContain("flex-[1_0_auto]");
    expect(raiz.className.split(/\s+/)).not.toContain("min-w-0");
  });

  it("nadie vuelve a la base encogible de 200 px", () => {
    const archivos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") recorrer(p); }
        else if (/\.tsx?$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(SRC);
    const culpables = archivos.filter((f) => fs.readFileSync(f, "utf8").includes("flex-[1_1_200px]"));
    expect(culpables).toEqual([]);
  });

  it("con el chip al lado, el renglón 2 envuelve (`flex-wrap`)", () => {
    const src = fs.readFileSync(path.join(SRC, "components/celular/BarraDeControles.tsx"), "utf8");
    const renglon = src.slice(src.indexOf('data-renglon="periodo"'), src.indexOf('data-renglon="filtros"'));
    expect(renglon).toMatch(/filaJuntoAlPeriodo \? "[^"]*flex-wrap/);
  });
});
