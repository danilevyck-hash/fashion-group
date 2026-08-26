/* ─────────────────────────────────────────────────────────────────────────────
 * LA APROBACIÓN DE LAS HORAS EXTRA.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`.
 *
 * ── 🔴 LA REGLA, DE LA CONTADORA, TEXTUAL ───────────────────────────────────
 *
 *   *«Sólo se pagan las horas extras autorizadas y las reportadas por Julio
 *   Garay. La tardanza que se perdona es hasta 10:00 minutos solamente, que es
 *   período de gracia.»*
 *
 * La tolerancia de los 10 minutos YA EXISTE (`toleranciaTardanzaMin` en
 * `asistencia_reglas`) y coincide con lo que ella hace: acá no se toca.
 *
 * Lo que faltaba es la otra mitad: hasta hoy la planilla pagaba TODOS los
 * minutos que el reloj midió. El reloj mide bien; lo que el reloj no sabe es
 * **quién autorizó qué**. Por eso la planilla nunca cuadraba con ella.
 *
 * ── 🔴 LO QUE SE GUARDA ES UN PERMISO, NUNCA UN NÚMERO ───────────────────────
 *
 * Ésta es la decisión de diseño que sostiene todo el archivo, y existe por un
 * hallazgo medido contra producción el 25-ago-2026: **la contadora no cuenta
 * las horas extra como el módulo**. Tres diferencias, ninguna confirmada
 * todavía por Daniel:
 *
 *   · su base de salida es las **16:30**, no las 17:00 (su propia tabla lo
 *     muestra: `16:39:07 → 0:09:07`, y con las marcaciones reales de BRICEIDA
 *     MONTERO contando desde 16:30 da 5:32:45, su número al segundo);
 *   · su período de horas extra va del **13 al 27 de julio**, corrido respecto
 *     de la quincena del 16 al 31;
 *   · redondea a **cuartos de hora** (5,55 h → 5,50 h).
 *
 * Si mañana cualquiera de las tres cambia, los minutos de todas las personas
 * cambian. Una aprobación que guardara «Briceida: 5,5 h autorizadas» quedaría
 * atada a un número viejo y pagaría lo de ayer sin que nadie lo note.
 *
 * 🔑 POR ESO LA APROBACIÓN ES UN BOOLEANO SOBRE (persona, período) Y NADA MÁS.
 * Los minutos SIEMPRE los vuelve a calcular el motor de siempre
 * (`clasificarDia`), con la base de cálculo que esté vigente ese día. Lo que se
 * guarda del número es un TESTIGO (`minutosVistos`): cuánto había cuando quien
 * aprobó apretó el botón. No se paga con él — se compara contra él, y si no
 * coinciden la pantalla lo dice con los dos números a la vista. Cambiar la
 * salida de 17:00 a 16:30 no obliga a tocar una línea de acá.
 *
 * ── 🔴 Y LO NO APROBADO NO SE ESCONDE ────────────────────────────────────────
 *
 * No se paga —es lo que dice la contadora— pero SE DICE en pantalla, en ámbar,
 * con nombre y cantidad. Regla firme de Daniel: *«lo que un guard rechaza se
 * DICE en pantalla»*. Rechazar sí, esconder no. Es la misma forma que ya tienen
 * las vacaciones «ya se le pagó» (`textoVacacionesNoPagadas`).
 * ────────────────────────────────────────────────────────────────────────── */

import { clasificarDia, fechaCorta, type LineaPlanilla } from "./planilla";
import type { ReglasAsistencia } from "./config";
import type { PersonaReporte } from "./reporte";

/** El archivo que Daniel tiene que correr. Se le muestra tal cual al usuario. */
export const MIGRACION_APROBACIONES =
  "20260829120000_asistencia_horas_extra_aprobadas.sql";
export const TABLA_APROBACIONES = "asistencia_horas_extra_aprobadas";

/**
 * 🔴 SIN LA TABLA CORRIDA SE PAGA TODO, COMO HOY. No es un descuido: la app
 * tiene que funcionar sin la DDL (varias se quedaron pendientes semanas en este
 * proyecto), y el fail-closed acá sería dejar a treinta personas sin sus horas
 * extra de golpe porque falta un archivo. Se avisa con este texto.
 */
