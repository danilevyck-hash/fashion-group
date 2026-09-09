// ─────────────────────────────────────────────────────────────────────────────
// TRES CONCEPTOS SE OFRECEN, CINCO SE SIGUEN CONTANDO.
//
// Daniel, 5-sep-2026: el módulo pasa a tener **tres** conceptos —
// **Préstamo** · **Daño de mercancía** · **Pago** — con **dos cuentas**
// separadas por persona (ver `prestamos-saldo.ts`).
//
// ── 🔴 LO QUE NO SE HIZO, Y ES LO IMPORTANTE ─────────────────────────────────
//
// NO se renombró ningún valor guardado. `Responsabilidad por daño` se sigue
// escribiendo así en la base y se MUESTRA como «Daño de mercancía»; `Abono
// extra` y `Pago de responsabilidad` dejan de OFRECERSE —son un pago de otro
// monto— pero las 432 filas vivas conservan su nombre y siguen contando igual.
//
// Renombrar un concepto es el peor modo de fallo de este módulo, y está medido:
// los cálculos del saldo NO revientan ante un concepto desconocido, lo dejan de
// contar. O sea que un `UPDATE ... SET concepto = 'Daño de mercancía'` habría
// cambiado el saldo de la gente EN SILENCIO. La pantalla cambia; la base no.
//
// ── LA ETIQUETA VIVE ACÁ Y EN NINGÚN OTRO LADO ───────────────────────────────
// Dos traducciones del mismo valor son dos pantallas que un día dicen cosas
// distintas de la misma fila.
// ─────────────────────────────────────────────────────────────────────────────

import { CUENTA_DANO, CUENTA_PRESTAMO, type CuentaPrestamo } from "./prestamos-saldo";

/** El valor tal como se guarda en `prestamos_movimientos.concepto`. */
export const CONCEPTO_PRESTAMO = "Préstamo";
export const CONCEPTO_DANO = "Responsabilidad por daño";
export const CONCEPTO_PAGO = "Pago";

/** Los conceptos retirados del formulario el 5-sep-2026. Siguen contando. */
export const CONCEPTOS_RETIRADOS = ["Abono extra", "Pago de responsabilidad"] as const;

/**
 * 🔴 LOS TRES QUE SE OFRECEN. El POST solo acepta estos: un concepto retirado
 * ya no se puede crear, aunque los viejos se sigan leyendo y contando.
 */
export const CONCEPTOS_OFRECIDOS = [CONCEPTO_PRESTAMO, CONCEPTO_DANO, CONCEPTO_PAGO] as const;

/** Todos los conceptos que la base puede contener hoy. */
export const CONCEPTOS_CONOCIDOS = [...CONCEPTOS_OFRECIDOS, ...CONCEPTOS_RETIRADOS] as const;

/**
 * Cómo se lee un concepto en pantalla. Solo uno cambia de nombre:
 * `Responsabilidad por daño` → «Daño de mercancía».
 */
export function etiquetaConcepto(concepto: string): string {
  return concepto === CONCEPTO_DANO ? "Daño de mercancía" : concepto;
}

/** ¿Este concepto AUMENTA la deuda? (los dos cargos). */
export function esCargo(concepto: string): boolean {
  return concepto === CONCEPTO_PRESTAMO || concepto === CONCEPTO_DANO;
}

/** La cuenta a la que va un CARGO. Un pago se decide aparte (lo elige quien registra). */
export function cuentaDeCargo(concepto: string): CuentaPrestamo {
  return concepto === CONCEPTO_DANO ? CUENTA_DANO : CUENTA_PRESTAMO;
}

