/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA LISTA DE PERÍODOS Y EL PAPEL QUE SE FIRMA (7-sep-2026).
 *
 *  · 🩸 el período Nº2 se veía EN ROJO con «−$0.00» estando cuadrado al
 *    centavo: la suma de sus 26 recibos daba 200.00000000000003;
 *  · 🔴 un período CON GASTOS no ofrece «Eliminar» (Daniel: «no es normal»);
 *  · 🔴 el papel dice «A reponer» y el N° de factura de cada línea — es el que
 *    lleva «Preparado por / Aprobado por», el que se firma;
 *  · 🔴 el papel nombra a UNA responsable, la del período, leída por su código
 *    (antes las listaba a las tres: «Angela Garcia», «Angela garcia» y
 *    «Angela garciia»).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import PeriodoList from "@/app/caja/components/PeriodoList";
import PrintView from "@/app/caja/components/PrintView";
import type { CajaGasto, CajaPeriodo } from "@/app/caja/components/types";

afterEach(() => cleanup());

// Los 26 recibos reales del período Nº2: $200.00 clavados.
const TOTALES_P2 = [6, 30, 20, 5, 5, 6, 4, 5, 6.2, 5, 1, 12.3, 10, 10.59, 10.59, 12.4,
  11.02, 5, 2.78, 5, 5, 5, 5, 7.49, 2.5, 2.13];

const P2: CajaPeriodo = {
  id: "p-2",
  numero: 2,
  fecha_apertura: "2026-07-08",
  fecha_cierre: "2026-09-02",
  fondo_inicial: 200,
  estado: "cerrado",
  // Así llega del servidor, ya redondeado.
  total_gastado: 200,
  recibos: 26,
};

function montarLista(periodos: CajaPeriodo[], role = "admin") {
  const onDeletePeriodo = vi.fn();
  render(
    <PeriodoList
      periodos={periodos}
      loading={false}
      error={null}
      hasOpenPeriod={false}
      role={role}
      onCreatePeriodo={vi.fn()}
      onLoadDetail={vi.fn()}
      onPrintPeriodo={vi.fn()}
      onClosePeriodo={vi.fn()}
      onDeletePeriodo={onDeletePeriodo}
    />,
  );
  return { onDeletePeriodo };
}

describe("🩸 EL SALDO EN ROJO POR NADA — la lista", () => {
  it("el período Nº2 muestra $0.00 y NO en rojo, con la caja cuadrada al centavo", () => {
    // El saldo llega crudo, con el residuo del punto flotante que producía el
    // rojo. La lista lo redondea antes de decidir el color.
    const crudo = TOTALES_P2.reduce((s, t) => s + t, 0);
    expect(crudo).toBe(200.00000000000003);
    montarLista([{ ...P2, total_gastado: crudo }]);

    const celdas = document.querySelectorAll('[data-periodo-campo="saldo"]');
    expect(celdas.length).toBeGreaterThan(0);
    for (const celda of Array.from(celdas)) {
      expect(celda.textContent).toContain("$0.00");
      expect(celda.textContent).not.toContain("-$0.00");
      expect(celda.textContent).not.toContain("−$0.00");
      // El pill rojo trae el color de peligro; con la caja cuadrada no va.
      expect(celda.innerHTML).not.toContain("caja-danger-soft");
    }
  });

  it("🔴 CONTROL: un saldo negativo DE VERDAD sí se pinta en rojo", () => {
    montarLista([{ ...P2, total_gastado: 236.5 }]);
    const celda = document.querySelector('[data-periodo-campo="saldo"]')!;
    // El menos TIPOGRÁFICO delante del peso, como manda el diccionario de la
    // casa: `−$36.50`, nunca `$-36.50`.
    expect(celda.textContent).toContain("\u2212$36.50");
    expect(celda.textContent).not.toContain("$-36.50");
    expect(celda.innerHTML).toContain("caja-danger-soft");
  });
});

