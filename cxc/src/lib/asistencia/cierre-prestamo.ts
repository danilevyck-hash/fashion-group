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
import { CUENTA_DANO, CUENTA_PRESTAMO, CUENTA_TERCEROS } from "@/lib/prestamos-saldo";

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
  terceros: "Pago de terceros",
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
  saldoTerceros: number;
  /** La cuota de cada cuenta automática, tal como está en la ficha.
   *  ⚠️ El DAÑO ya no tiene cuota: su descuento lo escribe la contadora. */
  cuotaPrestamo: number;
  cuotaTerceros: number;
  /**
   * 🔴 Lo que el módulo YA registró como pago DENTRO de esta quincena, POR
   * CUENTA. Mayor que cero = esa cuenta no se vuelve a anotar (regla 2).
   */
  yaDescontado: number;
  yaDescontadoTerceros: number;
  yaDescontadoDano: number;
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
 * 🔴 UNA CASILLA, UNA CUENTA. Las tres, y sin repartir nada.
 *
 * 🩸 HASTA EL 10-SEP-2026 ACÁ SE REPARTÍA: la casilla «Préstamo» traía la suma
 * de la cuota de préstamo y la de daño (Daniel: *«juntos»*) y había que volver
 * a partirla entre las dos cuentas al escribir. Eso se terminó porque la
 * contadora separó los renglones: cada cuenta tiene SU casilla en la planilla y
 * SU renglón en el comprobante, así que el reparto ya no existe — y con él se
 * fue la única parte de este archivo que podía mandar plata a la cuenta
 * equivocada.
 *
 *   casilla «Préstamo»  → cuenta `prestamo`   (propuesta: min(cuota, saldo))
 *   casilla «Terceros»  → cuenta `terceros`   (propuesta: min(cuota, saldo))
 *   casilla «Mercancía» → cuenta `dano`       (SIN propuesta: la escribe ella)
 */
export const CASILLA_DE_CUENTA = [
  { cuenta: CUENTA_PRESTAMO, campo: "prestamo", yaDescontado: "yaDescontado", saldo: "saldoPrestamo" },
  { cuenta: CUENTA_TERCEROS, campo: "terceros", yaDescontado: "yaDescontadoTerceros", saldo: "saldoTerceros" },
  { cuenta: CUENTA_DANO, campo: "mercancia", yaDescontado: "yaDescontadoDano", saldo: "saldoDano" },
] as const satisfies readonly {
  cuenta: CuentaPrestamo;
  campo: "prestamo" | "terceros" | "mercancia";
  yaDescontado: keyof DeudaDePersona;
  saldo: keyof DeudaDePersona;
}[];

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
    const deuda = opts.deudas.get(l.codigo);

    for (const c of CASILLA_DE_CUENTA) {
      const monto = n(l.dinero[c.campo]);
      const saldo = deuda ? n(deuda[c.saldo] as number) : 0;

      if (monto <= 0) {
        // 🔑 Solo se NOMBRA la omisión de quien tiene una deuda viva EN ESA
        // CUENTA: decirle a la contadora «a estas 30 personas no se les
        // descontó nada» sobre gente que no debe nada es ruido, y el ruido es
        // lo que hace que un aviso de verdad pase desapercibido.
        //
        // ⚠️ El DAÑO no entra a este aviso: no propone cuota, así que una
        // casilla vacía es lo NORMAL y no un descuento que faltó.
        if (deuda && c.cuenta !== CUENTA_DANO && saldo > 0.004) {
          omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto: 0, motivo: "casilla-en-cero" });
        }
        continue;
      }

      if (!deuda) {
        omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "sin-ficha" });
        continue;
      }

      // 🔴 REGLA 2. El hecho consumado le gana a todo: el módulo ya lo anotó
      // EN ESA CUENTA.
      if (n(deuda[c.yaDescontado] as number) > 0) {
        omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "ya-registrado" });
        continue;
      }

      if (saldo <= 0.004) {
        omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "sin-saldo" });
        continue;
      }

      // ⚠️ Se anota lo que dice la casilla, capeado a lo que se debe: pagar más
      // de lo que se debe dejaría un saldo a favor que nadie pidió.
      const aAnotar = centavos(Math.min(monto, saldo));
      if (aAnotar <= 0) continue;
      pagos.push({
        fichaId: deuda.fichaId,
        codigo: deuda.codigo,
        nombrePrestamos: deuda.nombrePrestamos,
        cuenta: c.cuenta,
        concepto: CONCEPTO_DE_CUENTA[c.cuenta],
        monto: aAnotar,
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
  const q = personas === 1 ? "1 colaborador" : `${personas} colaboradores`;
  return `Al cerrar se anota el pago del préstamo de ${q}, por $${plan.total.toFixed(2)} en total. La deuda baja sola: nadie lo teclea a mano.`;
}

/** Cómo se explica cada omisión. Un solo lugar, para que no haya dos redacciones. */
export const TEXTO_OMISION: Readonly<Record<MotivoOmision, string>> = {
  "casilla-en-cero": "debe, pero esta quincena no se le descontó nada",
  "ya-registrado": "el pago de esta quincena ya estaba anotado en Préstamos",
  "sin-saldo": "se le descontó, pero ya no debe nada",
  "sin-ficha": "se le descontó, pero no está atado a ninguna ficha de Préstamos",
};
