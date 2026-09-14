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
import { CASILLAS_AUTOMATICAS, esCasillaAutomatica, valorTecleado, type CasillaAutomatica } from "./casilla-sin-descontar";
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

// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO — cuando lo ESCRITO A MANO deja el neto en negativo (14-sep-2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// El recorte de arriba solo achica lo AUTOMÁTICO: lo escrito a mano manda
// (punto 3). O sea que un neto negativo hecho de montos a mano SÍ puede salir
// —y salir al Excel, al comprobante y al cierre— sin que nadie lo haya visto.
// Caso real medido el 14-sep-2026: colaborador 56 (Boston, 1–15 sep), bruto
// $74,84, sin préstamo; con $200 de mercancía escritos a mano, neto −$125,16.
//
// Daniel aprobó DOS AVISOS y dejó el freno del cierre para después, A PROPÓSITO:
// el caso nunca ha pasado y la contadora recién está aprendiendo el módulo, así
// que el aviso le enseña y el freno la bloquearía. 🔴 Por eso `frenosParaCerrar`
// NO se toca: sigue frenando solo por horas extra sin decidir.
//
//   1. LA CELDA AVISA AL ESCRIBIR: se marca y dice el máximo que cabe y cuánto
//      quedaría («El máximo es $74.84. Le quedaría −$125.16.»). Se sigue
//      pudiendo escribir y guardar: NUNCA es un bloqueo — lo escrito a mano
//      manda, ésa es la regla de la casa.
//   2. «ANTES DE CERRAR» LO NOMBRA, en la parte de arreglar, con cuántos son,
//      quiénes y el enlace a su fila del cuadro.
//   3. 🔴 LOS DOS SALEN DE LA MISMA FUNCIÓN (`faltanteDeNeto`): que la celda y
//      «Antes de cerrar» puedan decir cosas distintas del mismo hecho es lo que
//      esta casa evita.
//   4. 🔴 SE MIRA EL NETO QUE DE VERDAD SE PAGA. La ruta arma el neto así:
//      motor (con los manuales) → cuota automática → ajuste de la quincena
//      anterior → recorte. `dinero.netoPagar` es ese final. Para simular lo
//      tecleado sin volver al servidor, `netoSiEscribe` deshace el recorte
//      (`prestamoAutomatico.recortado` dice cuánto se devolvió), cambia SOLO
//      esa casilla y vuelve a recortar lo automático — la misma cuenta que
//      `recortarAlNeto`, al revés y de nuevo.


/**
 * 🔴 LA ÚNICA DECISIÓN: ¿este neto queda negativo y por cuánto?
 * Devuelve lo que FALTA (positivo) o `null` si el neto es cero o más. La leen
 * la celda (sobre el neto simulado) y «Antes de cerrar» (sobre el de la ruta).
 */
export function faltanteDeNeto(neto: number): number | null {
  const n = centavos(num(neto));
  return n < 0 ? centavos(-n) : null;
}

/** Lo que una línea necesita para simular el neto sin volver al servidor. */
export type LineaParaNeto = {
  manuales: ManualesLinea;
  dinero: DineroLinea | null;
  prestamoAutomatico?: PrestamoAutomatico;
};

/** La cuota que SE PROPONÍA en una casilla automática: lo que entró + lo recortado. */
function propuestaDe(auto: PrestamoAutomatico | undefined, cuenta: CasillaAutomatica): number {
  return centavos(Math.max(0, num(auto?.[cuenta])) + Math.max(0, num(auto?.recortado?.[cuenta])));
}

/**
 * El neto que DE VERDAD se pagaría si la casilla `campo` llevara lo tecleado.
 *
 * - `neto`: después del recorte de lo automático, como lo devolvería la ruta.
 * - `maximo`: lo más que cabe en ESA casilla sin que el neto baje de cero (para
 *   «Otros servicios», que suma, no aplica: `null`). Nunca negativo: si otra
 *   casilla ya dejó el neto en rojo, acá cabe $0.00.
 *
 * `null` sin dinero (una línea que no paga no tiene neto que cuidar).
 */
