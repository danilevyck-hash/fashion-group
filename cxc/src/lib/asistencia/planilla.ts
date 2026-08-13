/* ─────────────────────────────────────────────────────────────────────────────
 * LA PLANILLA QUINCENAL — de minutos marcados a dólares a pagar.
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`. Se prueba entero contra los
 * casos que la contable escribió a mano.
 *
 * ── LAS DOS COSAS QUE ESTE ARCHIVO NO HACE, Y SON LO MÁS IMPORTANTE ──────────
 *
 * 0. NO LE CALCULA PAGO A QUIEN NO VA EN PLANILLA. Quien está marcado como
 *    servicio profesional (`servicioProfesional`, ver `participacion.ts`) sale
 *    con `dinero: null` **aunque tenga salario cargado** y con
 *    `fueraDePlanilla: true`, que NO es lo mismo que "falta configurar": sus
 *    horas se miden igual y su fila no es un pendiente de nadie.
 *
 * 1. NO INVENTA UN NÚMERO CUANDO LE FALTA UN DATO. Una persona sin salario o
 *    sin jornada NO produce una línea de $0: produce una línea con
 *    `faltaConfigurar` lleno y SIN dinero, y los totales la dejan afuera.
 *    🩸 Un cero silencioso en una planilla es el error que nadie ve hasta que
 *    alguien reclama su pago. Hoy hay 6 códigos que marcaron en el reloj y no
 *    tienen ficha (48 a 53): tienen que verse, no desaparecer.
 *
 * 2. NO TIENE UNA SOLA CIFRA DEL NEGOCIO ESCRITA ADENTRO. Los recargos, los
 *    divisores, la tolerancia, los porcentajes de seguro y la hora de corte
 *    entran por `reglas` y salen de `asistencia_reglas`. Lo único que hay acá
 *    son las FORMAS del cálculo (qué se suma con qué), que es lo que la
 *    migración declara explícitamente que NO debe volverse configurable.
 *
 * ── LAS REGLAS, confirmadas por la contable el 6-ago-2026 ────────────────────
 *
 *   · Rata por hora   = salario mensual ÷ divisor de su jornada (173,33 o 208).
 *   · Valor minuto    = rata ÷ 60.
 *   · Quincenal       = salario mensual ÷ 2.
 *   · Tardanza        = minutos pasada la tolerancia × valor minuto. SE RESTA.
 *   · Hora extra      = hasta las 18:00 × 1,25 · desde las 18:01 × 1,50.
 *   · Excedente       = × 2,625, con DOS condiciones a la vez (ver `medirHoras`).
 *   · Domingo/feriado = horas trabajadas × 1,50.
 *   · Ausencia        = horas del día × rata. SE RESTA.
 *   · Bruto  = quincenal + extras + domingos + feriados − ausencias − tardanzas.
 *   · Neto   = bruto − deducciones **+ otros servicios** (ver `calcularDinero`:
 *              otros servicios SUMA, es un pago extra y no un descuento).
 * ────────────────────────────────────────────────────────────────────────── */

import {
  divisorDe,
  etiquetaEmpresa,
  type EmpresaAsistencia,
  type ReglasAsistencia,
} from "./config";
import { etiquetaPersona } from "./directorio";
import { esHabil, type DiaReporte, type PersonaReporte } from "./reporte";

// ─────────────────────────────────────────────────────────────────────────────
// CENTAVOS — el redondeo, en un solo lugar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redondea a centavos, medio para arriba, SIN el arrastre del punto flotante.
 *
 * 🩸 `Math.round(261.735 * 100)` da 26173 y no 26174: en binario 261,735 se
 * guarda como 261,7349999999999568…, así que el medio centavo "hacia arriba"
 * cae hacia abajo. Y 261,735 no es un caso raro — es exactamente la mitad de
 * $523,47, el salario de SIETE personas de Boston. Un centavo de menos en el
 * quincenal es la clase de diferencia que una contable encuentra y ya no
 * vuelve a confiar en la pantalla.
 */
export function centavos(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const x = n * 100;
  return Math.round(x + (x >= 0 ? 1e-9 : -1e-9)) / 100;
}

/** Minutos → horas con 2 decimales. Solo para MOSTRAR: el dinero usa minutos. */
export const aHoras = (min: number): number => centavos(min / 60);

// ─────────────────────────────────────────────────────────────────────────────
// LA QUINCENA
//
// ⛔ Los cortes NO son configurables, y la migración dice por qué: mover el
// corte cambia qué días entran en cada pago, no cuánto vale una hora.
// ─────────────────────────────────────────────────────────────────────────────

export type NumeroQuincena = 1 | 2;

