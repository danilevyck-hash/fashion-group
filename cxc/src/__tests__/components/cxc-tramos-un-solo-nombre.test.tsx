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
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔄 ESTE CANDADO CAMBIÓ DE DIRECCIÓN EL 5-sep-2026, y no se borró.
//
// Lo que exigía era: «el ESCRITORIO ya no rotula solo con el rango» — o sea,
// que las píldoras de `KpiCards` dijeran el nombre COMPLETO («Por vencer
// 0-90d»). Con el rediseño de Cuentas por Cobrar, esas píldoras redondas se
// convirtieron en una TIRA pegada a la tabla, en su misma grilla de 12
// columnas: cada total quedó parado sobre su columna, y ahí el ancho es de
// 2/12. El nombre completo obligaba a envolver o a apretar el monto, que es lo
// que se viene a leer.
//
// Así que en el escritorio el chip volvió a decir SOLO el rango —pero por una
// razón distinta a la de antes: ahora la columna de abajo dice lo mismo, a dos
// centímetros—. **Lo que este candado defendía sigue defendido**: que no haya
// DOS listas de nombres. El nombre largo no desapareció; vive en el `title` del
// chip, en el celular, en el papel y en el correo, y los cuatro salen de
// `tramoLabel()`, la misma fuente única de siempre.
//
// La parte del CELULAR y la del PAPEL no cambiaron ni una letra.
// El caso del escritorio se mudó a `cxc-tira-totales.test.tsx`, que exige las
// dos mitades: rango en el chip Y nombre completo en el `title`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, cleanup } from "@testing-library/react";
import TiraTotales from "@/app/cxc/components/TiraTotales";
import { AGING, AGING_ORDER, tramoLabel } from "@/lib/cxc-aging";
import type { ConsolidatedClient } from "@/lib/types";

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const leer = (rel: string) => sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));

// Dos clientes con saldo en los tres tramos: si las cifras cambiaran, se ve.
const CLIENTES = [
  { nombre_normalized: "UNO", total: 300, current: 100, watch: 100, overdue: 100, companies: {} },
  { nombre_normalized: "DOS", total: 300, current: 200, watch: 50, overdue: 50, companies: {} },
] as unknown as ConsolidatedClient[];

const pintarTira = () =>
  render(
    <TiraTotales
      roleClients={CLIENTES}
      riskFilter="all"
      onRiskFilterChange={vi.fn()}
      sinPagar={null}
      sinPagarActivo={false}
      onToggleSinPagar={vi.fn()}
    />,
  );

describe("los tres tramos se llaman igual en todas partes", () => {
  it("`tramoLabel` dice el nombre Y el rango, para los tres", () => {
    expect(tramoLabel("current")).toBe("Por vencer 0-90d");
    expect(tramoLabel("watch")).toBe("Vencido reciente 91-120d");
    expect(tramoLabel("overdue")).toBe("Vencido crítico 121d+");
  });

  it("🔄 el ESCRITORIO dice el rango en el chip y el nombre COMPLETO en su `title` (5-sep-2026)", () => {
    pintarTira();
    for (const k of AGING_ORDER) {
      const chip = screen.getByText(AGING[k].colLabel).closest("button")!;
      expect(chip.getAttribute("title"), `el ${k} perdió su nombre largo`).toContain(tramoLabel(k));
    }
    cleanup();
  });

  it("🔴 y NO lleva una segunda lista de nombres escrita a mano", () => {
    // Esto es lo que el candado defiende desde el 2-sep-2026 y sigue en pie:
    // que el nombre de un tramo se escriba en UN solo lugar.
    const src = leer("src/app/cxc/components/TiraTotales.tsx");
    for (const k of AGING_ORDER) {
      expect(src, `"${AGING[k].label}" volvió escrito a mano en el escritorio`)
        .not.toContain(`"${AGING[k].label}"`);
    }
    expect(src).toContain("tramoLabel");
    expect(src).toContain('from "@/lib/cxc-aging"');
  });

  it("🔴 el CELULAR ya no lleva su propia lista de nombres", () => {
    const src = leer("src/app/cxc/components/PanelCxcMobile.tsx");
    // Cada nombre escrito a mano en ese archivo es una copia que puede
    // separarse de la del escritorio y del papel — que es lo que pasó.
    for (const k of AGING_ORDER) {
      expect(src, `"${AGING[k].label}" volvió escrito a mano en el celular`)
        .not.toContain(`"${AGING[k].label}"`);
    }
    expect(src).toContain("tramoLabel");
    expect(src).toContain('from "@/lib/cxc-aging"');
  });

  it("el celular dibuja el rango en el chip y el nombre COMPLETO en su `title`", () => {
    // 🔄 5-sep-2026: los tres tramos se mudaron ADENTRO de la tarjeta negra del
    // total (eran tres tarjetas grandes debajo). Ahí el ancho es un tercio de la
    // pantalla, así que el chip lleva el rango y el nombre largo va en el
    // `title` — la MISMA solución del escritorio, y sale de la misma función.
    // El nombre completo se sigue dibujando en el desglose por tramo de cada
    // cliente (`BucketChip`), que es donde entra.
    const src = leer("src/app/cxc/components/PanelCxcMobile.tsx");
    expect(src).toContain("{AGING[key].colLabel}");
    expect(src).toContain("title={tramoLabel(key)}");
    expect(src).toContain("{AGING[variant].label}");
    expect(src).toContain("title={tramoLabel(variant)}");
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
    pintarTira();
    const texto = document.body.textContent ?? "";
    // Total 600 · por vencer 300 · vencido reciente 150 · crítico 150.
    for (const monto of ["600.00", "300.00", "150.00"]) {
      expect(texto, `falta $${monto}`).toContain(monto);
    }
    cleanup();
  });

  it("los conteos de clientes por tramo no cambiaron", () => {
    const { container } = pintarTira();
    // 4 botones: los tres tramos + Total. Los conteos son los de siempre —
    // "Por vencer" cuenta los clientes SIN nada vencido, y los dos del fixture
    // tienen saldo en los tres tramos, así que ahí van 0. Ese matiz es
    // PRE-EXISTENTE y este cambio no lo toca: sale acá para que se vea que no
    // se movió.
    //
    // 🔄 5-sep-2026: el orden en la tira es tramos primero y Total al final
    // (parado sobre SU columna), donde antes el Total iba primero.
    const botones = [...container.querySelectorAll("button")];
    expect(botones.length).toBe(4);
    // El conteo es el ÚLTIMO renglón del chip (rango · monto · conteo).
    expect(botones.slice(0, 3).map(b => b.lastElementChild?.textContent))
      .toEqual(["0", "2", "2"]);
    expect(botones[3].textContent).toContain("Total · 2");
    cleanup();
  });

  it("tocar una píldora sigue avisando con su clave, no con su rótulo", () => {
    const onChange = vi.fn();
    render(
      <TiraTotales
        roleClients={CLIENTES}
        riskFilter="all"
        onRiskFilterChange={onChange}
        sinPagar={null}
        sinPagarActivo={false}
        onToggleSinPagar={vi.fn()}
      />,
    );
    screen.getByText(AGING.overdue.colLabel).closest("button")!.click();
    expect(onChange).toHaveBeenCalledWith("overdue");
    cleanup();
  });
});
