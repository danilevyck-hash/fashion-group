// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Gastos › lista (16-nov-2026, error de los videos #34).
//
// 🩸 Con el registro PAUSADO (7-oct-2026, docs/gastos-pausado.md) cada empresa
// decía «Sin movimientos» en el lugar del monto —se leía «no gastó nada»— y la
// fila de Boston repetía «Carga manual» (a la derecha y en la frase) con una
// letra más grande y oscura que la de las demás. Ahora: sin número va «—», la
// pausa se dice junto al mes (n.º 94) y la línea de Boston usa el MISMO estilo
// gris chico que la de las demás.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ResumenEgresos from "@/app/gastos-contabilidad/components/ResumenEgresos";
import type { EmpresaEgresosResumen } from "@/app/gastos-contabilidad/components/tipos";
import type { ResumenEgresosMes } from "@/lib/egresos/reglas";

afterEach(cleanup);

const vacio = (estado: ResumenEgresosMes["estado"]): ResumenEgresosMes => ({
  mes: "2026-11", estado, totalSalidaCent: 0, totalGastoCent: 0, totalNoGastoCent: 0,
  cuentasGasto: [], cuentasNoGasto: [], renglones: 0, documentos: 0,
});

const EMPRESAS: EmpresaEgresosResumen[] = [
  { empresaKey: "vistana", nombre: "Vistana International", resumen: vacio("sin_movimientos"), ultimoMesConMovimientos: "2026-07", alDia: { estado: "al_dia", mes: "2026-07" }, descargaAutomatica: true },
  { empresaKey: "fashion_wear", nombre: "Fashion Wear", resumen: vacio("sin_datos"), ultimoMesConMovimientos: "2026-05", alDia: { estado: "al_dia", mes: "2026-05" }, descargaAutomatica: true },
  { empresaKey: "confecciones_boston", nombre: "Confecciones Boston", resumen: vacio("sin_datos"), ultimoMesConMovimientos: "2026-03", alDia: { estado: "al_dia", mes: "2026-03" }, descargaAutomatica: false },
];

function filas() {
  const { container } = render(<ResumenEgresos empresas={EMPRESAS} onAbrir={() => {}} apple />);
  return [...container.querySelectorAll('[data-lista="gastos-empresas-apple"] > li')].slice(1);
}

describe("#34 Gastos › lista con el registro pausado", () => {
  it("ninguna empresa dice «Sin movimientos» ni «Sin datos»: sin número va «—»", () => {
    for (const li of filas()) {
      expect(li.textContent).not.toMatch(/Sin movimientos|Sin datos/);
      const monto = li.querySelector("[data-monto]")!;
      expect(monto.textContent).toBe("—");
    }
  });

  it("Boston dice «Carga manual» una sola vez y con el mismo estilo que las demás", () => {
    const [vistana, , boston] = filas();
    expect(boston.textContent!.match(/Carga manual/g)).toHaveLength(1);
    const claseLinea = (li: Element) => li.querySelector("[data-linea-gris]")!.className;
    expect(claseLinea(boston)).toBe(claseLinea(vistana));
  });
});
