/**
 * 🩸 Resumen › Mes×año — la celda del MES EN CURSO compara contra los MISMOS
 * DÍAS del año pasado, y lo dice.
 *
 * El servidor manda `prev: null` para esa celda a propósito, pero hasta el
 * 3-sep-2026 la pantalla lo ignoraba y leía `byMonth[m][y − 1]`: el mes ENTERO
 * del año pasado. Medido contra producción: Boston sep decía −93,5% cuando iba
 * +2,2% ($5.864,05 contra $5.739,70 de los mismos tres días de 2025).
 *
 * Se PINTA el panel con esos números: cualquier forma de volver al mes entero
 * ($89.534,20) da −93,5%, que es lo que este test prohíbe.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmpresaMesAnioPanel, type EmpresaMesAnio, type CurrentYtdSamePeriod } from "@/components/ventas/ResumenMesAnio";

afterEach(cleanup);

const v = (ventas: number, utilidad = ventas * 0.3) => ({ ventas, utilidad, costo: ventas - utilidad });

const boston: EmpresaMesAnio = {
  id: "boston",
  nombre: "Confecciones Boston",
  byMonth: {
    8: { 2025: { ...v(80000), prev: null }, 2026: { ...v(88000), prev: v(80000) } },
    9: { 2025: { ...v(89534.2), prev: null }, 2026: { ...v(5864.05), prev: null } },
  },
  totalByYear: { 2025: v(169534.2), 2026: v(93864.05) },
  totalByMonth: {},
  grandTotal: v(263398.25),
};

const currentYtd: CurrentYtdSamePeriod = {
  year: 2026,
  periodLabel: "ene–sep",
  ventas: 93864.05, ventasPrev: 85739.7,
  utilidad: 0, utilidadPrev: 0,
  margen: 0.3, margenPrev: 0.3,
  mesEnCurso: { mes: 9, prev: v(5739.7), label: "vs 1–3 sep 2025" },
};

function pintar(ytd: CurrentYtdSamePeriod | null) {
  return render(
    <EmpresaMesAnioPanel
      open
      onClose={() => {}}
      nombre="Confecciones Boston"
      empresa={boston}
      years={[2025, 2026]}
      currentYear={2026}
      error={null}
      viewMode="ventas"
      onViewMode={() => {}}
      currentYtd={ytd}
    />,
  );
}

describe("la celda de septiembre 2026", () => {
  it("dice +2.2% contra 1–3 sep 2025, no −93.5% contra septiembre entero", () => {
    pintar(currentYtd);
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("vs 1–3 sep 2025");
    // La celda: «6k · +2% · vs 1–3 sep 2025» (el Δ se redondea a entero).
    expect(texto).toMatch(/6k\+2%vs 1–3 sep 2025/);
    expect(texto).not.toMatch(/9[34]%/);
  });

  it("🔴 sin el dato de los mismos días la celda queda SIN Δ — nunca el mes entero", () => {
    pintar({ ...currentYtd, mesEnCurso: null });
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/9[34]%/);
    expect(texto).not.toContain("vs 1–3 sep 2025");
    // La celda queda con el número pelado: «6k» seguido de la celda vacía.
    expect(texto).toMatch(/6k———/);
  });

  it("un mes cerrado sigue con el previo del servidor: agosto +10%", () => {
    pintar(currentYtd);
    expect(screen.getAllByText(/\+10%/).length).toBeGreaterThan(0);
  });
});
