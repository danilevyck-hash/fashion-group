/* ─────────────────────────────────────────────────────────────────────────────
 * PRÉSTAMOS, ESTILO APPLE (4-oct-2026). PURO: sin base ni red.
 *
 * La pregunta de la pantalla: «¿cuánto me deben y cuánto entra en la próxima
 * quincena?». Tres cambios en Asistencia › Préstamos (la de David es la MISMA
 * pestaña filtrada a Boston: `VENTAS_BOSTON` lleva ahí la vieja Boston › Préstamos):
 *
 *   1. Arriba, lo importante: «Saldo total» grande y «Próximo descuento». Se va
 *      el conteo de colaboradores: son las filas.
 *   2. Lo que requiere atención, arriba: la ficha SIN colaborador asignado (la
 *      planilla no le puede descontar) va primero; después, de mayor a menor saldo.
 *      🩸 Hoy la lista sale en el orden del `id` de la ficha.
 *   3. En el celular, la tarjeta dice lo esencial en DOS líneas y se toca entera
 *      para abrir el detalle (que ya tiene «Registrar abono»).
 *
 * 🔑 «Próximo descuento» NO es una cuenta nueva: suma, ficha por ficha, lo que
 * proponen las MISMAS funciones de la planilla (`montoDeFicha`,
 * `montoTercerosDeFicha`, `montoDanoDeFicha`: cada cuota capeada a SU saldo).
 * Es lo que la planilla PROPONE; lo escrito a mano en la fila y el recorte al
 * neto (`recortarAlNeto`) pueden bajarlo al cerrar.
 *
 * PRENDIDO el 9-oct-2026 con el «sí» de Daniel. `false` = la pantalla de antes,
 * al pie de la letra. Candado: `src/__tests__/prestamos-apple-2026-10.test.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */

import { montoDanoDeFicha, montoDeFicha, montoTercerosDeFicha } from "@/lib/asistencia/prestamos-planilla";

/** Prendido el 9-oct-2026 (Daniel). `false` = la pantalla de antes. */
export const PRESTAMOS_APPLE_2026_10 = true;

export interface CuentasConCuota {
  saldoPrestamo: number;
  saldoDano: number;
  saldoTerceros?: number;
  cuota: number;
  cuotaDano: number;
  cuotaTerceros?: number;
}

/** Lo que las tres cuotas proponen para la próxima quincena, cada una capeada a su saldo. */
export function proximoDescuento(f: CuentasConCuota): number {
  const ficha = {
    id: "",
    codigo: null,
    nombre: "",
    saldo: 0,
    saldoPrestamo: f.saldoPrestamo,
    saldoDano: f.saldoDano,
    saldoTerceros: f.saldoTerceros ?? 0,
    cuota: f.cuota,
    cuotaDano: f.cuotaDano,
    cuotaTerceros: f.cuotaTerceros ?? 0,
    // La PRÓXIMA quincena: lo ya descontado en esta no cuenta.
    yaDescontado: 0,
    yaDescontadoDano: 0,
    yaDescontadoTerceros: 0,
  };
  const c = montoDeFicha(ficha).monto + montoTercerosDeFicha(ficha).monto + montoDanoDeFicha(ficha).monto;
  return Math.round(c * 100) / 100;
}

export function totalProximoDescuento(fichas: readonly CuentasConCuota[]): number {
  return Math.round(fichas.reduce((a, f) => a + proximoDescuento(f), 0) * 100) / 100;
}

/** Sin colaborador asignado primero; después de mayor a menor saldo; empate por nombre. */
export function conAtencionArriba<T extends { codigo: string | null; saldo: number; nombre: string }>(
  fichas: readonly T[],
): T[] {
  return [...fichas].sort(
    (a, b) =>
      Number(!!a.codigo) - Number(!!b.codigo) ||
      b.saldo - a.saldo ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}
