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
// 🩸 Y AUN ASÍ HABÍA OCHO. Medido el 4-sep-2026: ocho lugares calculaban el
// saldo por su cuenta —la ficha entre ellos, con un `console.warn` que admitía
// que podía no cuadrar—. Desde el 5-sep-2026 TODOS pasan por acá.
//
// ── 🔴 DOS CUENTAS, NO UNA (5-sep-2026) ──────────────────────────────────────
//
// Daniel separó lo que la persona debe en DOS cuentas con su propia cuota:
//
//     Préstamo            $220.00
//     Daño de mercancía    $50.00
//     ──────────────────────────
//     Debe                $270.00
//
// El total NO CAMBIA: es la misma suma de siempre, partida en dos. Medido
// contra producción antes de tocar nada — 14 personas con saldo, $5.062,01 en
// total — el corte deja **13 con toda la deuda en «Préstamo» y cero en «Daño»**
// y un único caso cruzado: STEPHANY MORALES (ficha archivada, saldo neto $0)
// tiene sus pagos de daño registrados como `Pago`, así que su cuenta Préstamo
// da −$254,50 y su cuenta Daño +$254,50. **No se reasigna nada**: se respeta lo
// que alguien registró y la ficha lo muestra como está.
//
// ── 🔑 LOS SIGNOS. Cinco conceptos históricos, dos direcciones ────────────────
//   SUMAN   Préstamo · Responsabilidad por daño        (lo que se le entregó)
//   RESTAN  Pago · Abono extra · Pago de responsabilidad (lo que devolvió)
// Un concepto que no esté en ninguna de las dos listas NO se cuenta — no se
// asume que suma. Es la misma regla que `signoVenta()` en ventas: lo que el
// sistema no sabe leer no entra al total por descarte.
//
// ⚠️ LAS CINCO LISTAS SE QUEDAN aunque la pantalla ofrezca solo TRES conceptos
// («Préstamo», «Daño de mercancía» y «Pago»): «Abono extra» y «Pago de
// responsabilidad» dejaron de ofrecerse el 5-sep-2026 —son un pago de otro
// monto— pero el histórico conserva sus nombres y sigue contando igual. 432
// movimientos vivos dependen de eso.
//
// ⚠️ `estado !== "aprobado"` no suma. Un movimiento esperando la aprobación de
// Daniel NO ES PLATA TODAVÍA (no se entregó) — pero SE VE: `pendienteDeAprobacion`
// lo devuelve aparte, justo para que nunca vuelva a esconderse (🩸 los $700 de
// LUIS ARROYO, 22 días en cero).
// ─────────────────────────────────────────────────────────────────────────────

/** Las dos cuentas de una persona. */
export type CuentaPrestamo = "prestamo" | "dano";

export const CUENTA_PRESTAMO: CuentaPrestamo = "prestamo";
export const CUENTA_DANO: CuentaPrestamo = "dano";
export const CUENTAS: readonly CuentaPrestamo[] = [CUENTA_PRESTAMO, CUENTA_DANO];

/** Cómo se llama cada cuenta en pantalla. Un solo lugar. */
export const NOMBRE_CUENTA: Record<CuentaPrestamo, string> = {
  prestamo: "Préstamo",
  dano: "Daño de mercancía",
};

/** Lo mínimo que hace falta de un movimiento para poder sumarlo. */
export interface MovimientoParaSaldo {
  concepto: string;
  monto: number | string;
  estado?: string | null;
  deleted?: boolean | null;
  /** `prestamo` | `dano`. NULL en todo lo viejo: se deriva del concepto. */
  cuenta?: string | null;
  /** Solo para saber cuál cuenta es la MÁS VIEJA. Opcional. */
  fecha?: string | null;
}

/** Los conceptos que AUMENTAN lo que la persona debe. */
export const CONCEPTOS_SUMAN = ["Préstamo", "Responsabilidad por daño"] as const;

/** Los conceptos que BAJAN lo que la persona debe. */
export const CONCEPTOS_RESTAN = ["Pago", "Abono extra", "Pago de responsabilidad"] as const;

/**
 * Los conceptos históricos que, sin columna `cuenta`, pertenecen a DAÑO.
 * Todo lo demás cae en «Préstamo» — que es como se registró desde 2025.
 */
export const CONCEPTOS_DE_DANO = ["Responsabilidad por daño", "Pago de responsabilidad"] as const;

const SUMAN = new Set<string>(CONCEPTOS_SUMAN);
const RESTAN = new Set<string>(CONCEPTOS_RESTAN);
const DE_DANO = new Set<string>(CONCEPTOS_DE_DANO);

/**
 * 🔑 A QUÉ CUENTA VA UN MOVIMIENTO.
 *
 * La columna `cuenta` manda cuando está escrita (la escriben los movimientos
 * nuevos: un «Pago» baja UNA de las dos y hay que saber cuál). Cuando está en
 * NULL —los 443 movimientos anteriores al 5-sep-2026— se deriva del concepto,
 * y eso reproduce exactamente los números que la pantalla mostraba ayer.
 */
export function cuentaDeMovimiento(m: MovimientoParaSaldo): CuentaPrestamo {
  const c = String(m.cuenta ?? "").trim();
  if (c === CUENTA_DANO) return CUENTA_DANO;
  if (c === CUENTA_PRESTAMO) return CUENTA_PRESTAMO;
  return DE_DANO.has(m.concepto) ? CUENTA_DANO : CUENTA_PRESTAMO;
}

