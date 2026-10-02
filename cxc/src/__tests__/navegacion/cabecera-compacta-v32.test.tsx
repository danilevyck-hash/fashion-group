// ============================================================================
// 🔴 v3.2 — LA CABECERA COMPACTA DE CUENTAS POR COBRAR, RECLAMOS Y MARKETING
// (2-oct-2026). Daniel, mirando la cabecera de Cuentas por cobrar en el
// celular: «se puede optimizar».
//
// Medido a 390×844 (barra prendida), dónde empieza el primer dato:
//   Cuentas por cobrar 361 → 168 px · Reclamos 229 → 124 px · Marketing 240 → 192 px.
//
// Lo que este candado congela:
//   1. El total va a 36 px (era 46 / 34), con UNA línea gris debajo.
//   2. Los tres tramos de CxC son un control segmentado delgado: 36 px a la
//      vista, 44 al tocar, «$1.74M · 0-90 d» en una línea, +120 d en rojo, y
//      tocarlo FILTRA como siempre (llama al mismo `setRiskFilter`).
//   3. 🔴 Todo detrás de `BARRA_CELULAR_2026_10`: apagado, cada pantalla queda
//      letra por letra como estaba (la rama vieja sigue en el código).
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CLASE_LINEA_TOTAL,
  CLASE_TOTAL_CELULAR,
  SegmentadoCelular,
} from "@/components/celular/CabeceraCompacta";
import { subtituloCompacto } from "@/lib/cxc/lista-celular";

const SRC = join(__dirname, "../..");
const leer = (r: string) => readFileSync(join(SRC, r), "utf8");

afterEach(cleanup);

describe("el total y su línea", () => {
  it("36 px, a la izquierda, y la línea gris en UN renglón", () => {
    expect(CLASE_TOTAL_CELULAR).toContain("text-[36px]");
    expect(CLASE_TOTAL_CELULAR).not.toMatch(/text-center/);
    expect(CLASE_LINEA_TOTAL).toContain("truncate");
    expect(CLASE_LINEA_TOTAL).toContain("text-[13px]");
  });

  it("la línea corta de CxC: «N clientes · por saldo», con empresa o con el tramo", () => {
    expect(subtituloCompacto({ cuantos: 100, risk: "all", unaEmpresa: null })).toBe("100 clientes · por saldo");
    expect(subtituloCompacto({ cuantos: 1, risk: "all", unaEmpresa: "Vistana" })).toBe("1 cliente · Vistana · por saldo");
    expect(subtituloCompacto({ cuantos: 78, risk: "overdue", unaEmpresa: null })).toBe("78 clientes con +120 días");
  });
});

describe("el control segmentado delgado", () => {
  const opciones = [
    { clave: "current" as const, rotulo: "$1.74M · 0-90 d" },
    { clave: "watch" as const, rotulo: "$420K · 91-120 d" },
    { clave: "overdue" as const, rotulo: "$1.95M · +120 d", rojo: true },
  ];

  it("36 px a la vista y 44 al tocar; una línea por tramo", () => {
    const { container } = render(<SegmentadoCelular etiqueta="Tramos" activa={null} onElegir={() => {}} opciones={opciones} />);
    const grupo = container.querySelector("[data-segmentado-celular]")!;
    expect(grupo.className).toContain("h-9");
    for (const b of Array.from(grupo.querySelectorAll("button"))) {
      expect(b.className).toContain("before:-inset-y-1.5");
      expect(b.className).toContain("whitespace-nowrap");
    }
  });

  it("+120 d en rojo, prendido o no; tocar llama a quien filtra", () => {
    const onElegir = vi.fn();
    render(<SegmentadoCelular etiqueta="Tramos" activa="overdue" onElegir={onElegir} opciones={opciones} />);
    const rojo = screen.getByRole("button", { name: "$1.95M · +120 d" });
    expect(rojo.className).toContain("text-[#A32D2D]");
    expect(rojo.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "$420K · 91-120 d" }));
    expect(onElegir).toHaveBeenCalledWith("watch");
  });
});

describe("las tres pantallas usan la cabecera compacta, detrás del interruptor", () => {
  it("Cuentas por cobrar: tres renglones; Boston baja al «···»; buscar tras la 🔍", () => {
    const s = leer("app/cxc/components/PanelCxcCelular.tsx");
    expect(s).toMatch(/const compacta = usaBarraCelular\(true\)/);
    expect(s).toMatch(/<SegmentadoCelular[\s\S]*?rojo: k === "overdue"[\s\S]*?\$\{chipCorto\(k\)\}/);
    expect(s).toMatch(/onElegir=\{\(k\) => setRiskFilter\(k\)\}/);
    expect(s).toMatch(/onBoston=\{compacta \? onBoston : null\}/);
    expect(s).toMatch(/\(!compacta \|\| buscando \|\| search !== ""\)/);
    // La rama de siempre sigue ahí, intacta.
    expect(s).toContain('text-[46px] font-light');
  });

  it("Reclamos: título + 🔍, total de 36 px y «N reclamos por cobrar · …»", () => {
    const s = leer("app/reclamos/components/celular/PortadaCelular.tsx");
    expect(s).toMatch(/const compacta = usaBarraCelular\(true\)/);
    expect(s).toContain("CLASE_TOTAL_CELULAR");
    expect(s).toContain("reclamos\"} por cobrar");
    expect(s).toContain('text-[34px] font-light');
  });

  it("Marketing: título y número compactos, y los períodos en segmentado delgado", () => {
    const piezas = leer("app/marketing/components/celular/PiezasCelular.tsx");
    expect(piezas).toMatch(/const COMPACTA = BARRA_CELULAR_2026_10/);
    expect(piezas).toContain("CLASE_TOTAL_CELULAR");
    const chips = leer("app/marketing/components/celular/ChipsDePeriodoCelular.tsx");
    expect(chips).toMatch(/if \(BARRA_CELULAR_2026_10\)[\s\S]*?h-9[\s\S]*?before:-inset-y-1\.5/);
  });
});