// ─────────────────────────────────────────────────────────────────────────────
// DE DÓNDE SALIÓ LA PLATA DE UN PAGO
//
// 🩸 Medido el 4-sep-2026 sobre los movimientos vivos: **9 pagos reales
// salieron de una liquidación, del décimo o de vacaciones** y hoy eso solo se
// sabe si alguien lo escribió a mano en la nota — JOHANA $700 + $286 de
// liquidación, ROXANA «quincenal 50.00 y vacaciones 400.00», ÁNGELA $233,40 del
// décimo. Es un dato del negocio viviendo en un campo de texto libre.
//
// 🔴 Y ES ADEMÁS LA LLAVE DEL FRENO DE DUPLICADOS. El dedup de la deducción
// quincenal miraba si la NOTA empezaba con «Deducción quincenal»: medido, hay
// **18 filas** escritas de otra forma (`DEDUCCION QUINCENAL ` ×8,
// `DEDUCCION QUINCENAL` ×4, `DEDUCCION DE QUINCENA` ×3, `DESCUENTO QUINCENAL `,
// `Pago quincenal`, `Descontar 25 por quincena `) con las que ese freno
// SIMPLEMENTE NO FUNCIONA — `ilike` no ignora los acentos. Ahora el freno mira
// el ORIGEN y la FECHA. Nunca más un texto.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGENES_PAGO = ["Quincena", "Décimo", "Vacaciones", "Liquidación", "Abono"] as const;
export type OrigenPago = (typeof ORIGENES_PAGO)[number];

/**
 * 🔴 LO QUE LA PANTALLA OFRECE NO ES LO QUE LA BASE GUARDA — 8-sep-2026.
 *
 * Mismo patrón que los conceptos (la pantalla ofrece TRES y la base guarda los
 * CINCO de siempre). `ORIGENES_PAGO` son los valores VÁLIDOS; esta lista es la
 * que se DIBUJA en «Nuevo movimiento».
 *
 * **«Quincena» se saca del formulario, y no es un olvido.** El descuento de la
 * quincena NO se teclea acá: lo escribe el botón «Aplicar quincena»
 * (`useEmpleadoActions.pagoQuincenal`, que sigue mandando `ORIGEN_POR_DEFECTO`).
 * Lo que una persona teclea a mano en este formulario es, por definición, LA
 * EXCEPCIÓN. Daniel, textual: «¿y por qué está quincena si es lo que se hace
 * recurrente?».
 *
 * 🩸 Y venía PUESTA por defecto. Medido el 8-sep-2026: los **434 movimientos
 * vivos** tienen `origen_pago` en NULL — el campo no se llenó ni una sola vez
 * desde que existe. Un desplegable que ya trae la respuesta no se contesta: se
 * salta. Por eso ahora **no viene ninguna puesta** y hay que elegir.
 *
 * ⚠️ «Quincena» SIGUE siendo un valor válido y sigue significando lo mismo: es
 * lo que escribe el botón, y es lo que un `origen_pago` en NULL quiere decir
 * para el freno de duplicados (`esPagoDeQuincena`). Sacarla de la lista de
 * valores habría roto ese freno para los 434.
 *
 * 🩸 «Efectivo» se retiró: **0 filas en toda la historia**. En su lugar entra
 * **«Abono»** —plata que la persona pagó por fuera, de su bolsillo—, que es el
 * caso que el sistema ya nombraba en el concepto histórico «Abono extra».
 */
export const ORIGENES_QUE_SE_OFRECEN: readonly OrigenPago[] = [
  "Abono",
  "Décimo",
  "Vacaciones",
  "Liquidación",
];

/**
 * El que escribe el botón «Aplicar quincena». **No es el que viene puesto en el
 * formulario** — ahí no viene ninguno (ver `ORIGENES_QUE_SE_OFRECEN`).
 */
export const ORIGEN_POR_DEFECTO: OrigenPago = "Quincena";

export function esOrigenPago(v: unknown): v is OrigenPago {
  return typeof v === "string" && (ORIGENES_PAGO as readonly string[]).includes(v);
}

/**
 * 🔑 ¿Este movimiento es «el descuento de la quincena»?
 *
 * Con `origen_pago` escrito, es exactamente `Quincena`. Sin él —los 443
 * movimientos anteriores— se asume que SÍ: son las filas que el freno viejo
 * tenía que atrapar y dejaba pasar por cómo estaba escrita la nota. Asumir que
 * sí es lo conservador: en la duda se OMITE, nunca se cobra dos veces.
 */
export function esPagoDeQuincena(m: { concepto: string; origen_pago?: string | null }): boolean {
  if (m.concepto !== CONCEPTO_PAGO) return false;
  const o = String(m.origen_pago ?? "").trim();
  return o === "" || o === ORIGEN_POR_DEFECTO;
}
