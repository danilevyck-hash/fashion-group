// ─────────────────────────────────────────────────────────────────────────────
// EL MISMO BOTÓN, EL MISMO NOMBRE — en la computadora, en el celular y en el
// papel.
//
// 🩸 EL BUG. Los cuatro botones de tramo del CXC tenían DOS nombres distintos:
//
//     escritorio (KpiCards)      "0-90d"      "91-120d"          "121d+"
//     celular    (PanelCxcMobile) "Por vencer" "Vencido reciente" "Vencido crítico"
//     papel      (pdf-cxc)        "Por vencer 0-90d"  …           (el único completo)
//
// Es el MISMO botón, que filtra la MISMA lista, con dos nombres: quien aprende
// a cobrar desde el celular no lo reconoce en la computadora, y al revés. Y el
// celular llevaba su propia lista de nombres COPIADA adentro de `AGING_THEME`,
// o sea dos listas que nadie podía mantener iguales.
//
// 🔑 EL ARREGLO NO ES "ponerle el mismo texto a las dos": es que no haya dos
// textos. `tramoLabel()` vive en `cxc-aging` —la fuente única que ya definía
// los tramos— y lo llaman las tres superficies. El papel ya decía los dos
// desde jul-2026: se generalizó ese criterio en vez de inventar un cuarto.
//
// ⚠️ ESTO ES VOCABULARIO: ni un corte ni un número se movió. Los tramos siguen
// siendo 0-90 / 91-120 / 121+ y las cifras salen de las mismas sumas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, cleanup } from "@testing-library/react";
import KpiCards from "@/app/admin/components/KpiCards";
import { AGING, AGING_ORDER, tramoLabel } from "@/lib/cxc-aging";
import type { ConsolidatedClient } from "@/lib/types";

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const leer = (rel: string) => sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));

// Dos clientes con saldo en los tres tramos: si las cifras cambiaran, se ve.
const CLIENTES = [
  { nombre_normalized: "UNO", total: 300, current: 100, watch: 100, overdue: 100 },
  { nombre_normalized: "DOS", total: 300, current: 200, watch: 50, overdue: 50 },
] as unknown as ConsolidatedClient[];

describe("los tres tramos se llaman igual en todas partes", () => {
  it("`tramoLabel` dice el nombre Y el rango, para los tres", () => {
    expect(tramoLabel("current")).toBe("Por vencer 0-90d");
    expect(tramoLabel("watch")).toBe("Vencido reciente 91-120d");
    expect(tramoLabel("overdue")).toBe("Vencido crítico 121d+");
  });

  it("🔴 el ESCRITORIO ya no rotula solo con el rango", () => {
    render(<KpiCards roleClients={CLIENTES} riskFilter="all" onRiskFilterChange={vi.fn()} />);
    for (const k of AGING_ORDER) {
      expect(screen.getByText(tramoLabel(k)), `falta "${tramoLabel(k)}"`).toBeTruthy();
    }
    // El rango pelado, que era todo lo que decía antes, ya no existe solo.
    expect(screen.queryByText("0-90d")).toBeNull();
    expect(screen.queryByText("121d+")).toBeNull();
    cleanup();
  });

  it("🔴 el CELULAR ya no lleva su propia lista de nombres", () => {
    const src = leer("src/app/admin/components/PanelCxcMobile.tsx");
    // Cada nombre escrito a mano en ese archivo es una copia que puede
    // separarse de la del escritorio y del papel — que es lo que pasó.
    for (const k of AGING_ORDER) {
      expect(src, `"${AGING[k].label}" volvió escrito a mano en el celular`)
        .not.toContain(`"${AGING[k].label}"`);
    }
    expect(src).toContain("tramoLabel");
    expect(src).toContain('from "@/lib/cxc-aging"');
  });

  it("el celular dibuja el nombre Y el rango del tramo", () => {
    const src = leer("src/app/admin/components/PanelCxcMobile.tsx");
    // Los dos, en el chip de filtro: `AGING[key].label` arriba y
    // `AGING[key].colLabel` debajo (a 390 px no entran en una línea).
    expect(src).toContain("{AGING[key].label}");
    expect(src).toContain("{AGING[key].colLabel}");
    expect(src).toContain("title={tramoLabel(key)}");
  });

  it("el PAPEL usa la misma función, no una copia propia", () => {
    const src = leer("src/lib/pdf-cxc.ts");
    expect(src).toContain("tramoLabel");
    expect(src).not.toMatch(/const tramo = \(k: AgingKey\) =>/);
  });
});

describe("⚠️ NINGÚN corte ni número se movió", () => {
  it("los tres tramos siguen siendo 0-90 / 91-120 / 121+", () => {
    expect(AGING.current.colLabel).toBe("0-90d");
    expect(AGING.watch.colLabel).toBe("91-120d");
    expect(AGING.overdue.colLabel).toBe("121d+");
  });

  it("las píldoras del escritorio siguen sumando lo mismo, tramo por tramo", () => {
    render(<KpiCards roleClients={CLIENTES} riskFilter="all" onRiskFilterChange={vi.fn()} />);
    const texto = document.body.textContent ?? "";
    // Total 600 · por vencer 300 · vencido reciente 150 · crítico 150.
    for (const monto of ["600.00", "300.00", "150.00"]) {
      expect(texto, `falta $${monto}`).toContain(monto);
    }
    cleanup();
  });

  it("los conteos de clientes por tramo no cambiaron", () => {
    const { container } = render(
      <KpiCards roleClients={CLIENTES} riskFilter="all" onRiskFilterChange={vi.fn()} />,
    );
    // 4 píldoras: Total + los tres tramos. Los conteos son los de siempre —
    // "Por vencer" cuenta los clientes SIN nada vencido, y los dos del fixture
    // tienen saldo en los tres tramos, así que ahí van 0. Ese matiz es
    // PRE-EXISTENTE y este cambio no lo toca: sale acá para que se vea que no
    // se movió.
    const botones = [...container.querySelectorAll("button")];
    expect(botones.length).toBe(4);
    expect(botones.map(b => (b.textContent ?? "").match(/· (\d+)$/)?.[1]))
      .toEqual(["2", "0", "2", "2"]);
    cleanup();
  });

  it("tocar una píldora sigue avisando con su clave, no con su rótulo", () => {
    const onChange = vi.fn();
    render(<KpiCards roleClients={CLIENTES} riskFilter="all" onRiskFilterChange={onChange} />);
    screen.getByText(tramoLabel("overdue")).closest("button")!.click();
    expect(onChange).toHaveBeenCalledWith("overdue");
    cleanup();
  });
});
