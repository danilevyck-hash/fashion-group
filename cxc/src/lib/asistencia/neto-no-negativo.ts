/* ─────────────────────────────────────────────────────────────────────────────
 * EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO (14-sep-2026).
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel, textual: *«a) Que nunca pase del neto: descuenta lo que alcance y el
 * resto queda debiendo»*. Y aclaró que es una RED DE SEGURIDAD, no el caso
 * normal: *«si dañó 100, ella como persona normal pondrá 25 de cuota»*.
 *
 * ── 🩸 QUÉ VINO A CERRAR ────────────────────────────────────────────────────
 *
 * El motor calcula `neto = bruto − deducciones + otros servicios` sin ningún
 * piso, y `aplicarPrestamoEnLinea` le resta las tres cuotas automáticas sin
 * mirar cuánto quedaba. Nada impedía que un neto saliera en negativo: la
 * planilla lo habría mostrado en rojo, el Excel y el comprobante lo habrían
 * impreso, y el cierre habría anotado en Préstamos un pago de plata que nunca
 * salió de ningún sueldo. Medido el 14-sep-2026 contra producción: la cuota
 * más pesada es la de LUIS PARAJON, **$70 sobre un neto de ~$262 (27 %)** —
 * hoy nadie está cerca. Pero el daño de $1.261,50 que justificó la cuota
 * existe, y con una cuota grande sobre una quincena corta (ausencias, tardanzas,
 * entrada a mitad de quincena) el negativo era cuestión de tiempo.
 *
 * ── 🔴 LA REGLA ────────────────────────────────────────────────────────────
 *
 *   1. Se descuenta lo que alcance; el neto queda en 0, nunca por debajo.
 *   2. Lo que no se alcanzó a cobrar **queda debiendo**: el saldo NO se toca
 *      (el cierre anota como pago SOLO lo que de verdad salió del sueldo,
 *      porque lee `dinero.<cuenta>` ya recortado). Se cobra la próxima.
 *   3. 🔴 EL RECORTE VA SOBRE LO AUTOMÁTICO, NUNCA SOBRE LO ESCRITO A MANO. Si
 *      una persona escribió un monto en la casilla, ése manda: es una decisión
 *      humana y el sistema no la corrige. Por eso esta función solo achica
 *      `prestamoAutomatico`, y un neto negativo hecho SOLO de montos a mano
 *      se queda como está (misma referencia).
 *   4. 🔴 EL ORDEN DEL RECORTE ES INVERSO A LA ANTIGÜEDAD DEL COMPROMISO:
 *      primero el DAÑO, después TERCEROS, y el PRÉSTAMO al final. El préstamo
 *      es el compromiso más viejo y más formal (plata que la empresa entregó);
 *      el daño es el que acaba de entrar. Es una decisión de construcción, no
 *      de Daniel — está escrita para que sea consistente y discutible.
 *   5. 🔴 SE DICE. En la celda («Se descontó $10.00 de los $25.00 de cuota; el
 *      resto queda debiendo») y en «Antes de cerrar». Un recorte silencioso es
 *      exactamente lo que esta casa no hace.
 *
 * ⚠️ El ISR sigue a mano (Daniel: *«a) Déjalo a mano, como ahora»*) y entra en
 * la cuenta del neto disponible como ya entraba: acá no se toca.
 *
 * 🔑 Dónde corre: al FINAL de la ruta de la planilla, después de la cuota y del
 * ajuste de la quincena anterior — el neto que se mira es el que se paga.
 * ────────────────────────────────────────────────────────────────────────── */

import { centavos } from "./planilla";
import type { DineroLinea, ManualesLinea } from "./planilla";
import type { CasillaAutomatica } from "./casilla-sin-descontar";
import type { PrestamoAutomatico } from "./prestamos-planilla";

/**
 * 🔴 En qué orden se recorta cuando el neto no alcanza: del compromiso más
 * nuevo al más viejo. Ver el punto 4 del encabezado.
 */
export const ORDEN_DE_RECORTE: readonly CasillaAutomatica[] = ["mercancia", "terceros", "prestamo"];

/** Lo que NO entró de cada cuota automática porque el neto no alcanzó. */
export type Recorte = Record<CasillaAutomatica, number>;

const SIN_RECORTE: Recorte = { prestamo: 0, terceros: 0, mercancia: 0 };

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Recorta las cuotas automáticas hasta que el neto deje de ser negativo.
 *
 * Sin `dinero`, sin cuota automática o con el neto ya en cero o más, devuelve
 * la MISMA referencia: no hay nada que hacer. Con recorte, `dinero.<cuenta>`,
 * `totalDeducciones` y `netoPagar` se mueven por la MISMA cuenta que
 * `aplicarPrestamoEnLinea` (al revés), `prestamoAutomatico.<cuenta>` baja a lo
 * que sí entró, y `prestamoAutomatico.recortado` dice cuánto quedó afuera.
 */
