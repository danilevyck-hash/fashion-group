// ─────────────────────────────────────────────────────────────────────────────
// AL CERRAR, EL PAGO DEL PRÉSTAMO SE ESCRIBE SOLO.
//
// Módulo PURO: sin base, sin red, sin `new Date()`. Decide QUÉ movimientos hay
// que escribir; escribirlos es de `cierre-prestamo-server.ts`.
//
// ── 🩸 POR QUÉ EXISTE. LOS NÚMEROS ──────────────────────────────────────────
//
// Quincena del 1 al 15 de agosto de 2026, medido contra producción:
//
//     El módulo de Préstamos registró .......... 9 descuentos · $360,00
//     La casilla de la planilla decía .......... 7 descuentos · $265,00
//
// KEVIN LUBO ($50), LUIS PARAJON ($45) y YULICAR CORONA ($50) tenían el
// descuento registrado en el módulo y la casilla EN CERO: se les bajó la deuda
// por plata que nunca se les quitó del sueldo. LUIS ARROYO al revés — $50 en la
// casilla y ningún pago en el módulo: se le descontó y su deuda no bajó.
//
// Los dos errores son el mismo error: hoy el pago lo teclea una persona en el
// OTRO módulo, a mano, mirando un cuadro que está en otra pantalla. Dos
// tecleos de la misma plata es exactamente cómo nacen dos números distintos.
//
// ── 🔴 LAS CUATRO REGLAS ────────────────────────────────────────────────────
//
// 1. SE ESCRIBE LO QUE DICE LA CASILLA, no la sugerencia. La casilla se puede
//    corregir a mano y es lo que de verdad se le quitó del sueldo.
//
// 2. SI EL MÓDULO YA LO REGISTRÓ, NO SE ESCRIBE NADA. Es el «caso 1» de
//    `montoDeFicha`: un hecho consumado. Escribir encima sería cobrarle dos
//    veces a la misma persona la misma quincena — el error de la lista de
//    arriba, pero al doble.
//
// 3. EL SALDO NO SE RECALCULA ACÁ. Llega ya calculado desde
//    `prestamos-saldo.ts`, que es el ÚNICO lugar donde se calcula. Este módulo
//    solo lo usa como tope. El día que haya dos cuentas del saldo, nadie sabe
//    cuál se le descontó a la gente.
//
// 4. CERRAR DOS VECES NO COBRA DOS VECES. Lo garantiza el índice único de
//    `asistencia_planilla_prestamo (planilla_id, empleado_codigo, cuenta)`, no
//    un `if` de este archivo: un `if` se pierde una carrera, un índice no.
// ─────────────────────────────────────────────────────────────────────────────

import { centavos } from "./planilla";
import type { LineaPlanilla } from "./planilla";
import type { CuentaPrestamo } from "@/lib/prestamos-saldo";
import { CUENTA_DANO, CUENTA_PRESTAMO } from "@/lib/prestamos-saldo";

/**
 * El concepto con el que se anota cada cuenta.
 *
 * 🔴 SON LOS CONCEPTOS DE SIEMPRE, y no se renombra ninguno. `cuentaDeMovimiento`
 * los usa para saber a qué cuenta va un movimiento viejo: renombrar uno no
 * revienta nada, deja de contarse en silencio.
 */
export const CONCEPTO_DE_CUENTA: Readonly<Record<CuentaPrestamo, string>> = {
  prestamo: "Pago",
  dano: "Pago de responsabilidad",
};

/** De dónde salió el pago. La planilla siempre escribe «Quincena». */
export const ORIGEN_QUINCENA = "Quincena";

/** Lo que hace falta saber de la deuda de una persona para repartir el pago. */
export interface DeudaDePersona {
  /** El id de la ficha en `prestamos_empleados`. */
  fichaId: string;
  /** El código del reloj. El amarre es por CÓDIGO, nunca por nombre. */
  codigo: string;
  nombrePrestamos: string;
  /** Ya calculado por `prestamos-saldo.ts`. Acá solo se usa de tope. */
  saldoPrestamo: number;
  saldoDano: number;
  /** La cuota de cada cuenta, tal como está en la ficha. */
  cuotaPrestamo: number;
  cuotaDano: number;
  /**
   * 🔴 Lo que el módulo YA registró como pago DENTRO de esta quincena. Mayor
   * que cero = no se escribe nada (regla 2).
   */
  yaDescontado: number;
  /** Cuál cuenta se abrió primero. Decide a cuál va el pago corregido a mano. */
  cuentaMasVieja: CuentaPrestamo | null;
}

