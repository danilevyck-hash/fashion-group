// I11 — exports Excel de Finanzas (Caja + Préstamos) migrados al estilo de la casa.
// Construye los workbooks con fixtures mínimos, los escribe a buffer y los lee
// de vuelta para verificar estructura (hojas, título, headers, moneda numérica).

import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { buildCajaWorkbook } from "@/lib/exports/caja-excel";
import { buildPrestamosWorkbook } from "@/lib/exports/prestamos-excel";

function roundTrip(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  return XLSX.read(buf, { type: "buffer" });
}

describe("buildCajaWorkbook", () => {
  const periodo = { numero: 7, fecha_apertura: "2026-06-01", fondo_inicial: 200 };
  const gastos = [
    { fecha: "2026-06-02", descripcion: "Taxi a banco", proveedor: "Taxi", categoria: "Transporte", nro_factura: "F-001", responsable: "Ana", subtotal: 10, itbms: 0.7, total: 10.7 },
    { fecha: "2026-06-03", descripcion: "Café reunión", proveedor: "Cafetería", categoria: "Varios", nro_factura: null, responsable: "Ana", subtotal: 5, itbms: 0.35, total: 5.35 },
  ];

  it("genera las 2 hojas con título, headers y moneda numérica", () => {
    const wb = roundTrip(buildCajaWorkbook(periodo, gastos));

    expect(wb.SheetNames).toEqual(["Gastos", "Por Categoría"]);

    const ws = wb.Sheets["Gastos"];
    expect(ws["A1"].v).toBe("FASHION GROUP — CAJA MENUDA");
    expect(ws["A2"].v).toContain("Período N° 7");
    expect(ws["A2"].v).toContain("Responsable: Ana");

    // Headers en fila 4 (título + subtítulo + separador)
    expect(ws["A4"].v).toBe("Fecha");
    expect(ws["B4"].v).toBe("Descripción");
    expect(ws["H4"].v).toBe("Total");

    // Primera fila de datos: fecha dd/mm/yyyy y moneda como número real
    expect(ws["A5"].v).toBe("02/06/2026");
    expect(ws["F5"].t).toBe("n");
    expect(ws["F5"].v).toBe(10);
    expect(ws["H5"].t).toBe("n");
    expect(ws["H5"].v).toBeCloseTo(10.7);

    const ws2 = wb.Sheets["Por Categoría"];
    expect(ws2["A1"].v).toBe("Resumen por Categoría");
    expect(ws2["A4"].v).toBe("Categoría");
    expect(ws2["B4"].v).toBe("Total");
    expect(ws2["C4"].v).toBe("% del total");
    // Categoría top (mayor gasto) primero, con total numérico
    expect(ws2["A5"].v).toBe("Transporte");
    expect(ws2["B5"].t).toBe("n");
    expect(ws2["B5"].v).toBeCloseTo(10.7);
  });

  it("incluye totales y saldo disponible (fondo - gastado)", () => {
    const wb = roundTrip(buildCajaWorkbook(periodo, gastos));
    const ws = wb.Sheets["Gastos"];

    // Fila de totales: datos terminan en fila 6, espaciador 7, totales fila 8
    expect(ws["E8"].v).toBe("TOTALES");
    expect(ws["H8"].t).toBe("n");
    expect(ws["H8"].v).toBeCloseTo(16.05);

    // Bloque de resumen: saldo = 200 - 16.05
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    const lastRow = range.e.r + 1; // 1-based
    expect(ws[`F${lastRow}`].v).toBe("Saldo disponible:");
    expect(ws[`H${lastRow}`].t).toBe("n");
    expect(ws[`H${lastRow}`].v).toBeCloseTo(183.95);
  });
});

describe("buildPrestamosWorkbook", () => {
  const empleados = [
    {
      id: "e1",
      nombre: "Juan Pérez",
      empresa: "Fashion Wear",
      deduccion_quincenal: 25,
      activo: true,
      prestamos_movimientos: [
        { id: "m1", fecha: "2026-05-01", concepto: "Préstamo", monto: 500, notas: "Inicial", estado: "aprobado", created_at: "2026-05-01T10:00:00Z" },
        { id: "m2", fecha: "2026-05-15", concepto: "Pago", monto: 100, notas: null, estado: "aprobado", created_at: "2026-05-15T10:00:00Z" },
        { id: "m3", fecha: "2026-06-01", concepto: "Pago", monto: 50, notas: null, estado: "pendiente_aprobacion", created_at: "2026-06-01T10:00:00Z" },
      ],
    },
  ];

  it("genera Resumen y Movimientos con título, headers y moneda numérica", () => {
    const wb = roundTrip(buildPrestamosWorkbook(empleados, null));

    expect(wb.SheetNames).toEqual(["Resumen", "Movimientos"]);

    const ws = wb.Sheets["Resumen"];
    expect(ws["A1"].v).toBe("FASHION GROUP");
    expect(ws["A2"].v).toBe("Historial de Préstamos — Todas las empresas");
    expect(ws["A4"].v).toBe("Empleado");
    expect(ws["G4"].v).toBe("% Progreso");

    // Fila de datos: solo movimientos aprobados cuentan (500 prestado, 100 pagado)
    expect(ws["A5"].v).toBe("Juan Pérez");
    expect(ws["D5"].t).toBe("n");
    expect(ws["D5"].v).toBe(500);
    expect(ws["E5"].v).toBe(100);
    expect(ws["F5"].v).toBe(400);
    expect(ws["G5"].v).toBeCloseTo(0.2); // 20% progreso

    // Totales (espaciador fila 6, totales fila 7)
    expect(ws["A7"].v).toBe("TOTALES");
    expect(ws["D7"].t).toBe("n");
    expect(ws["D7"].v).toBe(500);
    expect(ws["F7"].v).toBe(400);

    const wsM = wb.Sheets["Movimientos"];
    expect(wsM["A1"].v).toBe("FASHION GROUP");
    expect(wsM["A2"].v).toBe("Movimientos — Todas las empresas");
    expect(wsM["A4"].v).toBe("Empleado");
    expect(wsM["E4"].v).toBe("Monto");
    // Movimientos orden fecha DESC → el pendiente de junio primero
    expect(wsM["D5"].v).toBe("Pago");
    expect(wsM["G5"].v).toBe("Pendiente de aprobación");
    expect(wsM["E5"].t).toBe("n");
    expect(wsM["E5"].v).toBe(50);
  });

  it("respeta el filtro de empresa en el subtítulo", () => {
    const wb = roundTrip(buildPrestamosWorkbook(empleados, "Fashion Wear"));
    expect(wb.Sheets["Resumen"]["A2"].v).toBe("Historial de Préstamos — Fashion Wear");
    expect(wb.Sheets["Movimientos"]["A2"].v).toBe("Movimientos — Fashion Wear");
  });
});
