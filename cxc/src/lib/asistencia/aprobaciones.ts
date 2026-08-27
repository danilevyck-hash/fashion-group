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
  "20260901120000_aprobaciones_por_dia.sql";
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
 * («2026-07-2»), ni el PERÍODO, que es como se guardaba hasta el 27-ago-2026.
 *
 * 🔴 EL CORTE DE LA QUINCENA LO MUEVE LA CONTADORA. Ella cuenta del 13 al 27, no
 * del 16 al 31, y avisó que *«las fechas van a variar»*. Con la llave por
 * período, cada corrimiento del corte volvía a preguntar TODO desde cero —
 * Julio aprobaba dos veces lo mismo. Un DÍA, en cambio, es un hecho: «el martes
 * 5 Kevin se quedó hasta las 7». El período que se arme después recoge los días
 * que caen adentro, corte donde corte.
 */
export function claveDia(codigo: string, fecha: string): string {
  return `${String(codigo).trim()}|${fecha}`;
}

/** Una aprobación guardada, tal como la lee el módulo. */
export interface Aprobacion {
  codigo: string;
  /** El DÍA aprobado. YYYY-MM-DD */
  fecha: string;
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

/** `codigo|fecha` → su aprobación. */
export function indexarAprobaciones(
  filas: readonly Aprobacion[],
): Map<string, Aprobacion> {
  const out = new Map<string, Aprobacion>();
  for (const a of filas) out.set(claveDia(a.codigo, a.fecha), a);
  return out;
}

/**
 * ¿Se le pagan las horas extra de ESE DÍA?
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
// LA PANTALLA: DÍAS, Y ADENTRO LA GENTE
// ─────────────────────────────────────────────────────────────────────────────

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Los tres números de una fecha. Sin `new Date()`: el texto YA es el día. */
function partes(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = fecha.split("-").map(Number);
  return { y, m, d };
}

/**
 * El día de la semana, contado con Zeller.
 *
 * 🔑 A propósito NO se usa `new Date(fecha)`: eso interpreta el texto como
 * MEDIANOCHE UTC, y en Panamá (UTC−5) esa medianoche todavía es el día
 * anterior. La pantalla diría «dom 16» sobre un lunes. La aritmética pura no
 * tiene zona horaria y no puede equivocarse por eso.
 */
export function diaDeLaSemana(fecha: string): number {
  let { y, m, d } = partes(fecha);
  if (m < 3) { m += 12; y -= 1; }
  const k = y % 100, j = Math.floor(y / 100);
  const h = (d + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  return (h + 6) % 7; // 0 = domingo
}

/** «lun 17 ago» */
export function etiquetaDia(fecha: string): string {
  const { m, d } = partes(fecha);
  return `${DOW[diaDeLaSemana(fecha)]} ${d} ${MES[m - 1]}`;
}

/** El LUNES de esa semana, como YYYY-MM-DD. Es la llave para agrupar. */
export function lunesDe(fecha: string): string {
  const { y, m, d } = partes(fecha);
  const dow = diaDeLaSemana(fecha);
  const atras = (dow + 6) % 7; // lunes = 0 días atrás
  // Aritmética de calendario a mano, por el mismo motivo que arriba.
  let dd = d - atras, mm = m, yy = y;
  while (dd < 1) {
    mm -= 1;
    if (mm < 1) { mm = 12; yy -= 1; }
    dd += diasDelMes(yy, mm);
  }
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function diasDelMes(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Una persona dentro de un día. Es lo que se aprueba. */
export interface PersonaEnDia {
  codigo: string;
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Hora de salida marcada, «HH:MM». Es lo que Julio reconoce. */
  salida: string | null;
  minutos: number;
  diurnoMin: number;
  nocturnoMin: number;
  aprobado: boolean;
  por: string | null;
  cuando: string | null;
  /** El testigo guardado. `null` si nunca se tocó. */
  minutosVistos: number | null;
  /**
   * 🔴 Los minutos de HOY no son los que había cuando se aprobó. Pasa si se
   * corrigió una marcación o si cambió la base de cálculo (17:00 → 16:30). Se
   * dice con los dos números; no se desaprueba solo, porque una plata que
   * desaparece sola es peor que una que se explica.
   */
  cambio: boolean;
}

/** Un día con la gente que hizo horas extra. */
export interface DiaAprobacion {
  /** YYYY-MM-DD */
  fecha: string;
  /** «lun 17 ago» */
  etiqueta: string;
  /** El lunes de su semana: la llave para agrupar. */
  semana: string;
  minutos: number;
  gente: PersonaEnDia[];
}

export interface OpcionesDias {
  /** Las líneas de la planilla del período, ya calculadas. */
  lineas: readonly LineaPlanilla[];
  /** Lo que salió del motor del reporte: de ahí sale el detalle por día. */
  personas: readonly PersonaReporte[];
  reglas: ReglasAsistencia;
  /** `codigo|fecha` → aprobación guardada. */
  aprobaciones: ReadonlyMap<string, Aprobacion>;
}

/**
 * Los días de la pantalla: TODO día con horas extra medidas, aprobado o no.
 *
 * ⚠️ Aparecen también los YA APROBADOS. Una lista que solo muestra pendientes
 * no deja desaprobar nada, y un toque de más no puede ser irreversible.
 *
 * 🔴 EL DETALLE SALE DEL MISMO `clasificarDia` QUE PAGA (vía `diasConExtra`).
 * No es una segunda cuenta: si la base de salida cambia, esta pantalla cambia
 * junto con el pago.
 */
export function armarDiasAprobacion(opts: OpcionesDias): DiaAprobacion[] {
  // 🔴 CON EL SUELDO REPARTIDO HAY DOS LÍNEAS POR CÓDIGO, Y ACÁ MANDA LA QUE
  // PAGA LAS HORAS EXTRA. Un `new Map(...)` a secas se queda con la ÚLTIMA que
  // pase, así que la pantalla de Aprobaciones diría «Vistana» de unas horas que
  // se pagan en Fashion Wear — y quien aprueba tiene que ver dónde caen. No
  // toca un centavo: de la línea solo se leen la etiqueta y la empresa.
  const lineaDe = new Map<string, LineaPlanilla>();
  for (const l of opts.lineas) {
    const previa = lineaDe.get(l.codigo);
    if (previa && previa.parte?.llevaHorasExtra === true) continue;
    lineaDe.set(l.codigo, l);
  }
  const porFecha = new Map<string, PersonaEnDia[]>();

  for (const p of opts.personas) {
    const l = lineaDe.get(p.codigo);
    // Sin línea no hay a quién pagarle: alguien que marcó y no tiene ficha.
    if (!l) continue;
    for (const d of diasConExtra(p, opts.reglas)) {
      const a = opts.aprobaciones.get(claveDia(p.codigo, d.fecha));
      const arr = porFecha.get(d.fecha) ?? [];
      arr.push({
        codigo: p.codigo,
        etiqueta: l.etiqueta,
        empresa: l.empresa,
        empresaEtiqueta: l.empresaEtiqueta,
        salida: d.salida,
        minutos: d.minutos,
        diurnoMin: d.diurnoMin,
        nocturnoMin: d.nocturnoMin,
        aprobado: estaAprobado(a),
        por: a?.por ?? null,
        cuando: a?.cuando ?? null,
        minutosVistos: a ? a.minutosVistos : null,
        cambio: a != null && a.aprobado === true && a.minutosVistos !== d.minutos,
      });
      porFecha.set(d.fecha, arr);
    }
  }

  return [...porFecha.entries()]
    .map(([fecha, gente]) => ({
      fecha,
      etiqueta: etiquetaDia(fecha),
      semana: lunesDe(fecha),
      minutos: gente.reduce((a, g) => a + g.minutos, 0),
      // Más horas arriba: si alguien mira una sola línea, que sea ésa.
      gente: gente.sort((x, y) =>
        x.minutos !== y.minutos ? y.minutos - x.minutos : x.etiqueta.localeCompare(y.etiqueta, "es"),
      ),
    }))
    // En orden de calendario. La pantalla los agrupa por semana con `semana`.
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
}

export function horasBonitas(minutos: number): string {
  const h = Math.round((minutos / 60) * 100) / 100;
  return `${h.toFixed(2).replace(".", ",")} h`;
}

/** Cuántas faltan y cuántas horas suman. Es lo que dice el contador de arriba. */
export function resumenPendientes(dias: readonly DiaAprobacion[]): {
  /** Cuántas aprobaciones faltan — persona-día, que es la unidad. */
  pendientes: number;
  minutos: number;
  /** `codigo|fecha` de cada una, para el botón «Aprobar todo». */
  claves: string[];
} {
  let pendientes = 0, minutos = 0;
  const claves: string[] = [];
  for (const d of dias) {
    for (const g of d.gente) {
      if (g.aprobado) continue;
      pendientes += 1;
      minutos += g.minutos;
      claves.push(claveDia(g.codigo, d.fecha));
    }
  }
  return { pendientes, minutos, claves };
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