/** Un movimiento que el cierre tiene que escribir. */
export interface PagoAEscribir {
  fichaId: string;
  codigo: string;
  nombrePrestamos: string;
  cuenta: CuentaPrestamo;
  concepto: string;
  monto: number;
  /** La fecha del pago: el último día del período que se cerró. */
  fecha: string;
  origenPago: string;
}

/** Por qué una persona con casilla en cero (o con pago ya hecho) no genera nada. */
export type MotivoOmision =
  /** La casilla dice 0: no se le descontó nada, no hay nada que anotar. */
  | "casilla-en-cero"
  /** El módulo ya tenía el pago de esta quincena. Regla 2. */
  | "ya-registrado"
  /** No debe nada en ninguna de las dos cuentas. */
  | "sin-saldo"
  /** La casilla tiene un monto pero esa persona no está atada a ninguna ficha. */
  | "sin-ficha";

export interface Omision {
  codigo: string;
  etiqueta: string;
  monto: number;
  motivo: MotivoOmision;
}

export interface PlanDeCierre {
  pagos: PagoAEscribir[];
  omisiones: Omision[];
  /** Lo que va a bajar de deuda en total. Para decirlo en pantalla antes de cerrar. */
  total: number;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? centavos(x) : 0;
};

/**
 * 🔴 CÓMO SE PARTE EL MONTO DE LA CASILLA ENTRE LAS DOS CUENTAS.
 *
 * La planilla propone la SUMA de las dos cuotas en UNA casilla (Daniel:
 * *«juntos»*), así que al escribir hay que volver a partirla.
 *
 * Dos caminos, y el orden importa:
 *
 *   a) La casilla dice EXACTAMENTE lo que se propuso → se usa el reparto de la
 *      propuesta (`min(cuota, saldo)` en cada cuenta). Es el caso normal, y es
 *      el único que respeta que cada cuenta tiene SU cuota: repartir $40 de
 *      «$30 de préstamo + $10 de daño» todo al préstamo dejaría el daño sin
 *      abonar aunque la casilla lo incluía.
 *
 *   b) Alguien la corrigió a mano → va a la cuenta MÁS VIEJA primero, capeada a
 *      su saldo, y el resto a la otra. Es la misma regla que el módulo ya usa
 *      cuando una persona debe las dos («Baja de» viene puesto en la más vieja).
 *
 * ⚠️ Lo que sobre después de capear las DOS cuentas no se escribe: pagar más de
 * lo que se debe dejaría un saldo a favor que nadie pidió. Se devuelve en
 * `sobrante` para poder decirlo.
 */
export function repartirEntreCuentas(
  montoCasilla: number,
  deuda: Pick<DeudaDePersona, "saldoPrestamo" | "saldoDano" | "cuotaPrestamo" | "cuotaDano" | "cuentaMasVieja">,
): { prestamo: number; dano: number; sobrante: number } {
  const monto = n(montoCasilla);
  if (monto <= 0) return { prestamo: 0, dano: 0, sobrante: 0 };

  const saldoP = Math.max(0, n(deuda.saldoPrestamo));
  const saldoD = Math.max(0, n(deuda.saldoDano));
  const cuotaP = Math.max(0, n(deuda.cuotaPrestamo));
  const cuotaD = Math.max(0, n(deuda.cuotaDano));

  // (a) El reparto de la propuesta — la MISMA cuenta que `montoDeFicha`.
  const propuestaP = saldoP > 0 && cuotaP > 0 ? Math.min(cuotaP, saldoP) : 0;
  const propuestaD = saldoD > 0 && cuotaD > 0 ? Math.min(cuotaD, saldoD) : 0;
  if (centavos(propuestaP + propuestaD) === monto) {
    return { prestamo: centavos(propuestaP), dano: centavos(propuestaD), sobrante: 0 };
  }

  // (b) Corregida a mano: la cuenta más vieja primero.
  const primero: CuentaPrestamo =
    deuda.cuentaMasVieja ?? (saldoP > 0 ? CUENTA_PRESTAMO : CUENTA_DANO);
  const topePrimero = primero === CUENTA_PRESTAMO ? saldoP : saldoD;
  const topeSegundo = primero === CUENTA_PRESTAMO ? saldoD : saldoP;

  const aPrimero = Math.min(monto, Math.max(0, topePrimero));
  const aSegundo = Math.min(centavos(monto - aPrimero), Math.max(0, topeSegundo));
  const sobrante = centavos(monto - aPrimero - aSegundo);

  return primero === CUENTA_PRESTAMO
    ? { prestamo: centavos(aPrimero), dano: centavos(aSegundo), sobrante }
    : { prestamo: centavos(aSegundo), dano: centavos(aPrimero), sobrante };
}

