// El chip «✓ Deducida / Pendiente» de la lista de Préstamos mira las TRES
// cuentas (16-nov-2026): a quien solo le descuentan terceros o daño le salía
// «Pendiente» aunque el cierre ya había descontado (Julio Guzmán, Jenifer Miranda).
import { describe, expect, it, vi } from "vitest";

const empleados = [
  { id: "t", nombre: "Terceros", empresa: "x", deduccion_quincenal: 0, deduccion_dano: 0, deduccion_terceros: 25, empleado_codigo: "1",
    prestamos_movimientos: [
      { id: "a", fecha: "2026-11-01", concepto: "Descuento a terceros", monto: 200, estado: "aprobado", deleted: false, cuenta: "terceros", origen_pago: null },
      { id: "b", fecha: "2026-11-10", concepto: "Pago de terceros", monto: 25, estado: "aprobado", deleted: false, cuenta: "terceros", origen_pago: "Quincena" },
    ] },
  { id: "d", nombre: "Daño", empresa: "x", deduccion_quincenal: 0, deduccion_dano: 20, deduccion_terceros: 0, empleado_codigo: "2",
    prestamos_movimientos: [
      { id: "c", fecha: "2026-11-01", concepto: "Responsabilidad por daño", monto: 100, estado: "aprobado", deleted: false, cuenta: null, origen_pago: null },
      { id: "e", fecha: "2026-11-10", concepto: "Pago de responsabilidad", monto: 20, estado: "aprobado", deleted: false, cuenta: null, origen_pago: null },
    ] },
  { id: "ab", nombre: "Abono", empresa: "x", deduccion_quincenal: 0, deduccion_dano: 0, deduccion_terceros: 25, empleado_codigo: "3",
    prestamos_movimientos: [
      { id: "f", fecha: "2026-11-01", concepto: "Descuento a terceros", monto: 200, estado: "aprobado", deleted: false, cuenta: "terceros", origen_pago: null },
      { id: "g", fecha: "2026-11-10", concepto: "Pago de terceros", monto: 25, estado: "aprobado", deleted: false, cuenta: "terceros", origen_pago: "Abono" },
    ] },
];
const personas = ["1", "2", "3"].map((c) => ({ empleado_codigo: c, nombre: c, empresa: null, salario_mensual: 600, activo: true, fecha_salida: null }));

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async (etiqueta: string) => (etiqueta.startsWith("prestamos_empleados") ? empleados : personas),
}));

describe("chip de la quincena en la lista de Préstamos", () => {
  it("reconoce Pago de terceros y Pago de responsabilidad; un abono de bolsillo no cuenta", async () => {
    const { leerDatosPrestamos } = await import("@/lib/prestamos-lista-server");
    const { filas } = await leerDatosPrestamos("2026-11-12");
    const por = Object.fromEntries(filas.map((f) => [f.id, f.deducidaQuincena]));
    expect(por).toEqual({ t: true, d: true, ab: false });
  });
});