export function avisoMigracionAprobaciones(): string {
  return (
    "Las horas extra todavía no se pueden aprobar: falta preparar la base. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_APROBACIONES} en Supabase. `
    + "Mientras tanto la planilla paga todas las horas extra que midió el reloj, "
    + "como hasta ahora."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA LLAVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persona + período EXACTO.
 *
 * 🔑 Las fechas van en la llave a propósito, y no la clave de quincena
 * («2026-07-2»). El período de horas extra de la contadora está CORRIDO respecto
 * de la quincena (13 al 27 vs. 16 al 31): si mañana el período se mueve, una
 * llave por quincena haría que una aprobación vieja cubriera días que nadie
 * miró. Con las fechas adentro, otro período es otra aprobación y se vuelve a
 * preguntar — que es lo correcto cuando cambió lo que se está aprobando.
 */
export function claveAprobacion(codigo: string, desde: string, hasta: string): string {
  return `${String(codigo).trim()}|${desde}|${hasta}`;
}

/** Una aprobación guardada, tal como la lee el módulo. */
export interface Aprobacion {
  codigo: string;
  /** YYYY-MM-DD */
  desde: string;
  /** YYYY-MM-DD */
  hasta: string;
  /** `false` = se desaprobó. La fila NO se borra: el registro se conserva. */
  aprobado: boolean;
  /**
   * 🔑 EL TESTIGO, NO EL PAGO. Cuántos minutos de hora extra había medidos
   * cuando alguien tocó el botón. No se paga con este número: se compara.
   */
  minutosVistos: number;
  /** Quién lo tocó por última vez. */
  por: string | null;
  /** Cuándo, en ISO. */
  cuando: string | null;
}

/** Código → su aprobación en ESTE período. */
export function indexarAprobaciones(
  filas: readonly Aprobacion[],
): Map<string, Aprobacion> {
  const out = new Map<string, Aprobacion>();
  for (const a of filas) out.set(String(a.codigo).trim(), a);
  return out;
}

/**
 * ¿Se le pagan las horas extra a esta persona?
 *
 * ⚠️ Sin fila es NO. El default es no pagar, que es exactamente lo que pidió la
 * contadora: se paga lo autorizado, y lo que nadie miró no está autorizado.
 * El interruptor que decide si esta pregunta se hace siquiera es
 * `exigirAprobacion`, y ése sí depende de que la tabla exista.
 */
export function estaAprobado(a: Aprobacion | undefined | null): boolean {
  return a?.aprobado === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL DETALLE POR DÍA — se calcula, no se guarda
// ─────────────────────────────────────────────────────────────────────────────

/** Un día con horas extra medidas. Solo para MOSTRAR al desplegar la fila. */
export interface DiaExtra {
  /** YYYY-MM-DD */
  fecha: string;
  /** «13 jul 2026» */
  etiqueta: string;
  /** Hora de salida marcada, «HH:MM». */
  salida: string | null;
  minutos: number;
  diurnoMin: number;
  nocturnoMin: number;
}

/**
 * Los días del período en que esta persona hizo horas extra.
 *
 * 🔴 SALE DEL MISMO `clasificarDia` QUE PAGA. No es una segunda cuenta: si la
 * base de salida cambia de 17:00 a 16:30, este detalle cambia solo, junto con
 * el pago. Una copia del reparto acá sería la forma de que la pantalla y la
 * planilla digan cosas distintas el día que se toque el motor.
 */
export function diasConExtra(
  p: PersonaReporte,
  reglas: ReglasAsistencia,
): DiaExtra[] {
  const out: DiaExtra[] = [];
  for (const d of p.dias) {
    const c = clasificarDia(d, reglas);
    const minutos = c.extraDiurnoMin + c.extraNocturnoMin;
    if (minutos <= 0) continue;
    out.push({
      fecha: d.fecha,
      etiqueta: fechaCorta(d.fecha),
      salida: d.salida ?? null,
      minutos,
      diurnoMin: c.extraDiurnoMin,
      nocturnoMin: c.extraNocturnoMin,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA FILA DE LA PESTAÑA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una persona con horas extra en el período.
 *
 * 🔴 LA UNIDAD DE APROBACIÓN ES LA PERSONA-Y-PERÍODO, NO EL DÍA. Daniel fue
 * explícito: *«con un clic se aprueba y ya, maximo 3 clics»*. Día por día,
 * una quincena de doce días serían doce clics POR PERSONA. Y no se pierde nada
 * del cálculo: el reparto 1,25 / 1,50 lo sigue haciendo `clasificarDia` día por
 * día, exactamente igual — lo único que decide la aprobación es si esa persona
 * cobra sus extras de este período. El detalle por día viaja igual, en `dias`,
 * y se despliega si alguien quiere verlo: mirar NO es un clic obligatorio.
 */
export interface FilaAprobacion {
  codigo: string;
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Minutos de hora extra medidos HOY, con la base de cálculo vigente. */
  minutos: number;
  diurnoMin: number;
  nocturnoMin: number;
  /** Lo que se pagaría. `null` si a esa persona no se le pudo calcular pago. */
  monto: number | null;
  aprobado: boolean;
  por: string | null;
  cuando: string | null;
  /** El testigo guardado. `null` si nunca se tocó. */
  minutosVistos: number | null;
  /**
   * 🔴 Los minutos de HOY no son los que había cuando se aprobó. Pasa si se
   * corrigió una marcación, o si cambió la base de cálculo (17:00 → 16:30). Se
   * dice con los dos números; no se desaprueba solo, porque una plata que
   * desaparece sola es peor que una que se explica.
   */
  cambio: boolean;
  dias: DiaExtra[];
}

/** Minutos → «5,5 h». Una sola forma de escribirlo en todo el módulo. */
export function horasBonitas(minutos: number): string {
  const h = Math.round((minutos / 60) * 100) / 100;
  return `${h.toFixed(2).replace(".", ",")} h`;
}

export interface OpcionesFilas {
  /** Las líneas de la planilla del período, ya calculadas. */
  lineas: readonly LineaPlanilla[];
  /** Lo que salió del motor del reporte, para el detalle por día. */
  personas: readonly PersonaReporte[];
  reglas: ReglasAsistencia;
  /** Código → aprobación guardada. */
  aprobaciones: ReadonlyMap<string, Aprobacion>;
}

/**
 * Las filas de la pestaña: TODA persona con horas extra medidas en el período,
 * aprobada o no.
 *
 * ⚠️ Aparecen también las YA APROBADAS. Una lista que solo muestra pendientes
 * no deja desaprobar nada, y un clic de más no puede ser irreversible.
 */
export function armarFilasAprobacion(opts: OpcionesFilas): FilaAprobacion[] {
  const reporteDe = new Map(opts.personas.map((p) => [p.codigo, p]));
  const filas: FilaAprobacion[] = [];

  for (const l of opts.lineas) {
    // 🔑 `extraMedido` es SIEMPRE lo que midió el reloj, esté aprobado o no.
    // `l.horas` puede venir con los extras en cero justamente porque no estaban
    // aprobados; leer de ahí haría desaparecer de esta lista a la gente que
    // falta aprobar, que es toda la gente que esta pantalla existe para mostrar.
    const medido = l.extraMedido;
    if (!medido || medido.minutos <= 0) continue;

    const a = opts.aprobaciones.get(l.codigo);
    const p = reporteDe.get(l.codigo);
    filas.push({
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      empresa: l.empresa,
      empresaEtiqueta: l.empresaEtiqueta,
      minutos: medido.minutos,
      diurnoMin: medido.diurnoMin,
      nocturnoMin: medido.nocturnoMin,
      monto: medido.monto,
      aprobado: estaAprobado(a),
      por: a?.por ?? null,
      cuando: a?.cuando ?? null,
      minutosVistos: a ? a.minutosVistos : null,
      cambio: a != null && a.aprobado === true && a.minutosVistos !== medido.minutos,
      dias: p ? diasConExtra(p, opts.reglas) : [],
    });
  }

  // Primero lo que falta aprobar —es a lo que se entra—, y adentro de cada
  // grupo, más horas arriba: si alguien va a mirar una sola fila, que sea ésa.
  return filas.sort((x, y) => {
    if (x.aprobado !== y.aprobado) return x.aprobado ? 1 : -1;
    if (x.minutos !== y.minutos) return y.minutos - x.minutos;
    return x.etiqueta.localeCompare(y.etiqueta, "es");
  });
}

/** Cuántas faltan y cuántas horas suman. Es lo que dice el botón «Aprobar todas». */
export function resumenPendientes(filas: readonly FilaAprobacion[]): {
  personas: number;
  minutos: number;
  codigos: string[];
} {
  const pend = filas.filter((f) => !f.aprobado);
  return {
    personas: pend.length,
    minutos: pend.reduce((a, f) => a + f.minutos, 0),
    codigos: pend.map((f) => f.codigo),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE NO SE PAGÓ, ESCRITO
// ─────────────────────────────────────────────────────────────────────────────

/** Una persona a la que la planilla NO le pagó las horas extra. */
export interface ExtraNoAprobada {
  codigo: string;
  etiqueta: string;
  minutos: number;
  monto: number | null;
}

/**
 * El aviso ámbar de arriba de la planilla. `null` cuando no hay ninguna — un
 * cartel permanente es un cartel que se deja de leer (misma regla que el resto
 * del módulo).
 *
 * 🔴 VA CON NOMBRE Y CANTIDAD, persona por persona. Un «hay horas sin aprobar»
 * sin decir de quién obliga a abrir otra pantalla para saber qué pasó, y eso es
 * exactamente lo que hace que un aviso no se lea.
 */
export function textoExtraNoAprobada(
  items: readonly ExtraNoAprobada[],
): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map((v) => {
      const plata = v.monto === null ? "" : ` · $${v.monto.toFixed(2)}`;
      return `${v.etiqueta} · ${horasBonitas(v.minutos)}${plata}`;
    })
    .join(" — ");
  const cabeza =
    items.length === 1
      ? "1 persona tiene horas extra sin aprobar: NO se pagaron en este cuadro."
      : `${items.length} personas tienen horas extra sin aprobar: NO se pagaron en este cuadro.`;
  return `${cabeza} Se aprueban en la pestaña Aprobaciones. ${detalle}`;
}

/** Lo que se saca de las líneas para armar ese aviso. */
export function extrasNoAprobadas(
  lineas: readonly LineaPlanilla[],
): ExtraNoAprobada[] {
  return lineas
    .filter((l) => l.extraMedido !== null && l.extraMedido.minutos > 0 && !l.extraAprobada)
    .map((l) => ({
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      minutos: l.extraMedido!.minutos,
      monto: l.extraMedido!.monto,
    }));
}
