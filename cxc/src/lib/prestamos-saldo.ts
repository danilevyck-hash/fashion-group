// ─────────────────────────────────────────────────────────────────────────────
// EL SALDO DE UN PRÉSTAMO — la cuenta, dicha UNA sola vez.
//
// 🩸 POR QUÉ SE EXTRAJO (27-ago-2026). Esta cuenta vivía como una función suelta
// adentro de `app/prestamos/PrestamosClient.tsx` — un componente de cliente. La
// pestaña Préstamos del módulo Boston necesita el MISMO número desde el
// servidor, y copiarla habría creado dos definiciones de "lo que debe" que
// nadie obliga a coincidir. Este repo ya se quemó exactamente así (la MV de la
// cartera nació como copia verbatim de su vista y se apartó en silencio).
//
// Lo que cambia es DÓNDE vive la función, no la función: los conceptos, los
// signos y el filtro por `estado === "aprobado"` son los mismos, carácter por
// carácter, que los que la pantalla de Contabilidad ya usaba.
//
// 🔑 LOS SIGNOS. Cinco conceptos, dos direcciones:
//   SUMAN   Préstamo · Responsabilidad por daño        (lo que se le entregó)
//   RESTAN  Pago · Abono extra · Pago de responsabilidad (lo que devolvió)
// Un concepto que no esté en ninguna de las dos listas NO se cuenta — no se
// asume que suma. Es la misma regla que `signoVenta()` en ventas: lo que el
// sistema no sabe leer no entra al total por descarte.
//
// ⚠️ `estado !== "aprobado"` no suma. Un movimiento pendiente de aprobación no
// es plata todavía.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que hace falta de un movimiento para poder sumarlo. */
export interface MovimientoParaSaldo {
  concepto: string;
  monto: number | string;
  estado?: string | null;
  deleted?: boolean | null;
}

/** Los conceptos que AUMENTAN lo que la persona debe. */
export const CONCEPTOS_SUMAN = ["Préstamo", "Responsabilidad por daño"] as const;

/** Los conceptos que BAJAN lo que la persona debe. */
export const CONCEPTOS_RESTAN = ["Pago", "Abono extra", "Pago de responsabilidad"] as const;

const SUMAN = new Set<string>(CONCEPTOS_SUMAN);
const RESTAN = new Set<string>(CONCEPTOS_RESTAN);

export interface SaldoPrestamo {
  /** Lo entregado (préstamos + responsabilidades), solo aprobado. */
  prestado: number;
  /** Lo devuelto (pagos + abonos), solo aprobado. */
  pagado: number;
  /** `prestado − pagado`. Negativo = saldo a favor de la persona. */
  saldo: number;
  /** % devuelto, para la barrita. 0 si nunca se le prestó nada. */
  pct: number;
}

/**
 * La cuenta. `movs` puede venir con movimientos borrados: se descartan acá, así
 * que quien llame no tiene que acordarse (el embed de PostgREST no filtra
 * `deleted` solo — ver `prestamos-helpers.ts`).
 */
export function calcularSaldoPrestamo(
  movs: readonly MovimientoParaSaldo[] | null | undefined,
): SaldoPrestamo {
  let prestado = 0;
  let pagado = 0;
  for (const m of movs ?? []) {
    if (!m || m.deleted === true) continue;
    if (m.estado !== "aprobado") continue;
    const monto = Number(m.monto) || 0;
    if (SUMAN.has(m.concepto)) prestado += monto;
    else if (RESTAN.has(m.concepto)) pagado += monto;
  }
  const saldo = prestado - pagado;
  return { prestado, pagado, saldo, pct: prestado > 0 ? (pagado / prestado) * 100 : 0 };
}
