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

  it("genera las 2 hojas con headers en la fila 1 y moneda numérica", () => {
    const wb = roundTrip(buildCajaWorkbook(periodo, gastos));

    expect(wb.SheetNames).toEqual(["Gastos", "Por Categoría"]);

    const ws = wb.Sheets["Gastos"];
    // Headers en la fila 1: no hay nada arriba de ellos.
    expect(ws["A1"].v).toBe("Fecha");
    expect(ws["B1"].v).toBe("Descripción");
    expect(ws["H1"].v).toBe("Total");

    // Primera fila de datos: fecha dd/mm/yyyy y moneda como número real
    expect(ws["A2"].v).toBe("02/06/2026");
    expect(ws["F2"].t).toBe("n");
    expect(ws["F2"].v).toBe(10);
    expect(ws["H2"].t).toBe("n");
    expect(ws["H2"].v).toBeCloseTo(10.7);

    const ws2 = wb.Sheets["Por Categoría"];
    expect(ws2["A1"].v).toBe("Categoría");
    expect(ws2["B1"].v).toBe("Total");
    expect(ws2["C1"].v).toBe("% del total");
    // Categoría top (mayor gasto) primero, con total numérico
    expect(ws2["A2"].v).toBe("Transporte");
    expect(ws2["B2"].t).toBe("n");
    expect(ws2["B2"].v).toBeCloseTo(10.7);
  });

  it("incluye totales y saldo disponible (fondo - gastado)", () => {
    const wb = roundTrip(buildCajaWorkbook(periodo, gastos));
    const ws = wb.Sheets["Gastos"];

    // Fila de totales: datos terminan en fila 3, espaciador 4, totales fila 5
    expect(ws["E5"].v).toBe("TOTALES");
    expect(ws["H5"].t).toBe("n");
    expect(ws["H5"].v).toBeCloseTo(16.05);

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
      deduccion_dano: 10,
      prestamos_movimientos: [
        { id: "m1", fecha: "2026-05-01", concepto: "Préstamo", monto: 500, notas: "Inicial", estado: "aprobado", created_at: "2026-05-01T10:00:00Z" },
        { id: "m2", fecha: "2026-05-15", concepto: "Pago", monto: 100, notas: null, origen_pago: "Quincena", estado: "aprobado", created_at: "2026-05-15T10:00:00Z" },
        // ⚠️ ESPERANDO APROBACIÓN: no es plata todavía. No cuenta para el saldo
        // Y desde el 5-sep-2026 tampoco sale en la hoja de Movimientos: en un
        // papel sin contexto se leería como si ya se hubiera entregado.
        { id: "m3", fecha: "2026-06-01", concepto: "Préstamo", monto: 50, notas: null, estado: "pendiente_aprobacion", created_at: "2026-06-01T10:00:00Z" },
        // Daño de mercancía: la SEGUNDA cuenta. El total no cambia por partirlo.
        { id: "m4", fecha: "2026-05-20", concepto: "Responsabilidad por daño", monto: 60, notas: "Polo dañado", estado: "aprobado", created_at: "2026-05-20T10:00:00Z" },
      ],
    },
  ];

  it("genera Resumen y Movimientos con headers en la fila 1 y moneda numérica", () => {
    const wb = roundTrip(buildPrestamosWorkbook(empleados));

    expect(wb.SheetNames).toEqual(["Resumen", "Movimientos"]);

    const ws = wb.Sheets["Resumen"];
    expect(ws["A1"].v).toBe("Empleado");
    // 🔴 LAS DOS CUENTAS, cada una con su cuota y su saldo.
    expect(ws["C1"].v).toBe("Cuota préstamo");
    expect(ws["D1"].v).toBe("Cuota daño");
    expect(ws["E1"].v).toBe("Debe de préstamo");
    expect(ws["F1"].v).toBe("Debe de daño");
    expect(ws["J1"].v).toBe("% Progreso");

    // Fila de datos: solo lo APROBADO cuenta (500 + 60 prestado, 100 pagado).
    expect(ws["A2"].v).toBe("Juan Pérez");
    expect(ws["E2"].v).toBe(400);   // préstamo: 500 − 100
    expect(ws["F2"].v).toBe(60);    // daño
    expect(ws["G2"].t).toBe("n");
    expect(ws["G2"].v).toBe(560);   // prestado total
    expect(ws["H2"].v).toBe(100);   // pagado
    expect(ws["I2"].v).toBe(460);   // 🔴 el total sigue siendo prestado − pagado
    expect(ws["I2"].v).toBe(ws["E2"].v + ws["F2"].v); // las dos cuentas suman el total

    // Totales (espaciador fila 3, totales fila 4)
    expect(ws["A4"].v).toBe("TOTALES");
    expect(ws["G4"].t).toBe("n");
    expect(ws["G4"].v).toBe(560);
    expect(ws["I4"].v).toBe(460);

    const wsM = wb.Sheets["Movimientos"];
    expect(wsM["A1"].v).toBe("Empleado");
    expect(wsM["E1"].v).toBe("Cuenta");
    expect(wsM["F1"].v).toBe("Monto");
    expect(wsM["G1"].v).toBe("De dónde salió");
    // ⚠️ SE FUE la columna «Estado»: traducía dos valores que la pantalla no
    // produce y en las 443 filas decía siempre «Aprobado».
    expect(wsM["H1"].v).toBe("Notas");
    // Orden fecha DESC dentro del empleado. El pendiente del 1-jun NO sale.
    expect(wsM["C2"].v).toBe("20 may 2026");
    expect(wsM["D2"].v).toBe("Daño de mercancía");
    expect(wsM["E2"].v).toBe("Daño de mercancía");
    const textos = Object.keys(wsM)
      .filter((k) => /^D\d+$/.test(k))
      .map((k) => wsM[k].v);
    expect(textos).not.toContain("Responsabilidad por daño"); // se MUESTRA con su nombre nuevo
    // 3 movimientos aprobados + encabezado = 4 filas; el pendiente quedó fuera.
    expect(Object.keys(wsM).filter((k) => /^A\d+$/.test(k))).toHaveLength(4);
  });

  // 🔴 EL FILTRO DE EMPRESA LO DICE EL NOMBRE DEL ARCHIVO, no una fila adentro:
  // `historial_prestamos_fashion_wear_20260827.xlsx`. Por eso el subtítulo se
  // pudo ir sin perder de qué es el archivo — lo arma la route, y el libro ya
  // no recibe la empresa.
  it("el libro NO recibe la empresa: el archivo la dice", () => {
    expect(buildPrestamosWorkbook.length).toBe(1);
  });
});