export interface Quincena {
  anio: number;
  /** 1 a 12. */
  mes: number;
  n: NumeroQuincena;
  /** YYYY-MM-DD */
  desde: string;
  hasta: string;
  /** Lo que se le muestra a la gente: "16 al 31 de julio de 2026". */
  etiqueta: string;
  /** La clave que guarda los montos manuales: "2026-07-2". */
  clave: string;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const p2 = (n: number) => String(n).padStart(2, "0");

/** Último día del mes. Febrero y los meses de 30 salen solos. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * La quincena: del 1 al 15, y del 16 al fin de mes.
 *
 * 🔑 EL DÍA 31 NO SE PAGA PERO SÍ SE DESCUENTA, y así queda implementado sin
 * un solo `if`: el quincenal es `salario ÷ 2` FIJO —un mes de 31 días no paga
 * base de más— pero el rango llega hasta el 31, así que una ausencia de ese
 * día entra al cálculo igual que cualquier otra. La asimetría es a propósito y
 * así la trabaja la contable; que a nadie se le ocurra "arreglarla".
 */
export function quincena(anio: number, mes: number, n: NumeroQuincena): Quincena {
  const fin = n === 1 ? 15 : ultimoDiaDelMes(anio, mes);
  const ini = n === 1 ? 1 : 16;
  return {
    anio,
    mes,
    n,
    desde: `${anio}-${p2(mes)}-${p2(ini)}`,
    hasta: `${anio}-${p2(mes)}-${p2(fin)}`,
    etiqueta: `${ini} al ${fin} de ${MESES[mes - 1]} de ${anio}`,
    clave: `${anio}-${p2(mes)}-${n}`,
  };
}

/** "2026-07-2" → la quincena. `null` si la clave no sirve. */
export function quincenaDesdeClave(clave: string): Quincena | null {
  const m = /^(\d{4})-(\d{2})-([12])$/.exec(String(clave ?? "").trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || anio < 2000 || anio > 2999) return null;
  return quincena(anio, mes, Number(m[3]) as NumeroQuincena);
}

/**
 * Las últimas `cuantas` quincenas hasta la que contiene a `hoy`, de la más
 * reciente a la más vieja. `hoy` entra por parámetro para que el módulo siga
 * siendo puro y los tests no dependan del reloj de la máquina.
 */
export function quincenasHasta(hoy: string, cuantas = 12): Quincena[] {
  const [a, m, d] = hoy.split("-").map(Number);
  let anio = a;
  let mes = m;
  let n: NumeroQuincena = d <= 15 ? 1 : 2;
  const out: Quincena[] = [];
  for (let i = 0; i < cuantas; i++) {
    out.push(quincena(anio, mes, n));
    if (n === 2) n = 1;
    else {
      n = 2;
      mes -= 1;
      if (mes === 0) { mes = 12; anio -= 1; }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL PERÍODO — la quincena de siempre, o un rango de fechas cualquiera
//
// Daniel (13-ago-2026): quiere poder pedir la planilla por un rango cualquiera,
// no solo por quincena.
//
// ── 🔴 EL SUELDO ES MENSUAL: PRORRATEARLO NECESITA UNA REGLA, Y ES ÉSTA ──────
//
// Se paga **la fracción de QUINCENA que el rango cubre**, no la fracción de mes
// ni de días hábiles. Se eligió así por una razón que se puede verificar:
//
//   🔑 ES LA ÚNICA REGLA QUE DEJA LA QUINCENA EXACTAMENTE COMO ESTÁ HOY.
//      El negocio paga MEDIO SUELDO por quincena, sin importar que tenga 15 o
//      16 días (`salario ÷ 2`, y el día 31 no paga base). Prorratear por días
//      del mes daría 15/31 = 0,4839 del sueldo para la primera quincena de
//      julio: un 3 % menos que hoy, en TODAS las planillas, por haber agregado
//      una pantalla. Con esta regla, un rango que es una quincena da factor
//      **exactamente 1** y ni un centavo se mueve.
//
//   Para un rango partido, cada quincena que toca aporta su parte:
//      factor = Σ (días del rango dentro de esa quincena ÷ días de esa quincena)
//   Ejemplo: del 25-jul al 10-ago = 7/16 (julio, 2ª) + 10/15 (agosto, 1ª).
//
// ⚠️ ESTO ES UNA DECISIÓN DE PLATA Y ESTÁ A LA VISTA EN LA PANTALLA. No se
// prorratea con `fecha_ingreso` (esa regla sigue sin estar definida y quien
// entra a mitad de quincena cobra completo): acá el prorrateo es del PERÍODO que
// se pidió, no de la persona.
//
// ⚠️ LOS MONTOS ESCRITOS A MANO (ISR, préstamo, terceros, mercancía, otros
// servicios) VIVEN POR QUINCENA —la tabla los guarda con la clave "2026-07-2" y
// su CHECK no acepta otra cosa—. En un rango libre NO se aplican y se dice en
// pantalla y en el papel: repartir un ISR por días sería inventar plata.
// ─────────────────────────────────────────────────────────────────────────────

export interface Periodo {
  desde: string;
  hasta: string;
  /** Lo que se le muestra a la gente. */
  etiqueta: string;
  /** `true` = el rango es EXACTAMENTE una quincena; todo se comporta como hoy. */
  esQuincena: boolean;
  /** La quincena, cuando lo es. Es la que da la clave de los montos manuales. */
  quincena: Quincena | null;
  /** La clave de `asistencia_planilla_manual`. `null` en un rango libre. */
  claveManuales: string | null;
  diasCalendario: number;
  /** Cuánto del sueldo quincenal se paga. 1 = una quincena entera. */
  factorBase: number;
}

const DIA_MS = 86_400_000;

/** Los días de calendario de `desde` a `hasta`, ambos incluidos. */
export function diasDelRango(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / DIA_MS) + 1;
}

/** ¿Es una fecha `YYYY-MM-DD` de calendario de verdad? (`2026-02-31` no lo es.) */
export function esFechaDeCalendario(v: unknown): v is string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 2000 || anio > 2099) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Las quincenas que TOCA un rango, de la más vieja a la más nueva. */
function quincenasDelRango(desde: string, hasta: string): Quincena[] {
  const out: Quincena[] = [];
  let anio = Number(desde.slice(0, 4));
  let mes = Number(desde.slice(5, 7));
  const finAnio = Number(hasta.slice(0, 4));
  const finMes = Number(hasta.slice(5, 7));
  // Tope duro: 24 meses. Sin esto, un rango con una fecha tecleada mal
  // («2099-…») haría girar el bucle miles de veces.
  for (let i = 0; i < 24 && (anio < finAnio || (anio === finAnio && mes <= finMes)); i++) {
    out.push(quincena(anio, mes, 1));
    out.push(quincena(anio, mes, 2));
    mes += 1;
    if (mes === 13) { mes = 1; anio += 1; }
  }
  return out;
}

/**
 * Cuánto del sueldo quincenal se paga por este rango.
 *
 * 🔑 Una quincena entera da **exactamente 1** (sus días ÷ sus días), y por eso
 * `salario ÷ 2 × factor` es idéntico al `salario ÷ 2` de siempre — sin arrastre
 * de coma flotante, porque multiplicar por 1 no cambia un número IEEE-754.
 */
export function factorBaseDeRango(desde: string, hasta: string): number {
  if (!esFechaDeCalendario(desde) || !esFechaDeCalendario(hasta) || hasta < desde) return 0;
  let factor = 0;
  for (const q of quincenasDelRango(desde, hasta)) {
    const ini = desde > q.desde ? desde : q.desde;
    const fin = hasta < q.hasta ? hasta : q.hasta;
    if (fin < ini) continue;
    const dias = diasDelRango(ini, fin);
    const totales = diasDelRango(q.desde, q.hasta);
    if (totales <= 0) continue;
    factor += dias / totales;
  }
  return factor;
}

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "2026-07-25" → "25 jul 2026". Lo que lee una persona. */
export function fechaCorta(f: string): string {
  const [a, m, d] = f.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1] ?? "?"} ${a}`;
}

/** El período de una quincena. Todo se comporta EXACTAMENTE como antes. */
export function periodoDeQuincena(q: Quincena): Periodo {
  return {
    desde: q.desde,
    hasta: q.hasta,
    etiqueta: q.etiqueta,
    esQuincena: true,
    quincena: q,
    claveManuales: q.clave,
    diasCalendario: diasDelRango(q.desde, q.hasta),
    factorBase: 1,
  };
}

/**
 * El período de un rango cualquiera. `null` si las fechas no sirven.
 *
 * 🔑 Si el rango COINCIDE con una quincena, devuelve el período de esa quincena
 * —misma clave de montos manuales, mismo factor 1—: pedir «16 al 31 de julio»
 * por el camino nuevo tiene que dar el MISMO cuadro que elegir esa quincena en
 * la lista, hasta el centavo. Hay un test que lo exige.
 */
export function periodoDesdeRango(desde: string, hasta: string): Periodo | null {
  if (!esFechaDeCalendario(desde) || !esFechaDeCalendario(hasta)) return null;
  if (hasta < desde) return null;

  for (const q of quincenasDelRango(desde, hasta)) {
    if (q.desde === desde && q.hasta === hasta) return periodoDeQuincena(q);
  }
  return {
    desde,
    hasta,
    etiqueta: `${fechaCorta(desde)} al ${fechaCorta(hasta)}`,
    esQuincena: false,
    quincena: null,
    // ⚠️ `null` a propósito: los montos manuales se guardan por quincena y su
    // CHECK no acepta otra clave. En un rango libre no se aplican, y se avisa.
    claveManuales: null,
    diasCalendario: diasDelRango(desde, hasta),
    factorBase: factorBaseDeRango(desde, hasta),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS HORAS — lo que el reloj dice, ya clasificado
// ─────────────────────────────────────────────────────────────────────────────

export interface HorasPersona {
  /** Hora extra hasta la hora de corte (18:00). Va al 1,25. */
  extraDiurnoMin: number;
  /** Hora extra pasada la hora de corte. Va al 1,50. */
  extraNocturnoMin: number;
  /** Excedente: pasa el tope diario Y cae pasada la hora de corte. Va al 2,625. */
  excedenteMin: number;
  /** Domingo trabajado. Va al 1,50. */
  domingoMin: number;
  /** Feriado trabajado. Va al 1,50. */
  feriadoMin: number;
  /** Minutos de tardanza pasada la tolerancia. SE RESTAN. */
  tardanzaMin: number;
  /** Ausencias sin justificar, en minutos de jornada. SE RESTAN. */
  ausenciaMin: number;
  ausenciaDias: number;
  ausenciaJustificadaDias: number;
  /**
   * Sábado trabajado. ⚠️ NO ENTRA A NINGUNA COLUMNA: el cuadro de la contable
   * no tiene una para el sábado y acá no se inventa un recargo. Se mide y se
   * avisa, que es lo contrario de perderlo en silencio.
   */
  sabadoMin: number;
  diasTrabajados: number;
  diasARevisar: number;
  /** De `tardanzaMin`, cuántos vienen de días sin las 4 marcas. */
  tardanzaDeDiasARevisarMin: number;
  /** Minutos de jornada de un día completo, según SU horario. */
  jornadaDiariaMin: number;
}

export const HORAS_CERO: HorasPersona = {
  extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0,
  domingoMin: 0, feriadoMin: 0, tardanzaMin: 0,
  ausenciaMin: 0, ausenciaDias: 0, ausenciaJustificadaDias: 0,
  sabadoMin: 0, diasTrabajados: 0, diasARevisar: 0,
  tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 0,
};

/**
 * "HH:MM" o "HH:MM:SS" → minutos, CON DECIMALES.
 *
 * 🔴 Los segundos entran como fracción de minuto. Acá se parsea la hora de
 * SALIDA de un día —que desde el 13-ago-2026 trae segundos— para partir la
 * ventana de hora extra en las 18:00; descartarlos devolvería el redondeo por
 * la puerta de atrás, justo en la frontera que decide si un minuto se paga a
 * 1.25 o a 1.50.
 */
function hhmmAMin(hhmm: string): number {
  const [h, m, sg] = String(hhmm ?? "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0) + (sg || 0) / 60;
}

/**
 * Cuánto vale un día de ausencia cuando la persona NO tiene horario confirmado:
 * OCHO HORAS.
 *
 * 🩸 Sale del Excel de la contable, de sus propias fórmulas de la columna de
 * ausencias — no de una suposición mía:
 *
 *     María Bethancourt   =8*2.88            → un día
 *     Samir Polo Arrieta  =16*3.02           → dos días
 *     Cristian Blanco     =(0*24.16)+(0*3.02)   ← 24,16 = 8 × 3,02, el "valor del día"
 *
 * Acá se calculaba `salida − entrada − almuerzo` sobre el horario POR DEFECTO
 * (08:00-17:00 menos 30) y daba **8,5 h**: un 6 % de más en cada día ausente, y
 * encima sobre un horario que nadie confirmó. Hoy solo UNA persona de las 32
 * tiene horario propio, así que ese 8,5 era lo que se le aplicaba a todo el
 * mundo.
 *
 * ⚠️ Con horario CONFIRMADO manda el suyo: es el mismo con el que se le mide la
 * tardanza y la hora extra, y usar otra base ahí haría que el mismo día valiera
 * dos cosas distintas. El 8 es el default, no un techo.
 */
export const JORNADA_DIARIA_DEFAULT_MIN = 8 * 60;

/** El horario de una persona, con lo que hace falta para medirle el día. */
export interface HorarioDia {
  entrada: string;
  salida: string;
  almuerzo_minutos: number;
}

/**
 * Los minutos que dura el día de una persona. Sin horario propio, el default.
 * 🔑 Un horario guardado que dé 0 o menos no se usa: caería en una ausencia de
 * $0 —el cero silencioso otra vez, esta vez a favor de la empresa—.
 */
export function jornadaDiariaMin(h: HorarioDia | null | undefined): number {
  if (!h) return JORNADA_DIARIA_DEFAULT_MIN;
  const min = hhmmAMin(h.salida) - hhmmAMin(h.entrada) - (h.almuerzo_minutos ?? 0);
  return Number.isFinite(min) && min > 0 ? min : JORNADA_DIARIA_DEFAULT_MIN;
}

/** El día de la semana de una fecha, 0 = domingo. */
function dow(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/**
 * Clasifica UN día en las columnas del cuadro.
 *
 * ── LA FRONTERA DE LAS 18:00 ES UNA SOLA, y decide las tres cosas ───────────
 *
 * La ventana de hora extra efectiva es `[salida − extraMin, salida]`. No hace
 * falta ningún dato nuevo para saberlo: el motor del reporte ya descontó del
 * bruto el atraso del mismo día (quien llegó 20 tarde y se fue 20 tarde
 * RECUPERÓ, no hizo extra), y esos minutos recuperados se comen el ARRANQUE de
 * la ventana, que es lo que de verdad pasó en el reloj.
 *
 *   · minutos de esa ventana hasta las 18:00 → 1,25
 *   · minutos desde las 18:01                → 1,50
 *   · de esos últimos, los que además pasen el tope diario → 2,625
 *
 * ── 🩸 EL EXCEDENTE LLEVA DOS CONDICIONES A LA VEZ ──────────────────────────
 * Contable, textual: *"eso después de 3 horas extras al día, cuando sea
 * prolongación de la jornada nocturna o mixta"*. O sea:
 *   (a) MÁS del tope de horas extra en el día, **Y**
 *   (b) que esos minutos caigan pasada la hora de corte.
 * Una jornada con 5 horas extra que termina a las 17:45 NO llega al 2,625 por
 * muchas horas que acumule — y hay un test que lo exige.
 *
 * ⚠️ La columna del Excel viejo dice "Exedente de 9 horas". ESA ETIQUETA NO ES
 * LA REGLA: habla de un total de horas del día y omite la condición nocturna.
 * Leerla literal le aplicaría el 2,625 a gente a la que no le toca.
 */
export function clasificarDia(
  d: DiaReporte,
  reglas: ReglasAsistencia,
  jornadaDiariaMin: number,
): Pick<
  HorasPersona,
  | "extraDiurnoMin" | "extraNocturnoMin" | "excedenteMin"
  | "domingoMin" | "feriadoMin" | "tardanzaMin" | "ausenciaMin" | "sabadoMin"
> {
  const cero = {
    extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0,
    domingoMin: 0, feriadoMin: 0, tardanzaMin: 0, ausenciaMin: 0, sabadoMin: 0,
  };

  // Feriado trabajado: TODO lo trabajado va al recargo de feriado. No se le
  // mide tardanza ni hora extra — ese día no tiene horario que cumplir.
  if (d.feriado) return { ...cero, feriadoMin: d.trabajadoMin };

  if (!esHabil(d.fecha)) {
    const esDomingo = dow(d.fecha) === 0;
    return esDomingo
      ? { ...cero, domingoMin: d.trabajadoMin }
      : { ...cero, sabadoMin: d.trabajadoMin };
  }

  // Día hábil sin marcas y sin justificación: ausencia, valuada en la jornada
  // que le tocaba trabajar.
  if (d.ausente) return { ...cero, ausenciaMin: jornadaDiariaMin };
  if (!d.marcas.length) return cero;

  const tardanzaMin = d.tardeMin;
  const extra = d.extraMin;
  if (extra <= 0) return { ...cero, tardanzaMin };

  // La ventana efectiva termina en la última marca del día.
  const fin = d.salida ? hhmmAMin(d.salida) : 0;
  const ini = fin - extra;
  const corte = hhmmAMin(reglas.horaCorteNocturno);

  // 🔑 Se acota a [0, extra] en los dos lados: sin eso, un día raro (salida
  // antes del corte, o una marca cruzando la medianoche) mandaría minutos
  // negativos a una columna y el total cuadraría por casualidad.
  const diurno = Math.max(0, Math.min(extra, Math.min(fin, corte) - ini));
  const nocturno = extra - diurno;

  // (a) lo que pasa del tope diario …
  const tope = Math.max(0, reglas.excedenteHorasDia) * 60;
  const sobrante = Math.max(0, extra - tope);
  // … (b) y que además sea nocturno. Los minutos que pasan el tope son los
  // ÚLTIMOS de la ventana, que son justamente los más tarde del día.
  const excedenteMin = Math.min(nocturno, sobrante);

  return {
    ...cero,
    tardanzaMin,
    extraDiurnoMin: diurno,
    extraNocturnoMin: nocturno - excedenteMin,
    excedenteMin,
  };
}

/**
 * Las horas de una persona en la quincena.
 *
 * `jornadaDiariaMin` es lo que dura SU día según su horario configurado
 * (salida − entrada − almuerzo). Se usa para valuar la ausencia.
 * 🩸 Es el mismo horario con el que se le mide la tardanza y la hora extra: si
 * la ausencia usara otra base, el mismo día valdría dos cosas distintas.
 */
export function medirHoras(
  p: PersonaReporte,
  reglas: ReglasAsistencia,
  jornadaDiariaMin: number,
): HorasPersona {
  const h: HorasPersona = { ...HORAS_CERO, jornadaDiariaMin };
  for (const d of p.dias) {
    const c = clasificarDia(d, reglas, jornadaDiariaMin);
    h.extraDiurnoMin += c.extraDiurnoMin;
    h.extraNocturnoMin += c.extraNocturnoMin;
    h.excedenteMin += c.excedenteMin;
    h.domingoMin += c.domingoMin;
    h.feriadoMin += c.feriadoMin;
    h.tardanzaMin += c.tardanzaMin;
    h.ausenciaMin += c.ausenciaMin;
    h.sabadoMin += c.sabadoMin;
    if (d.marcas.length) {
      h.diasTrabajados += 1;
      if (d.revisar) {
        h.diasARevisar += 1;
        h.tardanzaDeDiasARevisarMin += c.tardanzaMin;
      }
    }
    if (d.ausente) h.ausenciaDias += 1;
    else if (!d.marcas.length && d.justificado) h.ausenciaJustificadaDias += 1;
  }
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL DINERO
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que NO sale del reloj y la contable escribe a mano. */
export interface ManualesLinea {
  isr: number;
  prestamo: number;
  terceros: number;
  mercancia: number;
  otrosServicios: number;
}

export const MANUALES_CERO: ManualesLinea = {
  isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0,
};

/** La ficha de planilla de una persona, tal como está guardada. */
export interface FichaPlanilla {
  codigo: string;
  nombre: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number | null;
  empresa: EmpresaAsistencia | string | null;
  /**
   * `true` = marca en el reloj pero NO va en planilla (servicio profesional).
   * Ver `participacion.ts`. Ausente o `false` = va en planilla, que es como
   * estaban las 38 fichas antes de que este campo existiera.
   */
  servicioProfesional?: boolean;
}

export interface DineroLinea {
  rataHora: number;
  valorMinuto: number;
  salarioQuincenal: number;
  extraDiurno: number;
  extraNocturno: number;
  excedente: number;
  domingos: number;
  feriados: number;
  ausencias: number;
  tardanzas: number;
  totalBruto: number;
  seguroSocial: number;
  seguroEducativo: number;
  isr: number;
  prestamo: number;
  terceros: number;
  mercancia: number;
  totalDeducciones: number;
  otrosServicios: number;
  netoPagar: number;
}

export interface LineaPlanilla {
  codigo: string;
  /** Lo que se muestra: el nombre, o el código. NUNCA vacío. */
  etiqueta: string;
  nombre: string | null;
  empresa: string | null;
  empresaEtiqueta: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number | null;
  horas: HorasPersona;
  /**
   * Qué le falta a esta persona para poder producir un número. Vacío = se
   * calculó. Con algo adentro, `dinero` es `null` y NO entra a los totales.
   * 🩸 Nunca un $0 silencioso, nunca omitida de la lista.
   */
  faltaConfigurar: string[];
  /**
   * 🔴 `true` = NO va en planilla (servicio profesional). `dinero` es `null` y
   * NO entra a los totales, pero **no es un pendiente**: no se pinta en ámbar,
   * no se cuenta en «falta configurar» y no hay nada que arreglarle. Es una
   * decisión de negocio, no un dato faltante — y la diferencia es justo la que
   * este campo existe para sostener.
   */
  fueraDePlanilla: boolean;
  dinero: DineroLinea | null;
  manuales: ManualesLinea;
}

/**
 * Las razones por las que una persona NO produce un número. Se muestran tal
 * cual, en la misma lista, para que no haya dos caminos distintos de "esta
 * queda afuera" y alguien se olvide de pintar uno.
 */
export const FALTA = {
  ficha: "sin ficha en Configuración",
  salario: "falta el salario",
  jornada: "falta la jornada (40 u 48 horas)",
  empresa: "falta la empresa",
  divisor: "las horas al mes de esa jornada no sirven",
  /**
   * 🩸 Tiene ficha pero no marcó NI UN DÍA. Descontarle la quincena entera en
   * automático sería inventarle una renuncia; pagarle completo, inventarle
   * unas vacaciones. Se lista y lo decide una persona.
   */
  sinMarcaciones: "no marcó ni un día en esta quincena",
} as const;

/**
 * Qué le falta a una ficha. Lista vacía = se puede calcular.
 *
 * 🔴 A QUIEN NO VA EN PLANILLA NO SE LE PIDE SALARIO NI JORNADA. No es que le
 * "falten": no los necesita, porque no se le calcula pago. Sin esto, YULISSA
 * saldría para siempre en la lista de «les falta el salario» y esa lista dejaría
 * de servir para lo que existe — decirle a la contable qué le queda por llenar.
 */
export function faltantesDe(f: FichaPlanilla, reglas: ReglasAsistencia): string[] {
  const out: string[] = [];
  const sinNada = !f.nombre && f.salarioMensual == null && f.jornadaSemanal == null && !f.empresa;
  if (sinNada) return [FALTA.ficha];
  if (f.servicioProfesional !== true) {
    if (f.salarioMensual == null || !Number.isFinite(f.salarioMensual) || f.salarioMensual <= 0) {
      out.push(FALTA.salario);
    }
    if (f.jornadaSemanal !== 40 && f.jornadaSemanal !== 48) out.push(FALTA.jornada);
    else if (divisorDe(f.jornadaSemanal, reglas) === null) out.push(FALTA.divisor);
  }
  // La empresa se sigue pidiendo SIEMPRE: es lo que separa las tres planillas
  // del mismo reloj, y también decide en qué lista de asistencia aparece.
  if (!f.empresa) out.push(FALTA.empresa);
  return out;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? centavos(n) : 0;
};

/**
 * Normaliza lo escrito a mano. Solo montos positivos.
 *
 * 🔑 El signo NO viaja en el monto: lo pone el cálculo. Cuatro de estos cinco
 * se restan y «otros servicios» se suma, y todos se escriben en positivo. Un
 * negativo tecleado por error invertiría el sentido de la columna sin que nadie
 * lo vea hasta el día de pago, así que se descarta a 0.
 */
export function normalizarManuales(m: Partial<ManualesLinea> | null | undefined): ManualesLinea {
  return {
    isr: num(m?.isr),
    prestamo: num(m?.prestamo),
    terceros: num(m?.terceros),
    mercancia: num(m?.mercancia),
    otrosServicios: num(m?.otrosServicios),
  };
}

/**
 * EL CÁLCULO. Es lo que se cotejó contra la planilla del 30 de julio.
 *
 * 🔑 CADA COLUMNA SE REDONDEA A CENTAVOS ANTES DE SUMARSE, no al final. La
 * contable revisa el cuadro sumando la fila con los ojos: si el total saliera
 * de los números largos, no le cuadraría contra lo que ve y tendría razón.
 *
 * 🔑 LA RATA TAMBIÉN VA A CENTAVOS. Su cuadro dice "3.27" y con eso multiplica.
 * Con la rata larga (3,268505…) el resultado se corre un centavo — y un centavo
 * de diferencia contra su Excel es todo lo que hace falta para que no confíe.
 */
export function calcularDinero(
  salarioMensual: number,
  jornadaSemanal: number,
  horas: HorasPersona,
  manuales: ManualesLinea,
  reglas: ReglasAsistencia,
  /**
   * Cuánto del sueldo quincenal paga el período. **1 = una quincena entera**, y
   * es el valor por defecto justamente para que todo lo que ya existía siga
   * dando el mismo número sin tocar una sola llamada.
   * Ver `factorBaseDeRango` y la nota larga del PERÍODO.
   */
  factorBase = 1,
): DineroLinea | null {
  const divisor = divisorDe(jornadaSemanal, reglas);
  if (divisor === null || !(salarioMensual > 0)) return null;

  const rataHora = centavos(salarioMensual / divisor);
  const valorMinuto = rataHora / 60;
  const h = (min: number) => min / 60;

  // 🩸 EL GUARD DEL FACTOR VA ACÁ TAMBIÉN, no solo en `armarPlanilla`. Un `NaN`
  // no da error: `centavos(NaN)` devuelve 0, o sea una planilla de $0 que se
  // paga en silencio — el mismo error que esta pantalla existe para no cometer.
  // Ante la duda se paga la quincena COMPLETA, que es lo que se pagaba ayer.
  const factor = Number.isFinite(factorBase) && factorBase > 0 ? factorBase : 1;
  // 🔑 `× 1` no cambia un número IEEE-754: con el factor por defecto esto es
  // literalmente el `centavos(salarioMensual / 2)` de siempre.
  const salarioQuincenal = centavos((salarioMensual / 2) * factor);
  const extraDiurno = centavos(h(horas.extraDiurnoMin) * reglas.recargoExtraDiurno * rataHora);
  const extraNocturno = centavos(h(horas.extraNocturnoMin) * reglas.recargoExtraNocturno * rataHora);
  const excedente = centavos(h(horas.excedenteMin) * reglas.recargoExcedenteNocturnaMixta * rataHora);
  const domingos = centavos(h(horas.domingoMin) * reglas.recargoDomingoFeriado * rataHora);
  const feriados = centavos(h(horas.feriadoMin) * reglas.recargoDomingoFeriado * rataHora);
  // La ausencia va SIN recargo: es la hora que no se trabajó, ni más ni menos.
  const ausencias = centavos(h(horas.ausenciaMin) * rataHora);
  const tardanzas = centavos(horas.tardanzaMin * valorMinuto);

  const totalBruto = centavos(
    salarioQuincenal + extraDiurno + extraNocturno + excedente + domingos + feriados
    - ausencias - tardanzas,
  );

  // Los dos seguros salen del BRUTO, no del quincenal: así lo confirmó la
  // contable y así lo dice la fórmula de su cuadro.
  const seguroSocial = centavos(totalBruto * (reglas.seguroSocialPct / 100));
  const seguroEducativo = centavos(totalBruto * (reglas.seguroEducativoPct / 100));

  const totalDeducciones = centavos(
    seguroSocial + seguroEducativo + manuales.isr + manuales.prestamo
    + manuales.terceros + manuales.mercancia,
  );

  // 🔴 "OTROS SERVICIOS" SUMA. NO ES UN DESCUENTO: ES UN PAGO EXTRA.
  //
  // 🩸 Salió a la luz cotejando el Excel real de la contable. Su fórmula del
  // neto, celda por celda, es:
  //
  //     U7 = =+L7-S7+T7        (L = total bruto · S = total deducciones ·
  //                             T = otros servicios)
  //
  // Verificada en Boston y en Vistana, en TODAS las filas. Acá se restaba —lo
  // leí de «Neto = bruto − deducciones − descuentos» y metí «otros servicios»
  // en el saco de los descuentos porque estaba en la lista de columnas que se
  // escriben a mano—. Con eso, a cualquiera que tuviera algo en esa columna le
  // salía el neto **al doble de mal**: le faltaba dos veces el monto.
  //
  // ⛔ QUE NADIE LO "ARREGLE" DE VUELTA. El test
  // `asistencia-planilla.test.ts` lleva la fórmula de ella escrita al lado.
  const netoPagar = centavos(totalBruto - totalDeducciones + manuales.otrosServicios);

  return {
    rataHora, valorMinuto, salarioQuincenal,
    extraDiurno, extraNocturno, excedente, domingos, feriados,
    ausencias, tardanzas, totalBruto,
    seguroSocial, seguroEducativo,
    isr: manuales.isr, prestamo: manuales.prestamo,
    terceros: manuales.terceros, mercancia: manuales.mercancia,
    totalDeducciones, otrosServicios: manuales.otrosServicios, netoPagar,
  };
}

/** Una línea completa: la ficha + sus horas + su dinero (o lo que le falta). */
export function armarLinea(
  ficha: FichaPlanilla,
  horas: HorasPersona,
  manuales: ManualesLinea,
  reglas: ReglasAsistencia,
  /** Fracción de quincena que paga el período. 1 = una quincena entera. */
  factorBase = 1,
): LineaPlanilla {
  const faltaConfigurar = faltantesDe(ficha, reglas);
  // 🔴 EL CANDADO DEL PAGO, Y ES ESTA LÍNEA. Quien está marcado como servicio
  // profesional NO produce dinero **aunque tenga salario cargado**: el `if` no
  // pregunta por el sueldo, pregunta por la bandera. Si mañana alguien le
  // escribe un salario por error —o queda uno viejo de cuando sí iba en
  // planilla—, sigue sin calculársele un centavo. Sus HORAS, en cambio, se
  // miden y viajan igual: es la mitad que Daniel quiere conservar.
  const fueraDePlanilla = ficha.servicioProfesional === true;
  const dinero =
    !fueraDePlanilla && faltaConfigurar.length === 0
      ? calcularDinero(
        ficha.salarioMensual as number, ficha.jornadaSemanal as number,
        horas, manuales, reglas, factorBase,
      )
      : null;

  return {
    fueraDePlanilla,
    codigo: ficha.codigo,
    etiqueta: etiquetaPersona(ficha.codigo, ficha.nombre),
    nombre: ficha.nombre ?? null,
    empresa: ficha.empresa ?? null,
    empresaEtiqueta: ficha.empresa ? etiquetaEmpresa(String(ficha.empresa)) : null,
    salarioMensual: ficha.salarioMensual ?? null,
    jornadaSemanal: ficha.jornadaSemanal ?? null,
    horas,
    faltaConfigurar,
    // 🔑 Si `calcularDinero` devolvió `null` con la ficha completa, algo del
    // divisor no sirve. No se deja pasar como línea "buena y sin números".
    dinero: faltaConfigurar.length === 0 && dinero === null ? null : dinero,
    manuales,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CUADRO COMPLETO
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesPlanilla {
  /** Lo que salió del motor del reporte, con `incluirNoHabiles`. */
  personas: readonly PersonaReporte[];
  /** Las fichas guardadas, por código. */
  fichas: ReadonlyMap<string, FichaPlanilla>;
  /** Lo escrito a mano, por código. */
  manuales?: ReadonlyMap<string, Partial<ManualesLinea>>;
  /** Cuánto dura el día de esa persona, en minutos. Sale de su horario. */
  jornadaDiariaMin: (codigo: string) => number;
  reglas: ReglasAsistencia;
  /** La empresa del cuadro. `null` = todas. */
  empresa?: string | null;
  /**
   * Fracción de quincena que paga el período pedido. Por defecto **1**, que es
   * una quincena entera: sin pasarlo, el cuadro es idéntico al de siempre.
   */
  factorBase?: number;
}

/**
 * El cuadro de una empresa.
 *
 * ── 🩸 QUIÉN ENTRA A LA LISTA, Y POR QUÉ NO ES OBVIO ─────────────────────────
 *
 * Entra la UNIÓN de tres cosas, y cada una tapa un agujero distinto:
 *
 *  1. Las fichas de esa empresa — porque quien no marcó ni un día igual tiene
 *     que aparecer. Si la lista saliera solo del reloj, desaparecería de su
 *     propia planilla justo el mes que algo raro pasó.
 *  2. Los códigos que marcaron y tienen ficha de esa empresa.
 *  3. 🔴 LOS CÓDIGOS QUE MARCARON Y NO TIENEN FICHA — en TODAS las empresas,
 *     sin importar cuál esté elegida. Son los 6 de 48 a 53. No se les puede
 *     adivinar la empresa, así que filtrarlos por empresa los borraría de las
 *     tres pantallas a la vez y nadie se enteraría nunca.
 */
export function armarPlanilla(opts: OpcionesPlanilla): LineaPlanilla[] {
  const { personas, fichas, jornadaDiariaMin, reglas } = opts;
  const empresa = opts.empresa ?? null;
  const factorBase = Number.isFinite(opts.factorBase) ? (opts.factorBase as number) : 1;
  const reporteDe = new Map(personas.map((p) => [p.codigo, p]));

  const codigos = new Set<string>();
  for (const [cod, f] of fichas) {
    if (!empresa || f.empresa === empresa) codigos.add(cod);
  }
  for (const p of personas) {
    const f = fichas.get(p.codigo);
    // Sin ficha entra siempre; con ficha, solo si es de esta empresa.
    if (!f || !empresa || f.empresa === empresa) codigos.add(p.codigo);
  }

  const lineas: LineaPlanilla[] = [];
  for (const cod of codigos) {
    const ficha: FichaPlanilla = fichas.get(cod) ?? {
      codigo: cod, nombre: null, salarioMensual: null, jornadaSemanal: null, empresa: null,
    };
    const p = reporteDe.get(cod);
    const h = p
      ? medirHoras(p, reglas, jornadaDiariaMin(cod))
      : { ...HORAS_CERO, jornadaDiariaMin: jornadaDiariaMin(cod) };

    const linea = armarLinea(ficha, h, normalizarManuales(opts.manuales?.get(cod)), reglas, factorBase);
    // 🔑 A quien no va en planilla no se le agrega «no marcó ni un día»: eso es
    // un motivo por el que NO SE PUDO PAGAR, y acá no hay nada que pagar. Si le
    // faltan marcas, se ve en el reporte de asistencia, que es donde importa.
    if (linea.fueraDePlanilla) {
      lineas.push(linea);
      continue;
    }
    // Con ficha completa pero sin una sola marca no se inventa nada: se lista.
    if (!p && linea.faltaConfigurar.length === 0) {
      lineas.push({ ...linea, faltaConfigurar: [FALTA.sinMarcaciones], dinero: null });
    } else if (!p && linea.faltaConfigurar.length > 0) {
      lineas.push({ ...linea, faltaConfigurar: [...linea.faltaConfigurar, FALTA.sinMarcaciones] });
    } else {
      lineas.push(linea);
    }
  }
  return ordenarLineas(lineas);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS TOTALES
// ─────────────────────────────────────────────────────────────────────────────

export type TotalesPlanilla = Omit<DineroLinea, "rataHora" | "valorMinuto"> & {
  /** Cuántas líneas SÍ entraron. */
  personas: number;
  /** Cuántas quedaron afuera por falta de configuración. */
  sinConfigurar: number;
  /**
   * Cuántas están fuera de planilla a propósito (servicio profesional).
   * 🔴 Se cuentan APARTE de `sinConfigurar`: meterlas ahí diría que hay trabajo
   * pendiente donde no lo hay, y ese número es el que la contable usa para saber
   * cuánto le falta.
   */
  fueraDePlanilla: number;
};

export const TOTALES_CERO: TotalesPlanilla = {
  salarioQuincenal: 0, extraDiurno: 0, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 0, tardanzas: 0, totalBruto: 0,
  seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0,
  mercancia: 0, totalDeducciones: 0, otrosServicios: 0, netoPagar: 0,
  personas: 0, sinConfigurar: 0, fueraDePlanilla: 0,
};

/**
 * Suma las líneas.
 *
 * 🩸 LAS QUE NO SE PUDIERON CALCULAR NO SUMAN CERO: se cuentan aparte en
 * `sinConfigurar`. Sumarlas como 0 daría un total que parece completo y no lo
 * está, que es exactamente el error que esta pantalla existe para no cometer.
 */
export function totalizar(lineas: readonly LineaPlanilla[]): TotalesPlanilla {
  const t: TotalesPlanilla = { ...TOTALES_CERO };
  for (const l of lineas) {
    // Fuera de planilla a propósito: no suma plata y TAMPOCO cuenta como
    // pendiente. Se pregunta primero para que no caiga en el `sinConfigurar`.
    if (l.fueraDePlanilla) { t.fueraDePlanilla += 1; continue; }
    if (!l.dinero) { t.sinConfigurar += 1; continue; }
    t.personas += 1;
    const d = l.dinero;
    t.salarioQuincenal = centavos(t.salarioQuincenal + d.salarioQuincenal);
    t.extraDiurno = centavos(t.extraDiurno + d.extraDiurno);
    t.extraNocturno = centavos(t.extraNocturno + d.extraNocturno);
    t.excedente = centavos(t.excedente + d.excedente);
    t.domingos = centavos(t.domingos + d.domingos);
    t.feriados = centavos(t.feriados + d.feriados);
    t.ausencias = centavos(t.ausencias + d.ausencias);
    t.tardanzas = centavos(t.tardanzas + d.tardanzas);
    t.totalBruto = centavos(t.totalBruto + d.totalBruto);
    t.seguroSocial = centavos(t.seguroSocial + d.seguroSocial);
    t.seguroEducativo = centavos(t.seguroEducativo + d.seguroEducativo);
    t.isr = centavos(t.isr + d.isr);
    t.prestamo = centavos(t.prestamo + d.prestamo);
    t.terceros = centavos(t.terceros + d.terceros);
    t.mercancia = centavos(t.mercancia + d.mercancia);
    t.totalDeducciones = centavos(t.totalDeducciones + d.totalDeducciones);
    t.otrosServicios = centavos(t.otrosServicios + d.otrosServicios);
    t.netoPagar = centavos(t.netoPagar + d.netoPagar);
  }
  return t;
}

/**
 * El orden del cuadro: primero los que se pagan, después los que no van en
 * planilla, y al final los pendientes.
 *
 * 🔑 Los tres grupos van separados porque el Excel y el PDF recorren esta lista
 * tal cual: si los de servicio profesional quedaran mezclados entre los que sí
 * cobran, en el papel se leerían como filas con las columnas de dinero vacías.
 */
export function ordenarLineas(lineas: readonly LineaPlanilla[]): LineaPlanilla[] {
  const grupo = (l: LineaPlanilla) =>
    l.fueraDePlanilla ? 1 : l.faltaConfigurar.length === 0 ? 0 : 2;
  return [...lineas].sort((a, b) => {
    const ga = grupo(a);
    const gb = grupo(b);
    if (ga !== gb) return ga - gb;
    if (ga === 2) return a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" });
    return a.etiqueta.localeCompare(b.etiqueta, "es", { sensitivity: "base" });
  });
}

/**
 * La frase que explica el neto. Va al pie de la pantalla, del Excel y del PDF.
 *
 * 🔑 EL MENOS ES UN GUION ASCII, no el signo «−» (U+2212). La fuente base del
 * PDF (helvetica/WinAnsi de jsPDF) NO tiene ese carácter y lo imprime como una
 * comilla: el pie decía *«bruto " deducciones " otros servicios»*. Medido en el
 * PDF real, no en un harness.
 */
export const FORMULA_NETO =
  "Total bruto = quincenal + extras + domingos + feriados - ausencias - tardanzas.  "
  + "Neto a pagar = total bruto - total deducciones + otros servicios "
  + "(otros servicios se SUMA: es un pago extra, no un descuento).";