export function recortarAlNeto<
  L extends { manuales: ManualesLinea; dinero: DineroLinea | null; prestamoAutomatico?: PrestamoAutomatico },
>(linea: L): L {
  const d = linea.dinero;
  const auto = linea.prestamoAutomatico;
  if (!d || !auto) return linea;
  let faltante = centavos(-num(d.netoPagar));
  if (faltante <= 0) return linea;

  const recortado: Recorte = { ...SIN_RECORTE };
  const nuevoAuto: PrestamoAutomatico = { ...auto };
  const dinero: DineroLinea = { ...d };
  for (const cuenta of ORDEN_DE_RECORTE) {
    if (faltante <= 0) break;
    const entro = centavos(Math.max(0, num(auto[cuenta])));
    if (entro <= 0) continue;
    const quitar = centavos(Math.min(entro, faltante));
    recortado[cuenta] = quitar;
    nuevoAuto[cuenta] = centavos(entro - quitar);
    // 🔴 Solo la parte AUTOMÁTICA sale de la columna: lo escrito a mano sigue
    // adentro de `dinero.<cuenta>` tal cual.
    dinero[cuenta] = centavos(d[cuenta] - quitar);
    dinero.totalDeducciones = centavos(dinero.totalDeducciones - quitar);
    dinero.netoPagar = centavos(dinero.netoPagar + quitar);
    faltante = centavos(faltante - quitar);
  }
  const hubo = recortado.prestamo > 0 || recortado.terceros > 0 || recortado.mercancia > 0;
  if (!hubo) return linea;
  nuevoAuto.recortado = recortado;
  return { ...linea, dinero, prestamoAutomatico: nuevoAuto };
}

/** Una cuota que no entró entera, para «Antes de cerrar». */
export interface CuotaRecortada {
  codigo: string;
  etiqueta: string;
  cuenta: CasillaAutomatica;
  /** Lo que Préstamos proponía. */
  propuesto: number;
  /** Lo que de verdad se descontó (puede ser 0). */
  descontado: number;
}

/** El recorte de UNA casilla de UNA línea, o `null` si no hubo. */
export function recorteDeCasilla(
  l: { prestamoAutomatico?: PrestamoAutomatico },
  cuenta: CasillaAutomatica,
): { propuesto: number; descontado: number } | null {
  const r = num(l.prestamoAutomatico?.recortado?.[cuenta]);
  if (r <= 0) return null;
  const descontado = centavos(Math.max(0, num(l.prestamoAutomatico?.[cuenta])));
  return { propuesto: centavos(descontado + r), descontado };
}

/** Las cuotas recortadas de un cuadro, en el orden de las líneas. */
export function cuotasRecortadas(
  lineas: readonly { codigo: string; etiqueta: string; prestamoAutomatico?: PrestamoAutomatico }[],
): CuotaRecortada[] {
  const out: CuotaRecortada[] = [];
  for (const l of lineas) {
    for (const cuenta of ORDEN_DE_RECORTE) {
      const r = recorteDeCasilla(l, cuenta);
      if (!r) continue;
      out.push({ codigo: l.codigo, etiqueta: l.etiqueta, cuenta, ...r });
    }
  }
  return out;
}

const plata = (n: number): string => `$${n.toFixed(2)}`;

/** Lo que dice la celda, visible, debajo del número. */
export function textoRecorteCelda(r: { propuesto: number; descontado: number }): string {
  return `Se descontó ${plata(r.descontado)} de los ${plata(r.propuesto)} de cuota; el resto queda debiendo`;
}

/** El `title` de esa celda: por qué. */
export const TITULO_RECORTE =
  "El neto no alcanzaba para la cuota completa: se descontó lo que alcanzó y el resto sigue debiéndose. Se cobra en la próxima quincena.";

/** Cómo se nombra la cuenta en la línea de «Antes de cerrar». */
const NOMBRE_CUENTA: Readonly<Record<CasillaAutomatica, string>> = {
  prestamo: "préstamo",
  terceros: "terceros",
  mercancia: "daño de mercancía",
};

/**
 * La línea de «Antes de cerrar»:
 * «1 cuota recortada para que el neto no quede en negativo (Ana Pérez · daño de
 * mercancía $10.00 de $25.00); el resto queda debiendo».
 * `null` sin ninguna — un cartel permanente se deja de leer.
 */
export function textoCuotasRecortadas(items: readonly CuotaRecortada[]): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map((c) => `${c.etiqueta} · ${NOMBRE_CUENTA[c.cuenta]} ${plata(c.descontado)} de ${plata(c.propuesto)}`)
    .join(" — ");
  const cabeza = items.length === 1
    ? "cuota recortada para que el neto no quede en negativo"
    : "cuotas recortadas para que el neto no quede en negativo";
  return `${cabeza} (${detalle}); el resto queda debiendo`;
}
