// ─────────────────────────────────────────────────────────────────────────────
// QUÉ FALTA PARA REGISTRAR UN MOVIMIENTO — y la cuota es OBLIGATORIA.
//
// Módulo PURO: sin base, sin red, sin `new Date()`.
//
// Daniel, 14-sep-2026, textual: *«a) La cuota es obligatoria: no te deja
// guardar sin ella»*. Viene de la misma tarde en que el daño de mercancía pasó
// a entrar por cuota como el préstamo (*«Agregan el daño como se hace un
// préstamo, se elige la cuota y listo»*) y de su pedido de que **nada se
// escriba a mano**: el descuento tiene que salir solo.
//
// ── 🩸 QUÉ VINO A ARREGLAR ──────────────────────────────────────────────────
//
// El botón «Registrar» del formulario se encendía con monto y fecha; la cuota
// era opcional. Un préstamo (o un daño, o un descuento a terceros) registrado
// SIN cuota no se descuenta NUNCA: `montoDeFicha` y sus hermanas devuelven 0
// con la cuota en 0, así que la casilla de la planilla queda vacía y alguien
// tiene que escribirla a mano cada quincena — que es exactamente lo que Daniel
// quiere eliminar. Medido el 14-sep-2026: **31 fichas vivas, las 31 con cuota**
// (0 con saldo y sin ninguna cuota), así que exigirla no deja a nadie sin
// poder registrar.
//
// ── 🔴 LA REGLA ────────────────────────────────────────────────────────────
//
//   · Los TRES conceptos que llevan cuota la exigen: Préstamo, Daño de
//     mercancía y Descuento a terceros. Los tres tienen el mismo agujero;
//     dejarlo abierto en uno sería un defecto conocido.
//   · Un Pago NO lleva cuota y NO la pide (control): en un pago lo que se
//     exige es «de dónde salió».
//   · El botón apagado DICE qué falta, con el patrón de Guías
//     («Falta: placa, recibido por y cédula»): nunca se apaga sin motivo.
//
// 🔑 La cuota vale cuando es un número MAYOR que cero. Un 0 no es una cuota:
// es «no descontar», y eso se decide en la fila de la planilla, no al
// registrar la deuda.
// ─────────────────────────────────────────────────────────────────────────────

import { unirEnHumano } from "@/lib/guias/falta-para-despachar";

/** Lo que puede faltar, en el orden en que se dice. */
export type FaltanteRegistro = "fecha" | "monto" | "cuota" | "origen";

export interface EstadoRegistro {
  fecha: unknown;
  monto: unknown;
  /** Lo tecleado en «Cuota por quincena». Solo se mira si `pideCuota`. */
  cuota: unknown;
  /** Si el formulario preguntó la cuota (préstamo · daño · terceros). */
  pideCuota: boolean;
  /** Si el concepto es un Pago: exige el origen y NUNCA la cuota. */
  esPago: boolean;
  origen: unknown;
}

function positivo(v: unknown): boolean {
  if (v === null || v === undefined || String(v).trim() === "") return false;
  const x = Number(v);
  return Number.isFinite(x) && x > 0;
}

/**
 * Qué falta para poder registrar. Lista vacía = se puede.
 *
 * 🔴 `pideCuota` y `esPago` no pueden ser verdad a la vez: un pago no lleva
 * cuota. Si llegaran los dos, manda `esPago` — la cuota NO se le exige a un
 * pago bajo ninguna combinación.
 */
export function queFaltaParaRegistrar(e: EstadoRegistro): FaltanteRegistro[] {
  const out: FaltanteRegistro[] = [];
  if (String(e.fecha ?? "").trim() === "") out.push("fecha");
  if (!positivo(e.monto)) out.push("monto");
  if (!e.esPago && e.pideCuota && !positivo(e.cuota)) out.push("cuota");
  if (e.esPago && String(e.origen ?? "").trim() === "") out.push("origen");
  return out;
}

/** Cómo se nombra cada faltante en la frase. */
const NOMBRE_FALTANTE: Readonly<Record<FaltanteRegistro, string>> = {
  fecha: "la fecha",
  monto: "el monto",
  cuota: "la cuota",
  origen: "de dónde salió el pago",
};

/**
 * «Falta: la cuota» · «Falta: el monto y la cuota» · «Falta: el monto, la cuota
 * y de dónde salió el pago». Sin faltantes devuelve "".
 */
export function textoFaltaRegistrar(faltantes: readonly FaltanteRegistro[]): string {
  if (faltantes.length === 0) return "";
  return `Falta: ${unirEnHumano(faltantes.map((f) => NOMBRE_FALTANTE[f]))}`;
}
