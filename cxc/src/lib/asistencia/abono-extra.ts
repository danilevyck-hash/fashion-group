// ─────────────────────────────────────────────────────────────────────────────
// EL ABONO EXTRAORDINARIO — un pago que NO salió de la quincena.
//
// Módulo PURO: valida y nada más.
//
// ⚠️ ESTO ES POR QUÉ PRÉSTAMOS NO DESAPARECE. Medido sobre los 337 pagos vivos:
// **53 (el 42 % de la plata, $8.834,22) no salieron de la quincena** — salieron
// de un abono de bolsillo, del décimo, de las vacaciones o de una liquidación.
// El cierre automático se lleva los otros 284; estos hay que poder anotarlos.
// ─────────────────────────────────────────────────────────────────────────────

import type { CuentaPrestamo } from "@/lib/prestamos-saldo";
import { CUENTA_DANO, CUENTA_PRESTAMO } from "@/lib/prestamos-saldo";

/**
 * 🔴 LOS ORÍGENES QUE LA BASE ACEPTA, MENOS «Quincena».
 *
 * «Quincena» lo escribe el cierre, y SOLO el cierre. Un abono anotado con ese
 * origen lo leería la casilla de la planilla como «ya descontado» (el caso 1 de
 * `montoDeFicha`) y esa quincena no le descontaría nada a la persona: el mismo
 * pago contado dos veces, al revés. Por eso no está en esta lista y hay candado.
 */
export const ORIGENES_ABONO = ["Efectivo", "Décimo", "Vacaciones", "Liquidación"] as const;
export type OrigenAbono = (typeof ORIGENES_ABONO)[number];

/** El origen que el cierre usa, y que acá está PROHIBIDO. */
export const ORIGEN_DE_LA_QUINCENA = "Quincena";

/**
 * El concepto con el que se anota cada cuenta.
 *
 * ⚠️ «Abono extra» NO se usa acá: ese concepto no distingue de qué cuenta baja
 * —`cuentaDeMovimiento` lo manda siempre a préstamo— y un abono contra el daño
 * de mercancía quedaría restando de la cuenta equivocada.
 */
export const CONCEPTO_DE_ABONO: Readonly<Record<CuentaPrestamo, string>> = {
  prestamo: "Pago",
  dano: "Pago de responsabilidad",
};

export const MONTO_MAX = 100_000;

export interface AbonoValido {
  fichaId: string;
  cuenta: CuentaPrestamo;
  monto: number;
  fecha: string;
  origen: OrigenAbono;
  notas: string | null;
}

export type Validacion =
  | { ok: true; valor: AbonoValido }
  | { ok: false; error: string };

/**
 * Valida el cuerpo de «anotar un abono».
 *
 * Los mensajes están escritos para quien los va a leer —la contadora—, no para
 * un programador: dicen qué falta y qué hacer.
 */
export function validarAbono(body: unknown): Validacion {
  const b = (body ?? {}) as Record<string, unknown>;

  const fichaId = typeof b.fichaId === "string" ? b.fichaId.trim() : "";
  if (!fichaId) return { ok: false, error: "Elige a quién se le anota el abono." };

  const cuentaRaw = String(b.cuenta ?? "").trim();
  if (cuentaRaw !== CUENTA_PRESTAMO && cuentaRaw !== CUENTA_DANO) {
    return { ok: false, error: "Elige de qué cuenta baja: préstamo o daño de mercancía." };
  }
  const cuenta = cuentaRaw as CuentaPrestamo;

  const monto = Number(b.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "Escribe cuánto abonó. Tiene que ser mayor que cero." };
  }
  if (monto > MONTO_MAX) {
    return { ok: false, error: `Ese monto es demasiado grande. El tope es $${MONTO_MAX.toLocaleString("en-US")}.` };
  }

  const fecha = String(b.fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Elige la fecha del abono." };
  }

  const origenRaw = String(b.origen ?? "").trim();
  // 🔴 EL CANDADO. «Quincena» no entra por acá ni escribiéndolo a mano.
  if (origenRaw === ORIGEN_DE_LA_QUINCENA) {
    return {
      ok: false,
      error: "El descuento de la quincena lo anota el cierre de la planilla, no este formulario.",
    };
  }
  if (!(ORIGENES_ABONO as readonly string[]).includes(origenRaw)) {
    return { ok: false, error: "Elige de dónde salió el abono." };
  }

  const notasRaw = typeof b.notas === "string" ? b.notas.trim().replace(/\s+/g, " ") : "";

  return {
    ok: true,
    valor: {
      fichaId,
      cuenta,
      monto: Math.round(monto * 100) / 100,
      fecha,
      origen: origenRaw as OrigenAbono,
      // La nota es OPCIONAL: 8 de cada 10 eran un eco del concepto.
      notas: notasRaw ? notasRaw.slice(0, 300) : null,
    },
  };
}