export function netoSiEscribe(
  linea: LineaParaNeto,
  campo: keyof ManualesLinea,
  tecleado: unknown,
): { neto: number; maximo: number | null; casilla: number } | null {
  const d = linea.dinero;
  if (!d) return null;
  const auto = linea.prestamoAutomatico;
  const rec = auto?.recortado;
  const devuelto = centavos(num(rec?.prestamo) + num(rec?.terceros) + num(rec?.mercancia));
  // El neto ANTES de la red de seguridad: lo que la cuenta daba sin recortar.
  const netoSinRecorte = centavos(num(d.netoPagar) - devuelto);

  const esAuto = esCasillaAutomatica(campo);
  // Lo que esa casilla lleva HOY, antes del recorte (lo escrito, o la cuota entera).
  const hoy = esAuto
    ? centavos(num(d[campo]) + num(rec?.[campo]))
    : centavos(num(d[campo]));

  const v = valorTecleado(campo, tecleado);
  let nueva: number;
  let recortable = 0;
  if (esAuto) {
    // Vacía → vuelve la cuota, que SÍ se recorta. Escrita (o 0) → manda, no se recorta.
    if (v === null) { nueva = propuestaDe(auto, campo); recortable = nueva; }
    else nueva = centavos(v);
  } else {
    nueva = centavos(v ?? 0);
  }
  // Lo automático de las OTRAS casillas: la ruta lo recorta antes de dejar el neto en rojo.
  let recortableOtras = 0;
  for (const c of CASILLAS_AUTOMATICAS) {
    if (c === campo) continue;
    recortableOtras = centavos(recortableOtras + propuestaDe(auto, c));
  }
  recortable = centavos(recortable + recortableOtras);

  const suma = campo === "otrosServicios";
  const antes = suma
    ? centavos(netoSinRecorte - hoy + nueva)
    : centavos(netoSinRecorte + hoy - nueva);
  const neto = antes >= 0 ? antes : centavos(Math.min(0, antes + recortable));
  const maximo = suma ? null : centavos(Math.max(0, netoSinRecorte + hoy + recortableOtras));
  return { neto, maximo, casilla: nueva };
}

/** Lo que la celda dice cuando lo tecleado deja el neto en negativo. */
export interface AvisoCeldaNeto {
  /** Lo más que cabe en esa casilla. `null` en «Otros servicios» (suma). */
  maximo: number | null;
  /** Cuánto queda por debajo de cero (positivo). */
  faltante: number;
}

/**
 * El aviso de UNA celda con lo que se está tecleando, o `null`.
 *
 * 🔑 Avisa la casilla que LLEVA plata: una casilla en 0 no puede ser la causa,
 * y avisar en las cinco a la vez taparía la que sí es. En «Otros servicios»
 * avisa solo si BAJARLO es lo que deja el neto en rojo.
 */
export function avisoCeldaNeto(
  linea: LineaParaNeto,
  campo: keyof ManualesLinea,
  tecleado: unknown,
): AvisoCeldaNeto | null {
  const r = netoSiEscribe(linea, campo, tecleado);
  if (!r) return null;
  const faltante = faltanteDeNeto(r.neto);
  if (faltante === null) return null;
  if (campo === "otrosServicios") {
    const hoy = centavos(num(linea.dinero?.otrosServicios));
    return r.casilla < hoy ? { maximo: null, faltante } : null;
  }
  if (r.casilla <= 0) return null;
  return { maximo: r.maximo, faltante };
}

/** «El máximo es $74.84. Le quedaría −$125.16.» */
export function textoAvisoCeldaNeto(a: AvisoCeldaNeto): string {
  const queda = `Le quedaría −${plata(a.faltante)}.`;
  return a.maximo === null ? queda : `El máximo es ${plata(a.maximo)}. ${queda}`;
}

/** El `title` de esa celda: es un aviso, no un freno. */
export const TITULO_NETO_NEGATIVO =
  "Con ese monto el neto queda por debajo de cero. Se puede guardar igual: lo escrito a mano manda. Revísalo antes de cerrar.";

/** Una línea del cuadro cuyo neto quedó en negativo, para «Antes de cerrar». */
export interface NetoNegativo {
  codigo: string;
  etiqueta: string;
  /** Cuánto queda por debajo de cero (positivo). */
  faltante: number;
}

/**
 * Los netos negativos de un cuadro, de las MISMAS líneas que dibuja la tabla:
 * `dinero.netoPagar` ya es el neto final de la ruta, y la decisión es la MISMA
 * `faltanteDeNeto` de la celda.
 */
export function netosNegativos(
  lineas: readonly { codigo: string; etiqueta: string; dinero: DineroLinea | null }[],
): NetoNegativo[] {
  const out: NetoNegativo[] = [];
  for (const l of lineas) {
    if (!l.dinero) continue;
    const faltante = faltanteDeNeto(l.dinero.netoPagar);
    if (faltante === null) continue;
    out.push({ codigo: l.codigo, etiqueta: l.etiqueta, faltante });
  }
  return out;
}

/**
 * La línea de «Antes de cerrar»: «colaborador queda con neto negativo (Ana
 * Pérez · −$125.16): baja lo que le escribiste a mano en su fila». `null` sin
 * ninguno — un cartel permanente se deja de leer.
 */
export function textoNetosNegativos(items: readonly NetoNegativo[]): string | null {
  if (items.length === 0) return null;
  const detalle = items.map((n) => `${n.etiqueta} · −${plata(n.faltante)}`).join(" — ");
  const cabeza = items.length === 1
    ? "colaborador queda con neto negativo"
    : "colaboradores quedan con neto negativo";
  const arreglo = items.length === 1 ? "en su fila" : "en sus filas";
  return `${cabeza} (${detalle}): baja lo que le escribiste a mano ${arreglo}`;
}

/** El ancla de la fila de ese colaborador en el cuadro (la lleva `data-fila-planilla`). */
export function hrefFilaPlanilla(codigo: string): string {
  return `#planilla-fila-${encodeURIComponent(codigo)}`;
}
