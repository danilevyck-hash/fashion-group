/* Solo lectura. Saca de producción TODO lo que hace falta para decir «qué le
 * falta» a cada colaborador: la ficha entera, si tiene horario cargado y su
 * ficha de préstamo (amarrada o no, con las tres cuotas y los tres saldos).
 * Alimenta a `_medir-cuadre-roxana.cjs`.
 *   npx tsx scripts/_medir-cuadre-fichas.ts <salida.json>
 * No escribe nada en ningún lado.
 */
import { writeFileSync } from "node:fs";

async function main() {
  const salida = process.argv[2];
  if (!salida) throw new Error("falta el archivo de salida");
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const { calcularSaldoPrestamo, cuentaDeMovimiento, CUENTA_PRESTAMO, CUENTA_DANO, CUENTA_TERCEROS } =
    await import("@/lib/prestamos-saldo");

  const per = await supabaseServer.from("asistencia_personas").select("*");
  if (per.error) throw new Error(per.error.message);
  const hor = await supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos");
  if (hor.error) throw new Error(hor.error.message);
  const emp = await supabaseServer
    .from("prestamos_empleados")
    .select("id, nombre, empleado_codigo, deduccion_quincenal, deduccion_dano, deduccion_terceros, deleted");
  if (emp.error) throw new Error(emp.error.message);
  const movs = await leerTodoPaginado<Record<string, unknown>>("movimientos", (pedirCount, from, to) =>
    supabaseServer.from("prestamos_movimientos")
      .select("id, empleado_id, fecha, concepto, monto, estado, cuenta, deleted, origen_pago", pedirCount ? { count: "exact" } : {})
      .order("fecha", { ascending: true }).order("id", { ascending: true }).range(from, to));

  const porEmpleado = new Map<string, Record<string, unknown>[]>();
  for (const m of movs) {
    const k = String(m.empleado_id ?? "");
    if (!porEmpleado.has(k)) porEmpleado.set(k, []);
    porEmpleado.get(k)!.push(m);
  }

  const prestamos = (emp.data ?? [])
    .filter((e) => e.deleted !== true)
    .map((e) => {
      const ms = (porEmpleado.get(String(e.id)) ?? []) as never[];
      const saldo = calcularSaldoPrestamo(ms);
      const porCuenta = { prestamo: 0, dano: 0, terceros: 0 };
      for (const m of ms as unknown as Record<string, unknown>[]) {
        if (m.deleted === true) continue;
        const c = cuentaDeMovimiento(m as never);
        if (c === CUENTA_PRESTAMO) porCuenta.prestamo += 1;
        else if (c === CUENTA_DANO) porCuenta.dano += 1;
        else if (c === CUENTA_TERCEROS) porCuenta.terceros += 1;
      }
      return {
        id: e.id, nombre: e.nombre, empleadoCodigo: e.empleado_codigo ?? null,
        cuotaPrestamo: e.deduccion_quincenal === null ? null : Number(e.deduccion_quincenal),
        cuotaDano: e.deduccion_dano === null ? null : Number(e.deduccion_dano),
        cuotaTerceros: e.deduccion_terceros === null || e.deduccion_terceros === undefined
          ? null : Number(e.deduccion_terceros),
        saldo, movimientos: ms.length, porCuenta,
      };
    });

  writeFileSync(salida, JSON.stringify({
    personas: per.data ?? [],
    horarios: hor.data ?? [],
    prestamos,
  }, null, 1));
  console.log(`${salida}: ${(per.data ?? []).length} fichas · ${(hor.data ?? []).length} horarios · ${prestamos.length} fichas de préstamo`);
}
main().catch((e) => { console.error(e); process.exit(1); });