describe("🔴 UN PERÍODO CON GASTOS NO OFRECE «ELIMINAR»", () => {
  it("con 26 recibos, el menú no tiene «Eliminar» en ninguna de las dos vistas", () => {
    montarLista([{ ...P2, recibos: 26 }]);
    for (const menu of Array.from(document.querySelectorAll("button[aria-haspopup]"))) {
      fireEvent.click(menu);
    }
    expect(within(document.body).queryByText("Eliminar")).toBeNull();
  });

  it("🔴 CONTROL: un período VACÍO sí lo ofrece", () => {
    montarLista([{ ...P2, recibos: 0, total_gastado: 0 }]);
    for (const menu of Array.from(document.querySelectorAll("button[aria-haspopup]"))) {
      fireEvent.click(menu);
    }
    expect(within(document.body).getAllByText("Eliminar").length).toBeGreaterThan(0);
  });

  it("🔴 CONTROL: quien no es admin no lo ve nunca, ni con el período vacío", () => {
    montarLista([{ ...P2, recibos: 0, total_gastado: 0 }], "secretaria");
    for (const menu of Array.from(document.querySelectorAll("button[aria-haspopup]"))) {
      fireEvent.click(menu);
    }
    expect(within(document.body).queryByText("Eliminar")).toBeNull();
  });
});

describe("🔴 EL PAPEL QUE SE FIRMA", () => {
  const gastos: CajaGasto[] = [
    { id: "g1", periodo_id: "p-3", fecha: "2026-09-03", descripcion: "Comida", proveedor: "Super 99",
      nro_factura: "196854200", categoria: "Alimentación", subtotal: 10.59, itbms: 0, total: 10.59 },
    { id: "g2", periodo_id: "p-3", fecha: "2026-09-03", descripcion: "Comida", proveedor: "La Parrillada",
      nro_factura: "", categoria: "Alimentación", subtotal: 5, itbms: 0, total: 5 },
  ];
  const periodo: CajaPeriodo = {
    id: "p-3", numero: 3, fecha_apertura: "2026-09-02", fecha_cierre: null,
    fondo_inicial: 200, estado: "abierto", total_gastado: 15.59,
    responsable_empleado_codigo: "7", responsable_nombre: "Angela Garcia",
    caja_gastos: gastos,
  };

  it("dice «A reponer» con lo gastado, además del saldo", () => {
    render(<PrintView current={periodo} onBack={vi.fn()} />);
    const doc = document.getElementById("print-document")!;
    expect(doc.textContent).toContain("A reponer");
    expect(doc.textContent).toContain("$15.59");
    expect(doc.textContent).toContain("Saldo Final");
    expect(doc.textContent).toContain("$184.41");
  });

  it("lleva el N° de factura en cada línea, y «—» donde no hay", () => {
    render(<PrintView current={periodo} onBack={vi.fn()} />);
    const doc = document.getElementById("print-document")!;
    expect(within(doc).getByText("N° Factura")).toBeTruthy();
    expect(within(doc).getByText("196854200")).toBeTruthy();
    // El recibo sin factura no inventa un número.
    expect(doc.querySelectorAll("td")).toBeTruthy();
    expect(doc.textContent).toContain("—");
  });

  it("🔴 nombra a UNA responsable, la del período, leída por su código", () => {
    render(<PrintView current={periodo} onBack={vi.fn()} />);
    const doc = document.getElementById("print-document")!;
    expect(doc.textContent).toContain("Responsable del período: Angela Garcia");
    // 🩸 Antes se derivaba de los gastos y salían las tres escrituras.
    expect(doc.textContent).not.toContain("Angela garcia");
    expect(doc.textContent).not.toContain("Angela garciia");
  });

  it("🔴 CONTROL: sin responsable puesta, el papel dice «—» y no inventa a nadie", () => {
    render(<PrintView current={{ ...periodo, responsable_empleado_codigo: null, responsable_nombre: null }} onBack={vi.fn()} />);
    const doc = document.getElementById("print-document")!;
    expect(doc.textContent).toContain("Responsable del período: —");
    expect(doc.textContent).not.toContain("Angela");
  });

  it("🩸 el papel del período Nº2 cierra en $0.00, no en «−$0.00»", () => {
    const p2ConGastos: CajaPeriodo = {
      ...P2,
      caja_gastos: TOTALES_P2.map((total, i) => ({
        id: `g${i}`, periodo_id: "p-2", fecha: "2026-08-01", descripcion: "Comida",
        proveedor: "Super 99", nro_factura: "", categoria: "Alimentación",
        subtotal: total, itbms: 0, total,
      })),
    };
    render(<PrintView current={p2ConGastos} onBack={vi.fn()} />);
    const doc = document.getElementById("print-document")!;
    expect(doc.textContent).toContain("Saldo Final: $0.00");
    expect(doc.textContent).not.toContain("-$0.00");
    expect(doc.textContent).toContain("A reponer: $200.00");
  });
});