export interface SaldoCuenta {
  /** Lo entregado en esta cuenta, solo aprobado. */
  prestado: number;
  /** Lo devuelto en esta cuenta, solo aprobado. */
  pagado: number;
  /** `prestado − pagado`. Negativo = saldo a favor de la persona. */
  saldo: number;
  /**
   * La fecha del movimiento MÁS VIEJO que abrió esta cuenta (`YYYY-MM-DD`), o
   * `null` si los movimientos llegaron sin fecha. Es lo que decide cuál cuenta
   * cobra primero.
   */
  desde: string | null;
}

export interface SaldoPrestamo {
  /** Lo entregado (préstamos + responsabilidades), solo aprobado. */
  prestado: number;
  /** Lo devuelto (pagos + abonos), solo aprobado. */
  pagado: number;
  /** `prestado − pagado`. Negativo = saldo a favor de la persona. */
  saldo: number;
  /** % devuelto, para la barrita. 0 si nunca se le prestó nada. */
  pct: number;
  /** El mismo total, partido en las dos cuentas. Suman exactamente `saldo`. */
  cuentas: Record<CuentaPrestamo, SaldoCuenta>;
}

function cuentaVacia(): SaldoCuenta {
  return { prestado: 0, pagado: 0, saldo: 0, desde: null };
}

/**
 * La cuenta. `movs` puede venir con movimientos borrados: se descartan acá, así
 * que quien llame no tiene que acordarse (el embed de PostgREST no filtra
 * `deleted` solo — ver `prestamos-helpers.ts`).
 */
export function calcularSaldoPrestamo(
  movs: readonly MovimientoParaSaldo[] | null | undefined,
): SaldoPrestamo {
  const cuentas: Record<CuentaPrestamo, SaldoCuenta> = {
    prestamo: cuentaVacia(),
    dano: cuentaVacia(),
  };
  for (const m of movs ?? []) {
    if (!m || m.deleted === true) continue;
    if (m.estado !== "aprobado") continue;
    const monto = Number(m.monto) || 0;
    const suma = SUMAN.has(m.concepto);
    const resta = !suma && RESTAN.has(m.concepto);
    if (!suma && !resta) continue;
    const c = cuentas[cuentaDeMovimiento(m)];
    if (suma) {
      c.prestado += monto;
      const f = typeof m.fecha === "string" ? m.fecha.slice(0, 10) : "";
      if (f && (c.desde === null || f < c.desde)) c.desde = f;
    } else {
      c.pagado += monto;
    }
  }
  cuentas.prestamo.saldo = cuentas.prestamo.prestado - cuentas.prestamo.pagado;
  cuentas.dano.saldo = cuentas.dano.prestado - cuentas.dano.pagado;

  const prestado = cuentas.prestamo.prestado + cuentas.dano.prestado;
  const pagado = cuentas.prestamo.pagado + cuentas.dano.pagado;
  const saldo = prestado - pagado;
  return {
    prestado,
    pagado,
    saldo,
    pct: prestado > 0 ? (pagado / prestado) * 100 : 0,
    cuentas,
  };
}

/** ¿Debe las dos cuentas a la vez? Es lo único que obliga a preguntar «baja de». */
export function debeLasDos(s: SaldoPrestamo): boolean {
  return s.cuentas.prestamo.saldo > 0 && s.cuentas.dano.saldo > 0;
}

/**
 * 🔴 LA CUENTA MÁS VIEJA — la que cobra primero.
 *
 * Es el valor por defecto del «Baja de» del formulario y el orden en que la
 * quincena reparte el descuento. Con una sola cuenta con saldo no hay nada que
 * decidir; con las dos, gana la que se abrió antes. Si ninguna trae fecha
 * (movimientos sin `fecha`), gana «Préstamo» — el desempate estable, nunca el
 * azar del orden en que llegó el array.
 */
export function cuentaMasVieja(s: SaldoPrestamo): CuentaPrestamo | null {
  const p = s.cuentas.prestamo.saldo > 0;
  const d = s.cuentas.dano.saldo > 0;
  if (!p && !d) return null;
  if (p && !d) return CUENTA_PRESTAMO;
  if (d && !p) return CUENTA_DANO;
  const fp = s.cuentas.prestamo.desde;
  const fd = s.cuentas.dano.desde;
  if (fp && fd) return fd < fp ? CUENTA_DANO : CUENTA_PRESTAMO;
  if (fd && !fp) return CUENTA_DANO;
  return CUENTA_PRESTAMO;
}

/**
 * 🔴 LO QUE ESPERA APROBACIÓN NO SUMA, PERO SE VE.
 *
 * No es plata todavía —no se entregó— así que queda fuera del saldo; y por eso
 * mismo tiene que salir por su propia puerta, con su monto y su fecha. Esconder
 * lo que espera es literalmente cómo se perdieron los $700 de LUIS ARROYO
 * durante 22 días (#651).
 */
export const ESTADO_PENDIENTE = "pendiente_aprobacion";

export interface PendienteDeAprobacion {
  /** Suma de lo que espera. NUNCA entra al saldo. */
  total: number;
  /** Cuántos movimientos esperan. */
  cuantos: number;
}

export function pendienteDeAprobacion(
  movs: readonly MovimientoParaSaldo[] | null | undefined,
): PendienteDeAprobacion {
  let total = 0;
  let cuantos = 0;
  for (const m of movs ?? []) {
    if (!m || m.deleted === true) continue;
    if (m.estado !== ESTADO_PENDIENTE) continue;
    total += Number(m.monto) || 0;
    cuantos += 1;
  }
  return { total, cuantos };
}
