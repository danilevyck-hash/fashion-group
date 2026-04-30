// Helpers para post-procesar resultados de Supabase con embed de prestamos_movimientos.
// El embed ".select('*, prestamos_movimientos(*)')" no filtra por `deleted` automaticamente,
// asi que filtramos en cliente despues del fetch para mantener consistencia con queries directas.

interface MovimientoLike {
  deleted?: boolean | null;
}

interface EmpleadoConMovimientos {
  prestamos_movimientos?: MovimientoLike[] | null;
}

export function isMovimientoActivo(m: MovimientoLike | null | undefined): boolean {
  if (!m) return false;
  return m.deleted !== true;
}

/** Devuelve una copia del empleado con `prestamos_movimientos` filtrado a no-deleted. */
export function filterEmpleadoMovimientos<T extends EmpleadoConMovimientos>(emp: T): T {
  return { ...emp, prestamos_movimientos: (emp.prestamos_movimientos || []).filter(isMovimientoActivo) };
}

/** Aplica el filtro a un array de empleados (response tipico de los endpoints). */
export function filterEmpleadosMovimientos<T extends EmpleadoConMovimientos>(emps: T[] | null | undefined): T[] {
  return (emps || []).map(filterEmpleadoMovimientos);
}