/**
 * El plan completo de un cierre: qué movimientos escribir y qué se dejó afuera.
 *
 * `fecha` es el ÚLTIMO DÍA del período que se cierra — la fecha en que la plata
 * se le quitó del sueldo. Entra por parámetro: este módulo no mira el reloj.
 */
export function planDeCierre(opts: {
  lineas: readonly LineaPlanilla[];
  /** Por CÓDIGO. El amarre nunca es por nombre. */
  deudas: ReadonlyMap<string, DeudaDePersona>;
  fecha: string;
}): PlanDeCierre {
  const pagos: PagoAEscribir[] = [];
  const omisiones: Omision[] = [];

  for (const l of opts.lineas) {
    // Sin dinero calculado no hay nada que se le haya descontado.
    if (!l.dinero) continue;
    const monto = n(l.dinero.prestamo);
    const deuda = opts.deudas.get(l.codigo);

    if (monto <= 0) {
      // 🔑 Solo se NOMBRA la omisión de quien tiene una deuda viva: decirle a
      // la contadora «a estas 30 personas no se les descontó nada» sobre gente
      // que no debe nada es ruido, y el ruido es lo que hace que un aviso de
      // verdad pase desapercibido.
      if (deuda && centavos(deuda.saldoPrestamo + deuda.saldoDano) > 0) {
        omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto: 0, motivo: "casilla-en-cero" });
      }
      continue;
    }

    if (!deuda) {
      omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "sin-ficha" });
      continue;
    }

    // 🔴 REGLA 2. El hecho consumado le gana a todo: el módulo ya lo anotó.
    if (n(deuda.yaDescontado) > 0) {
      omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "ya-registrado" });
      continue;
    }

    if (centavos(deuda.saldoPrestamo + deuda.saldoDano) <= 0) {
      omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "sin-saldo" });
      continue;
    }

    const parte = repartirEntreCuentas(monto, deuda);
    for (const cuenta of [CUENTA_PRESTAMO, CUENTA_DANO] as const) {
      const m = cuenta === CUENTA_PRESTAMO ? parte.prestamo : parte.dano;
      if (m <= 0) continue;
      pagos.push({
        fichaId: deuda.fichaId,
        codigo: deuda.codigo,
        nombrePrestamos: deuda.nombrePrestamos,
        cuenta,
        concepto: CONCEPTO_DE_CUENTA[cuenta],
        monto: m,
        fecha: opts.fecha,
        origenPago: ORIGEN_QUINCENA,
      });
    }
  }

  const total = centavos(pagos.reduce((a, p) => a + p.monto, 0));
  return { pagos, omisiones, total };
}

/** Lo que la pantalla dice antes de cerrar. `null` si no hay nada que anotar. */
export function textoPlan(plan: PlanDeCierre): string | null {
  if (!plan.pagos.length) return null;
  const personas = new Set(plan.pagos.map((p) => p.codigo)).size;
  const q = personas === 1 ? "1 persona" : `${personas} personas`;
  return `Al cerrar se anota el pago del préstamo de ${q}, por $${plan.total.toFixed(2)} en total. La deuda baja sola: nadie lo teclea a mano.`;
}

/** Cómo se explica cada omisión. Un solo lugar, para que no haya dos redacciones. */
export const TEXTO_OMISION: Readonly<Record<MotivoOmision, string>> = {
  "casilla-en-cero": "debe, pero esta quincena no se le descontó nada",
  "ya-registrado": "el pago de esta quincena ya estaba anotado en Préstamos",
  "sin-saldo": "se le descontó, pero ya no debe nada",
  "sin-ficha": "se le descontó, pero no está atado a ninguna ficha de Préstamos",
};
