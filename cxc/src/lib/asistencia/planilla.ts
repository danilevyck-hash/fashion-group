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
 * 1b. NO LE CALCULA PAGO A QUIEN ENTRÓ O SALIÓ A MITAD DEL PERÍODO
 *    (`decidirAMano`). Sale con el motivo escrito —«entró el 10 de agosto»—,
 *    con el quincenal que le correspondería a la vista, y FUERA del total.
 *    🩸 YEISHKA DIAZ, ingreso 10-ago, salía ausente el 3, 4, 5, 6 y 7 con un
 *    neto de $133,34 sobre un quincenal de $300. El arreglo obvio —no contarle
 *    esos días— la deja cobrando los $300 completos, que es PEOR: trabajó 6
 *    días de 15. Las dos cuentas automáticas están mal por lados opuestos, así
 *    que el sistema SE ABSTIENE. Es la misma regla del punto 1 y de
 *    `FALTA.sinMarcaciones`, con otra causa. NO HAY PRORRATEO AUTOMÁTICO ACÁ:
 *    la contadora saca lo suyo con el rango de fechas libre, que ya existe.
 *
 * 1c. …PERO A QUIEN COBRA FIJO Y NO MARCA SÍ LE CALCULA, TODAS LAS QUINCENAS.
 *    Es la excepción del punto 1, y es una bandera de la ficha (`noMarcaReloj`,
 *    ver `sueldo-fijo.ts`), no una deducción. EDWIN GOMEZ vende en la calle: no
 *    pasa por el aparato ni un día y cobra su quincena completa con seguros.
 *    🩸 Y el reloj se le ignora SIEMPRE, no solo cuando no hay marcas: si mañana
 *    alguien usa su código, no puede aparecerle una ausencia inventada que le
 *    mueva el pago sin que nadie lo vea. Ver el tercer candado de `armarLinea`.
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
 *   · Excedente       = NO SE USA. La contadora manda esos minutos al 1,50 y
 *                       deja su columna en $0,00 (ver `clasificarDia`).
 *   · Domingo/feriado = horas trabajadas × 1,50.
 *   · Día no trabajado (ausencia, o vacación «ya se le pagó») = 8 horas × rata,
 *                       SIEMPRE. SE RESTA (ver `MIN_DIA_NO_TRABAJADO`).
 *   · Bruto  = quincenal + extras + domingos + feriados − ausencias − tardanzas.
 *   · Neto   = bruto − deducciones **+ otros servicios** (ver `calcularDinero`:
 *              otros servicios SUMA, es un pago extra y no un descuento).
 * ────────────────────────────────────────────────────────────────────────── */

import {
  divisorDe,
  etiquetaEmpresa,
  MINUTOS_TARDE_QUE_SON_AUSENCIA,
  type EmpresaAsistencia,
  type ReglasAsistencia,
} from "./config";
import { etiquetaPersona } from "./directorio";
import { esHabil, fmtMin, type DiaReporte, type PersonaReporte } from "./reporte";

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
  /**
   * 🔴 LOS MINUTOS DE HORA EXTRA QUE NO SE PAGARON POR FALTA DE AUTORIZACIÓN.
   *
   * Van APARTE de `extraDiurnoMin`/`extraNocturnoMin` —que ya vienen sin ellos,
   * y es lo que hace que no se paguen— para poder DECIR cuánto quedó afuera.
   * Sin este campo, lo que falta aprobar sería justo lo que no se puede ver.
   *
   * 🔴 ES EL TOTAL: `extraNoAprobadaDiurnoMin + extraNoAprobadaNocturnoMin`.
   * Se conserva entero porque es lo que se congela (`extra_no_aprobada_min`) y
   * lo que los candados viejos leen.
   */
  extraNoAprobadaMin: number;
  /**
   * De `extraNoAprobadaMin`, lo que era hora extra DIURNA (al 1,25) y lo que era
   * NOCTURNA (al 1,50). Son un DESGLOSE del total, no se suman a nada.
   *
   * 🩸 Existen desde el 3-sep-2026: sin ellos, lo no aprobado solo se podía
   * contar en minutos, nunca valuar —y el aviso ámbar «N personas tienen horas
   * extra sin aprobar» leía `extraMedido`, que ya venía SIN esos minutos. El
   * aviso nunca salió y el freno del cierre nunca frenó.
   *
   * ⚠️ NO SE CONGELAN: `COLUMNAS_HORAS` (`planilla-guardada.ts`) los excluye a
   * propósito, porque la tabla guardada tiene las 20 columnas de siempre y el
   * total sí viaja. Son para VALUAR en el momento, no para leer después.
   */
  extraNoAprobadaDiurnoMin: number;
  extraNoAprobadaNocturnoMin: number;
  /**
   * Excedente. **HOY SIEMPRE 0** — se conserva la columna porque el cuadro de
   * la contadora también la conserva, y también en $0,00. Ver `clasificarDia`.
   */
  excedenteMin: number;
  /** Domingo trabajado. Va al 1,50. */
  domingoMin: number;
  /** Feriado trabajado. Va al 1,50. */
  feriadoMin: number;
  /**
   * Minutos de tardanza pasada la tolerancia. SE RESTAN.
   *
   * 🔴 SIGUE SIENDO EL TOTAL, incluidos los días de más de 30 minutos. Es lo
   * que hace que la plata no se mueva: `calcularDinero` valúa este número
   * EXACTAMENTE como ayer y después reparte el resultado entre dos columnas.
   */
  tardanzaMin: number;
  /**
   * De `tardanzaMin`, los que vienen de días con MÁS de 30 minutos tarde
   * (`MINUTOS_TARDE_QUE_SON_AUSENCIA`). Se muestran en la columna «Ausencia»
   * en vez de en «Tardanzas» — Daniel: *"La columna «Ausencia» es solo para que
   * lo veas"*.
   *
   * ⚠️ NO SE SUMA A `tardanzaMin`: es un SUBCONJUNTO suyo. Sumarlos sería
   * cobrar dos veces los mismos minutos.
   */
  tardanzaGraveMin: number;
  /** Cuántos días fueron así. Es lo que se escribe en el aviso y en el papel. */
  tardanzaGraveDias: number;
  /** Ausencias sin justificar, en minutos de jornada. SE RESTAN. */
  ausenciaMin: number;
  ausenciaDias: number;
  ausenciaJustificadaDias: number;
  /**
   * Minutos de jornada de días de VACACIONES marcadas «ya se le pagó». SE RESTAN.
   *
   * 🔴 SON LOS ÚNICOS DÍAS DE VACACIONES QUE CUESTAN PLATA. Una vacación sin
   * marcar no aporta un minuto acá: se paga, y el quincenal la cubre.
   *
   * ⚠️ NO ES UNA AUSENCIA y no se suma a `ausenciaMin`. Vive aparte porque en
   * el renglón del día se lee «Vacaciones (ya pagadas)» y NUNCA «ausencia» — la
   * persona no faltó, está usando un derecho que ya cobró.
   */
  vacacionesYaPagadasMin: number;
  /** Cuántos días fueron. Es lo que se escribe en el aviso ámbar y en el papel. */
  vacacionesYaPagadasDias: number;
  /** Días del período cubiertos por vacaciones, marcadas o no. Solo para MOSTRAR. */
  vacacionesDias: number;
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
  /**
   * Minutos de jornada de un día completo, según SU horario. **Solo para
   * mostrar**: el descuento de un día no trabajado no sale de acá.
   */
  jornadaDiariaMin: number;
}

export const HORAS_CERO: HorasPersona = {
  extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0, extraNoAprobadaMin: 0,
  extraNoAprobadaDiurnoMin: 0, extraNoAprobadaNocturnoMin: 0,
  domingoMin: 0, feriadoMin: 0, tardanzaMin: 0,
  tardanzaGraveMin: 0, tardanzaGraveDias: 0,
  ausenciaMin: 0, ausenciaDias: 0, ausenciaJustificadaDias: 0,
  vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0, vacacionesDias: 0,
  sabadoMin: 0, diasTrabajados: 0, diasARevisar: 0,
  tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEEN LAS DOS COLUMNAS QUE COMPARTEN LOS MINUTOS DE TARDANZA
//
// 🔴 FUENTE ÚNICA. Las mismas tres funciones las usan la pantalla, el Excel y el
// PDF que se firma. Dos redacciones del mismo hecho es la forma de que terminen
// diciendo cosas distintas del mismo número — y acá el número es plata.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los minutos que se muestran en la columna «Tardanzas».
 *
 * 🩸 NO ES `h.tardanzaMin`. Ese sigue siendo el TOTAL —es lo que se valúa— y de
 * él salen las dos columnas. Poner el total en la etiqueta de «Tardanzas»
 * mientras el monto de al lado ya no lo incluye es la contradicción más fácil de
 * cometer y la más difícil de ver: los minutos no cuadrarían con los dólares.
 */
export function minutosTardanzaMostrados(h: HorasPersona): number {
  return Math.max(0, h.tardanzaMin - (h.tardanzaGraveMin || 0));
}

/** La etiqueta de «Ausencias», con lo que hay que saber para explicar el monto. */
export function textoAusencias(h: HorasPersona): string {
  const base = `${h.ausenciaDias} días · ${aHoras(h.ausenciaMin)} h`;
  const partes: string[] = [base];
  const dias = h.tardanzaGraveDias || 0;
  // 🔑 Se DICE que son minutos de llegar tarde, no se deja adivinar. Sin esto,
  // alguien que vino los 15 días aparece con «0 días · 0 h» de ausencia y un
  // monto al lado, y la contadora no tiene cómo saber de dónde salió.
  if (dias) partes.push(`${dias} día(s) de más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} min tarde`);
  // 🔴 Lo mismo con las vacaciones ya pagadas, y por el mismo motivo: el monto
  // está adentro de esta columna y quien la lee tiene que poder explicarlo sin
  // abrir otra pantalla. Se dice «vacaciones», nunca «ausencia».
  const vac = h.vacacionesYaPagadasDias || 0;
  if (vac) partes.push(`${vac} día(s) de vacaciones ya pagadas`);
  return partes.join(" · ");
}

/**
 * La etiqueta de «Tardanzas», con los minutos que de verdad valúa.
 *
 * 🔑 `fmtMin`: los minutos se miden AL SEGUNDO desde el 13-ago-2026, así que
 * traen fracción. Se muestran con 2 decimales cuando la tienen — redondear cada
 * celda al entero haría que la columna no sumara su propio total.
 */
export function textoTardanzas(h: HorasPersona): string {
  return `${fmtMin(minutosTardanzaMostrados(h))} min`;
}

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
 * Cuánto dura el día de alguien SIN horario cargado: ocho horas.
 *
 * ⚠️ ESTO NO VALÚA NADA. Es la duración del día que se MUESTRA (el renglón
 * «jornadaDia» del cuadro y de las auditorías) para quien no tiene horario
 * confirmado. El dinero de un día que no se trabajó sale de
 * `MIN_DIA_NO_TRABAJADO`, que es otra constante y contesta otra pregunta —
 * aunque hoy las dos den 8 horas. Si mañana alguien entra con jornada de 6 h,
 * su día durará 6 y su ausencia seguirá costando 8: son cosas distintas.
 */
export const JORNADA_DIARIA_DEFAULT_MIN = 8 * 60;

/**
 * 🔴 LO QUE VALE UN DÍA QUE NO SE TRABAJÓ: **OCHO HORAS, SIEMPRE**. No es el
 * default de nada — es la regla, y no la mueve ningún horario.
 *
 * Contadora, textual (25-ago-2026, por Daniel): *«Dia de ausencia 8 horas»*.
 *
 * 🔑 SE LLAMA «DÍA NO TRABAJADO» Y NO «DÍA DE AUSENCIA» A PROPÓSITO. Hay DOS
 * hechos que descuentan un día entero —la ausencia sin justificar y la vacación
 * marcada «ya se le pagó»— y son el mismo hecho contable: un día que no se
 * trabajó y se resta. Valuarlos con dos varas (8 h uno, 8,5 h el otro) es una
 * incoherencia que nadie va a poder explicar en seis meses, y con el nombre
 * viejo el próximo que lea el archivo iba a creer que la palabra «ausencia»
 * tiene multiplicador propio. **Los dos salen de esta constante y de ningún
 * otro lado**: cuando Daniel cambie la regla, se cambia acá y nada más.
 *
 * 🩸 ANTES SE DESCONTABA LA JORNADA REAL Y ERA MÁS CARO. 22 de las 31 personas
 * tienen horario confirmado 08:00–17:00 con 30 de almuerzo = **8,5 h**, así que
 * a casi todo el mundo se le descontaba media hora de más por cada día ausente.
 * Medido con `_diag-planilla-vs-contadora.ts` contra producción: en la quincena
 * `2026-07-2` ese medio punto costaba **$20,88 de descuento de más** repartido
 * entre seis personas, y en `2026-08-1` **$6,71** entre cuatro.
 *
 * La vara es su Excel de la II quincena de julio, columna «Ausencias», leída
 * por FÓRMULA y no por valor:
 *
 *     Roxana Hernandez    =8*4.04     ← un día
 *     Samir Polo Arrieta  =16*3.02    ← dos días
 *     María Bethancourt   =8*2.88     ← un día
 *     Cristian Blanco     =(0*24.16)+(0*3.02)   ← 24,16 = 8 × 3,02
 *
 * El único renglón que NO sale de esta fórmula es HÉCTOR PÉREZ, con `23.08`
 * tecleado a mano (= 600 ÷ 26, el día calendario). Con 8 h × 2,88 dan $23,04:
 * cuatro centavos. Con la jornada de 8,5 daban $24,48 — un dólar y medio.
 *
 * ⚠️ NO TOCA LA TARDANZA. Los minutos tarde se siguen valuando `minutos ×
 * valor minuto`, con la misma tolerancia y el mismo umbral de 30 minutos que
 * los manda a mostrarse en la columna «Ausencia». Esta constante solo valúa el
 * día ENTERO, que es lo único que la regla nombra.
 *
 * ⚠️ Y NO ES `JORNADA_DIARIA_DEFAULT_MIN`, aunque hoy valgan lo mismo. Aquélla
 * contesta *«¿cuánto dura el día de esta persona?»* —sale del horario y solo
 * se muestra—; ésta contesta *«¿cuánto se le resta por no venir?»*. Juntarlas
 * es volver a atar el descuento al horario, que es justo lo que se corrigió.
 */
export const MIN_DIA_NO_TRABAJADO = 8 * 60;

/** El horario de una persona, con lo que hace falta para medirle el día. */
export interface HorarioDia {
  entrada: string;
  salida: string;
  almuerzo_minutos: number;
}

/**
 * Los minutos que dura el día de una persona. Sin horario propio, el default.
 * 🔑 Un horario guardado que dé 0 o menos no se usa: un «día de 0 minutos» en
 * la pantalla es el cero silencioso otra vez.
 * ⚠️ Desde el 26-ago-2026 esto **no toca el dinero**: los descuentos de día
 * completo salen de `MIN_DIA_NO_TRABAJADO`.
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
 *
 * ── 🔴 Y NO HAY UN TERCER ESCALÓN: EL EXCEDENTE NO SE USA ───────────────────
 *
 * Acá los minutos que pasaban el tope diario Y caían de noche se apartaban a
 * `excedenteMin` y se pagaban × 2,625. **Ya no.** Contadora, textual
 * (25-ago-2026, por Daniel): *«Excedente de 9 horas es 1.5»*.
 *
 * 🩸 Y NO ES SOLO EL MULTIPLICADOR, ES LA COLUMNA. Su Excel de la II quincena
 * de julio conserva «Exedente de 9 horas» con la fórmula del 2,625 escrita
 * —`=0*1.5*1.75*3.46`— pero con CERO horas adentro, en las tres empresas y en
 * todos los renglones. Los minutos están en la columna del 1,50. Se ve
 * renglón por renglón, y cuadra al cuarto de hora:
 *
 *     CRISTIAN BLANCO  módulo 1,50 = 89,0 min + excedente 61,3 min = 2,51 h
 *                      Excel  H12 = 2.5*1.5*3.02        ✅
 *     RAMÓN MIRANDA    módulo 1,50 = 119,0 min + excedente 31,5 min = 2,51 h
 *                      Excel  H15 = 2.5*1.5*3.27        ✅
 *     KENER HERNÁNDEZ  módulo 1,50 = 119,0 min + excedente 31,6 min = 2,51 h
 *                      Excel  H10 = 2.5*1.5*3.46        ✅
 *
 * Por eso el arreglo no era poner el parámetro en 1,5 —el dinero habría dado
 * igual, pero la columna «Excedente» del cuadro habría seguido con plata
 * adentro donde la de ella dice $0,00, y ahí empieza la desconfianza—. La
 * columna se conserva y queda en cero, exactamente como la de ella.
 *
 * Medido contra producción en `2026-07-2`: el 2,625 se le aplicaba a ocho
 * personas y les pagaba **$58,32 de más** en el bruto. En `2026-08-1` no hubo
 * un solo minuto que cayera en la columna, así que esa quincena no se mueve.
 *
 * ⚠️ `excedenteHorasDia` y `recargoExcedenteNocturnaMixta` siguen guardados y
 * validados en Configuración: el día que la contadora los pida de vuelta, el
 * dato ya está y esto son tres líneas. Hoy NO calculan nada, y la pantalla lo
 * dice — un parámetro que no mueve un centavo y no lo avisa es una mentira.
 */
export function clasificarDia(
  d: DiaReporte,
  reglas: ReglasAsistencia,
): Pick<
  HorasPersona,
  | "extraDiurnoMin" | "extraNocturnoMin" | "excedenteMin"
  | "domingoMin" | "feriadoMin" | "tardanzaMin" | "ausenciaMin" | "sabadoMin"
  | "vacacionesYaPagadasMin"
> {
  const cero = {
    extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0,
    domingoMin: 0, feriadoMin: 0, tardanzaMin: 0, ausenciaMin: 0, sabadoMin: 0,
    vacacionesYaPagadasMin: 0,
  };

  // ── 🔴 VACACIONES: VA PRIMERO, ANTES QUE EL FERIADO Y QUE TODO ─────────────
  //
  // El motor del reporte ya dejó este día en cero y sin marcas (ver la nota de
  // `DiaReporte.vacacion`), así que acá no hay nada que medir: lo único que se
  // decide es si el día SE PAGA.
  //
  //   · sin marcar → todo en cero. El quincenal lo cubre, o sea que se paga.
  //   · marcada    → se descuenta la jornada: esos días ya se cobraron antes.
  //
  // ⚠️ Solo se descuenta lo que la persona iba a trabajar: día HÁBIL y NO
  // feriado. Un domingo o un 3 de noviembre adentro del rango no tenían jornada
  // que pagar, y descontarlos sería cobrarle dos veces el mismo día.
  if (d.vacacion) {
    if (!d.vacacion.yaPagadas || d.feriado || !esHabil(d.fecha)) return cero;
    // 🔴 LA MISMA CONSTANTE QUE LA AUSENCIA, y por eso el horario ya no entra
    // acá. Es el mismo hecho: un día que no se trabajó y se resta.
    return { ...cero, vacacionesYaPagadasMin: MIN_DIA_NO_TRABAJADO };
  }

  // Feriado trabajado: TODO lo trabajado va al recargo de feriado. No se le
  // mide tardanza ni hora extra — ese día no tiene horario que cumplir.
  if (d.feriado) return { ...cero, feriadoMin: d.trabajadoMin };

  if (!esHabil(d.fecha)) {
    const esDomingo = dow(d.fecha) === 0;
    return esDomingo
      ? { ...cero, domingoMin: d.trabajadoMin }
      : { ...cero, sabadoMin: d.trabajadoMin };
  }

  // Día hábil sin marcas y sin justificación: ausencia, valuada en OCHO HORAS.
  // 🔴 No en la jornada de su horario: la contadora descuenta 8 h para todos y
  // los horarios confirmados dan 8,5. Ver `MIN_DIA_NO_TRABAJADO`.
  if (d.ausente) return { ...cero, ausenciaMin: MIN_DIA_NO_TRABAJADO };
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

  // 🔴 TODO LO NOCTURNO VA AL 1,50, sin apartar nada. `excedenteMin` queda en
  // cero a propósito y por eso se escribe: la columna existe y vale $0,00,
  // igual que la del Excel de la contadora.
  return {
    ...cero,
    tardanzaMin,
    extraDiurnoMin: diurno,
    extraNocturnoMin: nocturno,
    excedenteMin: 0,
  };
}

/**
 * Las horas de una persona en la quincena.
 *
 * `jornadaDiariaMin` es lo que dura SU día según su horario configurado
 * (salida − entrada − almuerzo). **Viaja para MOSTRARSE y nada más**: ni la
 * ausencia ni la vacación «ya se le pagó» se valúan con él —los dos salen de
 * `MIN_DIA_NO_TRABAJADO`— y por eso `clasificarDia` ya ni lo recibe.
 */
/**
 * 🔴 QUÉ DÍAS TIENEN LA HORA EXTRA AUTORIZADA.
 *
 * Daniel, 27-ago-2026: la aprobación pasó de ser por período a ser **por día**,
 * porque el corte de la quincena lo mueve la contadora y con una llave por
 * período cada corrimiento volvía a preguntar todo desde cero.
 *
 * ⚠️ El filtro va ACÁ, al SUMAR, y no en `armarLinea`. La razón es que ahora la
 * aprobación es parcial: se le pueden autorizar a alguien el martes y el jueves
 * y no el miércoles. Un booleano al final de la línea solo sabe decir «todo o
 * nada» — el detalle se pierde antes de llegar ahí.
 */
export interface DiasAprobados {
  /** ¿Se exige aprobación? `false` sin la tabla corrida: se paga todo. */
  exigir: boolean;
  /** `codigo|fecha` de cada día autorizado. */
  claves: ReadonlySet<string>;
  codigo: string;
}

export function medirHoras(
  p: PersonaReporte,
  reglas: ReglasAsistencia,
  jornadaDiariaMin: number,
  aprob?: DiasAprobados,
): HorasPersona {
  const h: HorasPersona = { ...HORAS_CERO, jornadaDiariaMin };
  for (const d of p.dias) {
    const c = clasificarDia(d, reglas);
    // 🔑 Solo los RECARGOS dependen de la autorización. La tardanza, la
    // ausencia y los días trabajados se cuentan siempre: son lo que pasó, no
    // algo que alguien conceda.
    const pagaExtra =
      !aprob?.exigir || aprob.claves.has(`${aprob.codigo}|${d.fecha}`);
    if (pagaExtra) {
      h.extraDiurnoMin += c.extraDiurnoMin;
      h.extraNocturnoMin += c.extraNocturnoMin;
      h.excedenteMin += c.excedenteMin;
      h.domingoMin += c.domingoMin;
      h.feriadoMin += c.feriadoMin;
    } else {
      // Lo que NO se pagó, para poder DECIRLO. Rechazar sí, esconder no.
      //
      // 🔴 SE APARTA CON SU RECARGO, no solo el total: es lo que permite que
      // `armarLinea` lo valúe con la MISMA fórmula del pago (1,25 el diurno,
      // 1,50 el nocturno) y el aviso diga cuánto se pagaría al aprobar. Sumar
      // los dos en una sola cifra era perder el precio de cada minuto.
      h.extraNoAprobadaMin += c.extraDiurnoMin + c.extraNocturnoMin;
      h.extraNoAprobadaDiurnoMin += c.extraDiurnoMin;
      h.extraNoAprobadaNocturnoMin += c.extraNocturnoMin;
    }
    h.tardanzaMin += c.tardanzaMin;
    // 🔴 EL RÓTULO, NO EL DINERO. Un día de más de 30 minutos tarde se sigue
    // sumando entero a `tardanzaMin` —que es lo que se valúa— y además se
    // aparta acá para poder MOSTRARLO en la columna «Ausencia». El umbral se
    // mide por DÍA, no sobre el total de la quincena: tres días de 15 minutos
    // son tres tardanzas, no una ausencia.
    if (c.tardanzaMin > MINUTOS_TARDE_QUE_SON_AUSENCIA) {
      h.tardanzaGraveMin += c.tardanzaMin;
      h.tardanzaGraveDias += 1;
    }
    h.ausenciaMin += c.ausenciaMin;
    h.sabadoMin += c.sabadoMin;
    // 🔴 APARTE DE LA AUSENCIA, SIEMPRE. Se valúa igual (jornada × rata, sin
    // recargo) y se descuenta igual, pero se cuenta solo para poder DECIRLO:
    // el aviso ámbar necesita el monto y los días, y el renglón del día nunca
    // dice «ausencia» sobre unas vacaciones.
    if (c.vacacionesYaPagadasMin > 0) {
      h.vacacionesYaPagadasMin += c.vacacionesYaPagadasMin;
      h.vacacionesYaPagadasDias += 1;
    }
    if (d.vacacion) h.vacacionesDias += 1;
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
  /**
   * ¿Se le descuentan el seguro social y el educativo? Los DOS van juntos —ver
   * `seguros.ts`—. Ausente o `true` = sí, que es como estaban las 38 fichas
   * antes de que este campo existiera: la planilla se los cobraba a todas.
   *
   * 🔴 SOLO UN `false` EXPLÍCITO LOS APAGA. Es lo que hace que este cambio no
   * mueva un centavo el día que sale, y que la planilla siga dando lo de ayer
   * hasta que una persona apague el interruptor a conciencia.
   */
  pagaSeguros?: boolean;
  /**
   * 🔴 SOBRE QUÉ MONTO se le calculan los seguros, POR QUINCENA. Ver
   * `seguros-base.ts`. Ausente, `null` o 0 = sobre el TOTAL BRUTO, que es como
   * estaban las 40 fichas antes de que este campo existiera.
   *
   * 🩸 RODRIGO MIRANDA. La contadora, textual: *«su base para el cálculo del
   * seguro social y seguro educativo es 175.00 […] él está en una planilla
   * doméstica y con un menor salario»*. `175 × 9,75 % = $17,06` y
   * `175 × 1,25 % = $2,19`, que son los dos montos escritos a mano en su Excel.
   * Sobre el bruto le salían $39,38 y $5,05: **$25,18 de más por quincena**.
   *
   * 🔴 NO ENCIENDE LOS SEGUROS DE NADIE. `pagaSeguros` manda: con los seguros
   * apagados las dos columnas siguen en $0,00 aunque haya base cargada. Son dos
   * preguntas —¿se le cobran? y ¿sobre cuánto?— y la primera va primero.
   *
   * ⚠️ ES EL MONTO DE **UNA QUINCENA**, la misma unidad que el bruto al que
   * reemplaza (no el mensual dividido por dos, como el salario). En un rango
   * libre se reparte con el MISMO `factorBase` que el sueldo quincenal.
   */
  baseSeguros?: number | null;
  /**
   * 🔴 `true` = COBRA FIJO Y NO PASA POR EL RELOJ. Ver `sueldo-fijo.ts`. Ausente
   * o `false` = marca, que es como estaban las 39 fichas antes de que este campo
   * existiera.
   *
   * Dos efectos, y los dos están en este archivo: no cae en
   * `FALTA.sinMarcaciones` (produce su neto solo, todas las quincenas) y **el
   * reloj se le ignora SIEMPRE**, marque o no marque.
   */
  noMarcaReloj?: boolean;
  /**
   * 🔴 SU SUELDO SE PAGA ENTRE DOS EMPRESAS Y SALE EN LAS DOS PLANILLAS. Ver
   * `reparto.ts` y `ParteReparto` acá abajo. Ausente o vacío = una sola línea,
   * que es como estaban las 37 fichas antes de que este campo existiera.
   *
   * ⚠️ Tiene que venir YA VALIDADO (`partesDe`, en `reparto.ts`). Igual no se
   * confía: `partesUsables` vuelve a exigir las cuatro condiciones estructurales
   * acá adentro, que es donde se decide la plata.
   */
  reparto?: readonly ParteReparto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// EL REPARTO — una persona, dos empresas, dos líneas
//
// 🔴 LA RATA SALE DEL SUELDO COMPLETO, Y ES EL PUNTO ENTERO.
//
// La contadora, textual (27-ago-2026): *«En ambas empresas su rata por hora es
// 5.77»*. `$1.000 × 12 ÷ 52 ÷ 40 = 5,769…` → **$5,77**, la misma en las dos,
// porque es lo que vale la hora de esa persona. Si la rata de Fashion Wear
// saliera de sus $200, su hora valdría $1,15 y sus horas extra —que se pagan
// justamente ahí— se pagarían CINCO VECES MENOS.
//
// Por eso `calcularDinero` recibe DOS números: el mensual COMPLETO, que es de
// donde sale la rata, y el de la PARTE, que es lo único que se prorratea a
// quincenal.
//
// 🔴 CADA COLUMNA DEL RELOJ CAE EN UNA SOLA LÍNEA. Es lo que hace que el reparto
// no invente ni pierda un centavo:
//
//   · las HORAS EXTRA (1,25 · 1,50 · excedente) van a la parte marcada
//     «acá se pagan las horas extra», y a ninguna otra;
//   · TODO EL RESTO DEL RELOJ —domingos, feriados, tardanzas, ausencias,
//     vacaciones ya pagadas— y los montos escritos a mano van a la parte
//     PRINCIPAL (la primera de la lista), y a ninguna otra.
//
// Sumando las partes se reconstruyen las horas originales columna por columna.
// Hay un test que lo exige, y no es decorativo: una ausencia contada en las dos
// líneas se descontaría dos veces, y una hora extra en ninguna desaparecería.
//
// ── ⚠️ POR QUÉ LOS DOMINGOS Y FERIADOS SE QUEDAN EN LA PLANILLA ──────────────
//
// La contadora dijo «horas extras», y en Panamá el recargo de domingo es otra
// cosa. Ante la duda se quedan del lado que SÍ paga seguros: retener de más se
// ve en el neto y se reclama el mismo día; no retener se descubre meses después
// cuando la Caja pide lo que no se retuvo. Misma asimetría que `seguros.ts`.
// 🔴 QUEDA PENDIENTE PREGUNTARLE: en la quincena del 16 al 31 de julio de 2026
// son $27,05 de recargo de domingo, o sea plata de verdad.
// ─────────────────────────────────────────────────────────────────────────────

/** Una parte del reparto, ya validada. Produce UNA línea de planilla. */
export interface ParteReparto {
  empresa: string;
  /** Lo que ESTA empresa le paga al mes. ⚠️ NO es de donde sale la rata. */
  salarioMensual: number;
  /** ¿Esta parte descuenta seguro social y educativo? */
  pagaSeguros: boolean;
  /** 🔴 Acá se pagan las horas extra. Exactamente UNA parte la tiene. */
  llevaHorasExtra: boolean;
  /**
   * 🔴 Acá cae TODO EL RESTO DEL RELOJ (domingos, feriados, tardanzas,
   * ausencias, vacaciones ya pagadas) y los montos escritos a mano. Es la
   * primera parte de la lista, y hay exactamente una.
   */
  llevaElReloj: boolean;
}

/** Las columnas de HORA EXTRA. Van a la parte marcada, y a ninguna otra. */
const COLUMNAS_EXTRA = [
  "extraDiurnoMin", "extraNocturnoMin", "excedenteMin", "extraNoAprobadaMin",
  // 🔑 El desglose de lo no aprobado va con su total, a la MISMA parte: es lo
  // que hace que el aviso «sin aprobar» salga en la empresa que pagaría.
  "extraNoAprobadaDiurnoMin", "extraNoAprobadaNocturnoMin",
] as const;

/**
 * Todo el resto del reloj. Va a la parte PRINCIPAL, y a ninguna otra.
 *
 * ⚠️ `jornadaDiariaMin` NO está en ninguna de las dos listas a propósito: no es
 * algo que se reparta —es cuánto dura el día de esa persona— y se COPIA a todas
 * las partes. Repartirlo dejaría a una línea creyendo que el día dura 0 minutos.
 */
const COLUMNAS_RELOJ = [
  "domingoMin", "feriadoMin", "tardanzaMin", "tardanzaGraveMin", "tardanzaGraveDias",
  "ausenciaMin", "ausenciaDias", "ausenciaJustificadaDias",
  "vacacionesYaPagadasMin", "vacacionesYaPagadasDias", "vacacionesDias",
  "sabadoMin", "diasTrabajados", "diasARevisar", "tardanzaDeDiasARevisarMin",
] as const;

/**
 * Las horas que le tocan a UNA parte.
 *
 * 🔴 NO SE PARTE NINGÚN NÚMERO: cada columna se copia entera a la parte que le
 * corresponde y se deja en CERO en las otras. Prorratear minutos entre dos
 * empresas sería inventar decimales que no existen en el reloj, y además dos
 * columnas redondeadas por separado no vuelven a sumar el original.
 */
export function repartirHoras(h: HorasPersona, parte: ParteReparto): HorasPersona {
  const out: HorasPersona = { ...HORAS_CERO, jornadaDiariaMin: h.jornadaDiariaMin };
  if (parte.llevaHorasExtra) for (const k of COLUMNAS_EXTRA) out[k] = h[k] || 0;
  if (parte.llevaElReloj) for (const k of COLUMNAS_RELOJ) out[k] = h[k] || 0;
  return out;
}

/**
 * Las partes de una ficha que este motor va a usar. Lista VACÍA = una sola
 * línea, como siempre.
 *
 * 🔴 VUELVE A EXIGIR LO ESTRUCTURAL AUNQUE `reparto.ts` YA LO HAYA HECHO, y no
 * es desconfianza gratuita: acá es donde se decide la plata, y un llamador
 * —un test, un script, una ruta nueva— puede armar la ficha a mano. Las cuatro
 * condiciones son las que hacen que ninguna columna se pierda ni se duplique:
 * dos partes o más, empresas sin repetir, exactamente una con las horas extra y
 * exactamente una con el reloj. Cualquier otra cosa vuelve a UNA sola línea, que
 * es lo que se pagaba ayer.
 *
 * ⚠️ La suma de los montos contra el salario de la ficha se exige en
 * `validarReparto` (`reparto.ts`), donde se puede DECIR el motivo en pantalla.
 * Acá también se rechaza, porque es la que sostiene que la rata sea honesta.
 */
export function partesUsables(f: FichaPlanilla): readonly ParteReparto[] {
  const partes = f.reparto ?? [];
  if (partes.length < 2) return [];
  const empresas = new Set(partes.map((p) => p.empresa));
  if (empresas.size !== partes.length) return [];
  if (partes.filter((p) => p.llevaHorasExtra).length !== 1) return [];
  if (partes.filter((p) => p.llevaElReloj).length !== 1) return [];
  const salario = f.salarioMensual;
  if (typeof salario !== "number" || !Number.isFinite(salario) || salario <= 0) return [];
  let suma = 0;
  for (const p of partes) {
    if (!Number.isFinite(p.salarioMensual) || p.salarioMensual <= 0) return [];
    suma = centavos(suma + centavos(p.salarioMensual));
  }
  if (suma !== centavos(salario)) return [];
  return partes;
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
  /**
   * De `ausencias`, lo que viene de días con MÁS de 30 minutos tarde. SOLO PARA
   * MOSTRAR: ya está adentro de `ausencias` y no se suma en ningún lado.
   *
   * 🔑 Existe para que un número en la columna «Ausencia» de alguien que vino
   * todos los días se pueda explicar sin abrir el reporte. Sin esto, la
   * contadora vería una ausencia donde ella sabe que la persona trabajó.
   */
  ausenciaPorTardanza: number;
  /** De `ausencias`, lo que viene de días SIN NINGUNA marca. Solo para mostrar. */
  ausenciaDeDiaCompleto: number;
  /**
   * De `ausencias`, lo que viene de VACACIONES marcadas «ya se le pagó».
   *
   * 🔴 ES EL MONTO QUE LA PLANILLA DEJÓ DE PAGAR, y por eso existe: la regla de
   * Daniel es que eso **se dice en pantalla**, con el nombre, el rango y el
   * monto. Sin este campo el descuento se perdería adentro de `ausencias` y no
   * habría forma de escribir ese aviso.
   *
   * ⚠️ YA ESTÁ ADENTRO DE `ausencias` y no se suma en ningún lado — es un
   * DESGLOSE, igual que `ausenciaPorTardanza`. Sumarlo sería descontar dos
   * veces los mismos días.
   */
  vacacionesYaPagadas: number;
  tardanzas: number;
  totalBruto: number;
  /**
   * El monto sobre el que se calcularon los seguros, cuando NO fue el bruto.
   * `null` = salieron del bruto, que es el caso de casi todo el mundo.
   *
   * 🔑 SOLO PARA MOSTRAR: no se suma en ningún lado. Existe para que un seguro
   * social de $17,06 donde se esperaba $39,38 se explique sin preguntarle a
   * nadie. Ya viene repartido por el `factorBase`, o sea que es exactamente el
   * número que multiplicado por 9,75 % da la columna de al lado.
   *
   * ⚠️ Es `null` cuando los seguros están APAGADOS, aunque la ficha tenga base:
   * ahí lo que hay que mostrar es «sin seguros», no una base que no se usó.
   */
  baseSeguros: number | null;
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
  /**
   * ¿Se le descontaron los seguros? Es lo que se muestra —un chip «sin
   * seguros»— para que un $0,00 en las dos columnas no se lea como un error de
   * cálculo. Sale de la ficha, no de mirar si el número dio cero: un bruto de
   * $0 también daría seguros en cero y no es lo mismo.
   */
  pagaSeguros: boolean;
  /**
   * ¿Tiene una base propia para los seguros, y cuál? `null` = salen del bruto.
   *
   * Es lo que se muestra —un sello «seguros sobre $175,00»— para que un seguro
   * social de $17,06 donde se esperaba $39,38 se entienda sin preguntarle a
   * nadie. Sale de la FICHA, no de mirar si el número dio distinto.
   *
   * ⚠️ Es el monto de la ficha tal cual (por quincena). El que de verdad se
   * multiplicó —ya repartido por el `factorBase` de un rango libre— viaja en
   * `dinero.baseSeguros`, y en una quincena entera los dos son el mismo número.
   */
  baseSeguros: number | null;
  /**
   * ¿Cobra fijo sin pasar por el reloj? Es lo que se muestra —un chip «sueldo
   * fijo»— para que los 0,00 de ausencias, tardanzas y extras no se lean como
   * un error de cálculo. Sale de la ficha, no de mirar si las horas dieron
   * cero: alguien que vino todos los días y no hizo extras también daría cero.
   */
  noMarcaReloj: boolean;
  /**
   * 🔴 ESTA LÍNEA ES **UNA PARTE** DE UN SUELDO REPARTIDO ENTRE DOS EMPRESAS.
   * `null` = la persona cobra entero acá, que es el caso de 36 de las 37 fichas.
   *
   * 🔑 Trae el monto de ESTA empresa (`salarioMensual` de la parte) y si acá se
   * pagan las horas extra, para que la pantalla pueda decir «$800,00 · Planilla»
   * y «$200,00 · Servicios profesionales · Horas extra» sin recalcular nada.
   *
   * ⚠️ `LineaPlanilla.salarioMensual` sigue siendo el sueldo COMPLETO de la
   * ficha, y eso es a propósito: es el número del que sale `dinero.rataHora`, y
   * ponerle acá los $200 dejaría a la contadora viendo un salario con el que su
   * rata no cuadra — el mismo pecado que `rata.ts` existe para no cometer.
   */
  parte: ParteReparto | null;
  /**
   * 🔴 EL SISTEMA SE ABSTUVO Y LO DECIDE UNA PERSONA. Trae el motivo escrito,
   * tal como se muestra: «entró el 10 de agosto de 2026», «Vacaciones del 16
   * jul 2026 al 13 ago 2026». `dinero` es `null` y NO entra a los totales.
   *
   * 🔑 NO ES «FALTA CONFIGURAR», y por eso es un campo aparte y no una entrada
   * más de `faltaConfigurar`: ahí no hay nada que arreglar en Configuración —la
   * ficha está completa y la justificación es correcta—. Mandarlo al mismo
   * cajón es lo que hacía que RODRIGO y ELOYN salieran en ámbar pidiendo un
   * arreglo que no existe, y una lista de pendientes con cosas que no son
   * pendientes deja de servir para lo único que sirve.
   */
  decidirAMano: string | null;
  /**
   * Lo que le tocaría de sueldo quincenal en este período, para que quien
   * decide no tenga que calcularlo aparte.
   *
   * 🔴 SOLO SE MUESTRA. Es `null` en toda línea que SÍ produjo dinero, y no
   * entra en ninguna suma: `totalizar` no lo mira. Se calcula con la MISMA
   * fórmula del quincenal (`salario ÷ 2 × factor`, redondeada a centavos) para
   * que el número que la contadora ve acá y el que la planilla pagaría no
   * puedan diferir.
   */
  quincenalReferencia: number | null;
  /**
   * 🔴 LAS HORAS EXTRA QUE MIDIÓ EL RELOJ, SIEMPRE — estén aprobadas o no.
   *
   * ⚠️ NO ES LO MISMO QUE `horas.extraDiurnoMin + horas.extraNocturnoMin`, y
   * ahí está todo el punto: cuando la aprobación no está, `horas` viene con los
   * extras EN CERO (es lo que hace que no se paguen) y este campo conserva lo
   * que de verdad marcó la persona. Sin él, lo que falta aprobar sería
   * exactamente lo que no se puede ver — el descarte en silencio que este
   * módulo viene sacando desde las vacaciones «ya se le pagó».
   *
   * `null` si esa persona no hizo horas extra en el período.
   * `monto` es `null` cuando no se le pudo calcular pago (falta ficha, servicio
   * profesional, tú decides): los minutos igual se dicen.
   */
  extraMedido: { minutos: number; diurnoMin: number; nocturnoMin: number; monto: number | null } | null;
  /**
   * 🔴 LAS HORAS EXTRA QUE EL RELOJ MIDIÓ Y ESTE CUADRO **NO PAGÓ** porque
   * nadie las aprobó. `null` si no le quedó ni un minuto afuera.
   *
   * 🩸 Es el campo que el aviso ámbar y el freno del cierre leen desde el
   * 3-sep-2026. Hasta ese día leían `extraMedido`, que sale de las horas que
   * `medirHoras` YA dejó sin los días no aprobados: con todo sin aprobar era
   * `null` (ni aviso ni freno, y se podía cerrar la quincena con extras sin
   * aprobar) y con aprobación parcial decía los minutos APROBADOS como «sin
   * aprobar». El dato existía en `horas.extraNoAprobadaMin`; no llegaba a
   * donde se dice.
   *
   * `monto` = lo que se pagaría al aprobar, con la MISMA rata y los MISMOS
   * recargos que `extraMedido.monto` (1,25 el diurno, 1,50 el nocturno, a
   * centavos por columna). `null` cuando no se le pudo calcular pago (falta
   * ficha, servicio profesional, tú decides): los minutos igual se dicen.
   *
   * ⚠️ Con el sueldo repartido en dos empresas sale SOLO en la línea que paga
   * las horas extra (`parte.llevaHorasExtra`), que es la única que lo pagaría
   * al aprobar; en la otra es `null`. Por eso se lee de `horasEfectivas` y no
   * de `horasMedidas` como `extraMedido`: un aviso por persona, no por línea.
   */
  extraNoAprobada: { minutos: number; diurnoMin: number; nocturnoMin: number; monto: number | null } | null;
  /**
   * ¿Se le pagaron esas horas extra?
   *
   * 🔑 `true` también cuando la aprobación NO SE EXIGE (sin la tabla corrida, o
   * en un cálculo que no la pasa): es el comportamiento de siempre —se paga
   * todo— y por eso el default es `true`. La pantalla usa este campo para el
   * chip «sin aprobar», no para adivinarlo mirando si el monto dio cero.
   */
  extraAprobada: boolean;
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
  /**
   * ¿Se le descuentan los seguros? **`true` por defecto**, o sea el
   * comportamiento de siempre: sin pasarlo, esta función devuelve exactamente
   * lo mismo que devolvía antes de que el parámetro existiera.
   */
  pagaSeguros = true,
  /**
   * Sobre qué monto se calculan los seguros, POR QUINCENA. **`null` por
   * defecto**, o sea sobre el TOTAL BRUTO: sin pasarlo, esta función devuelve
   * exactamente lo mismo que devolvía antes de que el parámetro existiera.
   * Ver `seguros-base.ts`.
   */
  baseSegurosQuincena: number | null = null,
  /**
   * 🔴 CUÁNTO PAGA **ESTA** EMPRESA AL MES, cuando el sueldo está repartido
   * entre dos. **`null` por defecto**, o sea que el quincenal sale del salario
   * completo: sin pasarlo, esta función devuelve exactamente lo mismo que
   * devolvía antes de que el parámetro existiera.
   *
   * 🔴 SOLO TOCA EL SUELDO QUINCENAL. La RATA sigue saliendo de
   * `salarioMensual` —el sueldo COMPLETO— porque es lo que vale la hora de esa
   * persona: la contadora, textual, *«en ambas empresas su rata por hora es
   * 5.77»*. Con la rata sacada de los $200 de Fashion Wear su hora valdría
   * $1,15 y sus horas extra —que se pagan justamente ahí— se pagarían cinco
   * veces menos. Ver `reparto.ts`.
   */
  salarioDeLaParte: number | null = null,
): DineroLinea | null {
  const divisor = divisorDe(jornadaSemanal, reglas);
  if (divisor === null || !(salarioMensual > 0)) return null;

  // 🔴 LA RATA, DEL SUELDO COMPLETO. Esta línea NO mira `salarioDeLaParte`, y
  // ahí está todo el punto del reparto. Ver la nota del parámetro.
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
  //
  // 🔑 Y con `salarioDeLaParte` en `null` —que es el default— `base` ES
  // `salarioMensual`, o sea la MISMA línea de siempre para las 36 fichas sin
  // reparto. El `> 0` no está de adorno: un 0 o un `NaN` colado por un llamador
  // pagaría una quincena de $0 en silencio, que es justo lo que esta pantalla
  // existe para no hacer.
  const baseMensual =
    typeof salarioDeLaParte === "number" && Number.isFinite(salarioDeLaParte) && salarioDeLaParte > 0
      ? salarioDeLaParte
      : salarioMensual;
  const salarioQuincenal = centavos((baseMensual / 2) * factor);
  const extraDiurno = centavos(h(horas.extraDiurnoMin) * reglas.recargoExtraDiurno * rataHora);
  const extraNocturno = centavos(h(horas.extraNocturnoMin) * reglas.recargoExtraNocturno * rataHora);
  const excedente = centavos(h(horas.excedenteMin) * reglas.recargoExcedenteNocturnaMixta * rataHora);
  const domingos = centavos(h(horas.domingoMin) * reglas.recargoDomingoFeriado * rataHora);
  const feriados = centavos(h(horas.feriadoMin) * reglas.recargoDomingoFeriado * rataHora);
  // La ausencia va SIN recargo: es la hora que no se trabajó, ni más ni menos.
  // Esto es la ausencia de DÍA COMPLETO —quien no marcó ni una vez—, que no se
  // tocó y se sigue valuando `jornada × rata`.
  const ausenciaDeDiaCompleto = centavos(h(horas.ausenciaMin) * rataHora);

  // ── 🔴 LOS MINUTOS DE MÁS DE 30 TARDE CAMBIAN DE COLUMNA, NO DE PRECIO ─────
  //
  // Daniel, textual, elegido entre dos opciones: *"Los 45 minutos, igual que
  // una tardanza. La columna «Ausencia» es solo para que lo veas."*
  //
  // 🔴 EL REPARTO ESTÁ ESCRITO PARA QUE LA SUMA NO PUEDA MOVERSE, y ésa es la
  // única razón por la que se hace así y no calculando cada columna por su
  // lado. `centavos(a) + centavos(b)` NO es `centavos(a + b)`: dos columnas
  // redondeadas por separado se separan un centavo del total, y un centavo en
  // una planilla es todo lo que hace falta para que la contable no confíe.
  //
  //   tardanzaTotal   = lo de siempre, valuado EXACTAMENTE como ayer
  //   ausenciaPorTard = la parte que se muestra en «Ausencia»
  //   tardanzas       = tardanzaTotal − ausenciaPorTard   ← el RESTO, no un cálculo nuevo
  //
  // Así `tardanzas + ausencias` da idéntico a `tardanzaTotal + ausenciaVieja`,
  // que es lo que el bruto restaba ayer. No es "esperamos que dé cero": da cero
  // por cómo está escrito.
  const tardanzaTotal = centavos(horas.tardanzaMin * valorMinuto);
  const ausenciaPorTardanza = centavos((horas.tardanzaGraveMin || 0) * valorMinuto);
  const tardanzas = centavos(tardanzaTotal - ausenciaPorTardanza);

  // 🔴 LAS VACACIONES «YA PAGADAS» SE VALÚAN COMO UN DÍA NO TRABAJADO: jornada
  // × rata, SIN recargo, exactamente igual que una ausencia de día completo. No
  // es una fórmula nueva — es la misma, sobre otros minutos. Lo único distinto
  // es que se cuentan aparte para poder DECIR cuánto no se pagó y a quién.
  //
  // ⚠️ `|| 0`: un `HorasPersona` armado a mano sin este campo (hay tests viejos
  // que lo hacen) daría `NaN`, y `centavos(NaN)` es 0 — o sea un descuento que
  // desaparece en silencio. Acá el cero es explícito.
  const vacacionesYaPagadas = centavos(h(horas.vacacionesYaPagadasMin || 0) * rataHora);
  const ausencias = centavos(ausenciaDeDiaCompleto + ausenciaPorTardanza + vacacionesYaPagadas);

  const totalBruto = centavos(
    salarioQuincenal + extraDiurno + extraNocturno + excedente + domingos + feriados
    - ausencias - tardanzas,
  );

  // Los dos seguros salen del BRUTO, no del quincenal: así lo confirmó la
  // contable y así lo dice la fórmula de su cuadro.
  //
  // 🔴 Y VAN JUNTOS O NO VAN. `pagaSeguros` es UN interruptor para los dos
  // —Daniel: *"esto es junto, no es separado cada uno"*— y el Excel de la
  // contadora no tiene una sola fila con uno sí y el otro no. Apagado, las dos
  // columnas quedan en $0,00 y NADA MÁS cambia: el bruto, los recargos, las
  // ausencias y los montos escritos a mano son los mismos. Ver `seguros.ts`.
  //
  // ⚠️ El `!== false` no está de adorno: `undefined` tiene que caer del lado de
  // "sí se le cobra", que es lo que hacían las 38 fichas antes de esto.
  const conSeguros = pagaSeguros !== false;

  // ── 🔴 LA BASE PROPIA REEMPLAZA AL BRUTO, Y NO ENCIENDE NADA ───────────────
  //
  // 🩸 RODRIGO MIRANDA. La contadora, textual: *«su base para el cálculo del
  // seguro social y seguro educativo es 175.00 […] él está en una planilla
  // doméstica y con un menor salario»*. Sobre el bruto se le retenían $39,38 +
  // $5,05; sobre los $175 le tocan $17,06 + $2,19 — los dos montos que ella
  // escribió A MANO en su Excel, sin fórmula. Eran **$25,18 de más** por
  // quincena, a una persona de verdad. Ver `seguros-base.ts`.
  //
  // 🔴 EL ORDEN ES EL CANDADO, Y ES ESTE `conSeguros ?` QUE NO SE MUEVE. La
  // base contesta *«¿sobre cuánto?»*, no *«¿se le cobran?»*: quien tiene los
  // seguros apagados sigue con las dos columnas en $0,00 aunque tenga base
  // cargada. Si la base pudiera encenderlos, un monto tecleado en el campo de
  // al lado le empezaría a retener a alguien a quien la contadora no le
  // retiene — y eso se descubre el día de cobro. Hay un test que lo exige.
  //
  // ⚠️ SE REPARTE CON EL MISMO `factor` QUE EL QUINCENAL, y por la misma razón:
  // si no, media quincena pagaría medio sueldo y el seguro ENTERO, o sea que la
  // base sería el único renglón del cuadro que no se achica al achicar el
  // rango. Una quincena de verdad tiene factor 1 y `× 1` no mueve un número
  // IEEE-754: en toda planilla real la base es la que se escribió, clavada.
  //
  // ⚠️ El `> 0` no está de adorno: una base en 0 apagaría los seguros por un
  // camino distinto al del interruptor —sin chip, sin aviso y sin que la
  // pantalla diga nada—. Un 0 se lee como «no tiene base», igual que un `null`.
  const basePropia =
    typeof baseSegurosQuincena === "number"
    && Number.isFinite(baseSegurosQuincena)
    && baseSegurosQuincena > 0
      ? centavos(baseSegurosQuincena * factor)
      : null;
  const baseDeSeguros = basePropia ?? totalBruto;
  const seguroSocial = conSeguros ? centavos(baseDeSeguros * (reglas.seguroSocialPct / 100)) : 0;
  const seguroEducativo = conSeguros
    ? centavos(baseDeSeguros * (reglas.seguroEducativoPct / 100))
    : 0;

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
    ausencias, ausenciaPorTardanza, ausenciaDeDiaCompleto, vacacionesYaPagadas,
    tardanzas, totalBruto,
    // 🔑 `null` con los seguros apagados aunque haya base: ahí lo que hay que
    // mostrar es «sin seguros», no una base que no se usó para nada.
    baseSeguros: conSeguros ? basePropia : null,
    seguroSocial, seguroEducativo,
    isr: manuales.isr, prestamo: manuales.prestamo,
    terceros: manuales.terceros, mercancia: manuales.mercancia,
    totalDeducciones, otrosServicios: manuales.otrosServicios, netoPagar,
  };
}

/**
 * Minutos de hora extra → lo que valen, con los recargos vigentes y la rata de
 * la línea. `null` si no hubo ni un minuto.
 *
 * 🔴 UNA SOLA FUNCIÓN PARA LAS DOS COLUMNAS —lo que se pagó (`extraMedido`) y
 * lo que se dejó sin pagar por falta de aprobación (`extraNoAprobada`)—: así el
 * monto del aviso ámbar es EXACTAMENTE lo que la planilla pagaría al aprobar,
 * centavo por centavo, y no una segunda cuenta que pueda correrse. La fórmula
 * es la de `calcularDinero`: `h × recargo × rata`, a centavos por columna.
 *
 * `rataHora` en `null` = no se le pudo calcular pago: los minutos igual viajan
 * y el monto queda en `null`.
 */
export function resumenExtra(
  diurnoMin: number,
  nocturnoMin: number,
  rataHora: number | null,
  reglas: ReglasAsistencia,
): { minutos: number; diurnoMin: number; nocturnoMin: number; monto: number | null } | null {
  const minutos = diurnoMin + nocturnoMin;
  if (!(minutos > 0)) return null;
  const monto =
    rataHora === null
      ? null
      : centavos(
        centavos((diurnoMin / 60) * reglas.recargoExtraDiurno * rataHora)
        + centavos((nocturnoMin / 60) * reglas.recargoExtraNocturno * rataHora),
      );
  return { minutos, diurnoMin, nocturnoMin, monto };
}

/** Una línea completa: la ficha + sus horas + su dinero (o lo que le falta). */
export function armarLinea(
  ficha: FichaPlanilla,
  horas: HorasPersona,
  manuales: ManualesLinea,
  reglas: ReglasAsistencia,
  /** Fracción de quincena que paga el período. 1 = una quincena entera. */
  factorBase = 1,
  /**
   * El motivo por el que el sistema SE ABSTIENE y lo decide una persona
   * («entró el 10 de agosto», «Vacaciones del … al …»). `null` = se calcula.
   */
  decidirAMano: string | null = null,
  /**
   * La aprobación de las horas extra. Ver `aprobaciones.ts`.
   *
   * 🔑 OMITIRLO ES EL COMPORTAMIENTO DE SIEMPRE: sin este objeto no se exige
   * nada y se paga todo, hasta el centavo igual que antes de que existiera. Es
   * lo que hace que las llamadas viejas y los tests de la contable no se muevan.
   */
  extra: { exigirAprobacion?: boolean; aprobada?: boolean } = {},
  /**
   * 🔴 LA PARTE DEL SUELDO QUE ESTA LÍNEA PAGA, cuando está repartido entre dos
   * empresas. `null` —el default— es la línea entera de siempre: sin esto,
   * `armarLinea` devuelve exactamente lo que devolvía antes de que el reparto
   * existiera, hasta el centavo. Ver `ParteReparto` y `reparto.ts`.
   */
  parte: ParteReparto | null = null,
): LineaPlanilla {
  const faltaConfigurar = faltantesDe(ficha, reglas);
  // 🔴 EL CANDADO DEL PAGO, Y ES ESTA LÍNEA. Quien está marcado como servicio
  // profesional NO produce dinero **aunque tenga salario cargado**: el `if` no
  // pregunta por el sueldo, pregunta por la bandera. Si mañana alguien le
  // escribe un salario por error —o queda uno viejo de cuando sí iba en
  // planilla—, sigue sin calculársele un centavo. Sus HORAS, en cambio, se
  // miden y viajan igual: es la mitad que Daniel quiere conservar.
  const fueraDePlanilla = ficha.servicioProfesional === true;
  // 🔴 EL SEGUNDO CANDADO, Y ES EL QUE IMPIDE PAGARLE $300 A YEISHKA. Va en el
  // MISMO `if` que el de arriba a propósito: quien entró o salió a mitad del
  // período no produce un número, con salario cargado o sin él, marque lo que
  // marque. Un prorrateo automático acá sería inventar plata; abstenerse es lo
  // que este archivo ya hace en los otros dos casos que no puede saber.
  const seAbstiene = typeof decidirAMano === "string" && decidirAMano.trim() !== "";
  const motivoDecidir = seAbstiene ? decidirAMano!.trim() : null;

  // 🔴 EL TERCER CANDADO, Y ES EL QUE PROTEGE UN SUELDO FIJO DE MOVERSE SOLO.
  // Quien no marca el reloj cobra su quincenal y NADA MÁS: sin extras, sin
  // domingos, sin ausencias y sin tardanzas.
  //
  // 🩸 SE APLICA SIEMPRE, NO SOLO CUANDO NO HAY MARCAS, y ahí está todo el
  // punto. Si preguntara "¿marcó algo?", el día que alguien use su código —se
  // lo prestan, se lo reasignan, el aparato lo emite por error— le aparecerían
  // ausencias y horas extra INVENTADAS que le cambiarían el pago, y nadie lo
  // vería hasta el día de cobro. Un sueldo fijo que se mueve solo es
  // exactamente el error que este archivo existe para no cometer.
  //
  // 🔑 Se ceran las horas ACÁ y no en el llamador: `armarLinea` es lo único que
  // decide dinero, así que es el único lugar donde el candado no se puede
  // saltear. La jornada diaria se conserva —es del horario, no del reloj— para
  // que la línea siga sabiendo cuánto dura su día.
  const noMarca = ficha.noMarcaReloj === true;
  const horasMedidas: HorasPersona = noMarca
    ? { ...HORAS_CERO, jornadaDiariaMin: horas.jornadaDiariaMin }
    : horas;

  // ── 🔴 EL CUARTO CANDADO: SOLO SE PAGAN LAS HORAS EXTRA AUTORIZADAS ────────
  //
  // Contadora, textual: *«Sólo se pagan las horas extras autorizadas y las
  // reportadas por Julio Garay»*. Hasta hoy este archivo pagaba TODOS los
  // minutos que midió el reloj, y por eso la planilla nunca cuadró con ella: el
  // reloj mide bien, pero no sabe qué fue autorizado.
  //
  // 🔑 SE CERAN LOS MINUTOS, NO SE GUARDA UN NÚMERO APROBADO. La aprobación es
  // un permiso sobre (persona, período) y el reparto 1,25 / 1,50 lo sigue
  // haciendo `clasificarDia` con la base de cálculo que esté vigente. Si mañana
  // la salida pasa de las 17:00 a las 16:30, esto no cambia ni una línea.
  //
  // ⚠️ `exigirAprobacion` es FALSE por defecto — sin la tabla corrida se paga
  // todo, como hasta ahora. Fail-closed acá sería dejar a treinta personas sin
  // sus extras porque falta un archivo SQL. Se avisa, ver `aprobaciones.ts`.
  const exigir = extra.exigirAprobacion === true;
  const extraAprobada = !exigir || extra.aprobada === true;

  // 🔴 EL FILTRO VIVE EN `medirHoras`, Y ACÁ NO SE REPITE (27-ago-2026).
  //
  // Con la aprobación por DÍA, `horasMedidas` ya viene sin los recargos de los
  // días que nadie autorizó — y con lo que quedó afuera apartado en
  // `extraNoAprobadaMin`, para poder decirlo. Volver a poner los extras en cero
  // acá borraría la aprobación PARCIAL: a quien tiene el martes aprobado y el
  // miércoles no, se le pagaría CERO en vez del martes.
  //
  // 🩸 Ese era el bug, y lo cazó el candado: dos filtros para lo mismo, y el
  // segundo se comía al primero. `extraAprobada` queda como RÓTULO — dice si le
  // quedó algo sin aprobar— y no como interruptor.
  //
  // 🩸 Arreglado el 3-sep-2026: el aviso leía las horas ya filtradas. Lo que
  // quedó afuera viaja ahora en `extraNoAprobada` (abajo), valuado con la misma
  // rata; `extraMedido` NO es «lo que falta aprobar», es lo que se PAGÓ.
  // ── 🔴 EL QUINTO CANDADO: CADA COLUMNA DEL RELOJ CAE EN UNA SOLA LÍNEA ─────
  //
  // Con el sueldo repartido entre dos empresas, esta línea se queda SOLO con lo
  // que le toca: las horas extra si es la parte marcada, todo el resto del reloj
  // si es la parte principal. Sin `parte` no se toca un minuto y `horasDeLaParte`
  // ES `horasMedidas`, o sea la línea de siempre. Ver `repartirHoras`.
  //
  // 🩸 VA ACÁ Y NO EN EL LLAMADOR, igual que el candado del sueldo fijo:
  // `armarLinea` es lo único que decide dinero, así que es el único lugar donde
  // no se puede saltear. Repartido en el llamador, una ruta nueva pagaría las
  // horas extra en las dos empresas y nadie lo vería hasta el día de cobro.
  const horasEfectivas: HorasPersona = parte ? repartirHoras(horasMedidas, parte) : horasMedidas;

  // 🔴 LOS MONTOS ESCRITOS A MANO VAN CON EL RELOJ, Y A UNA SOLA LÍNEA. El ISR,
  // el préstamo, los terceros y la mercancía se cargan por PERSONA y quincena:
  // aplicarlos en las dos empresas le descontaría dos veces lo mismo.
  const manualesDeLaLinea: ManualesLinea =
    parte && !parte.llevaElReloj ? MANUALES_CERO : manuales;

  // 🔑 Los seguros: manda la ficha y después la parte. Un `false` en cualquiera
  // de los dos apaga las dos columnas — el interruptor de la ficha sigue siendo
  // el maestro, y la parte solo puede apagar, nunca encender.
  const conSegurosLinea = ficha.pagaSeguros !== false && (parte ? parte.pagaSeguros : true);

  const dinero =
    !fueraDePlanilla && !seAbstiene && faltaConfigurar.length === 0
      ? calcularDinero(
        ficha.salarioMensual as number, ficha.jornadaSemanal as number,
        horasEfectivas, manualesDeLaLinea, reglas, factorBase,
        // 🔑 `!== false`, no `=== true`: una ficha vieja sin el campo tiene que
        // seguir pagando seguros. Ver la nota de `FichaPlanilla.pagaSeguros`.
        conSegurosLinea,
        // 🔑 `?? null`: una ficha vieja sin el campo calcula los seguros sobre
        // el bruto, como siempre. Ver `FichaPlanilla.baseSeguros`.
        // ⚠️ La base propia va SOLO con el reloj: es un monto por QUINCENA y
        // aplicarlo en las dos líneas le calcularía el seguro dos veces sobre
        // los mismos $175. Ver `seguros-base.ts`.
        parte && !parte.llevaElReloj ? null : (ficha.baseSeguros ?? null),
        // 🔴 Lo que paga ESTA empresa al mes. La rata sigue saliendo del sueldo
        // completo, que es el primer argumento. Ver `reparto.ts`.
        parte ? parte.salarioMensual : null,
      )
      : null;

  // 🔑 Lo que le TOCARÍA de quincenal, solo para mostrárselo a quien decide.
  // Se calcula únicamente cuando no hubo dinero —así no hay dos cifras rivales
  // en la misma línea— y con la MISMA fórmula del quincenal de verdad.
  // 🔑 Con el sueldo repartido, lo que le tocaría en ESTA empresa es el monto de
  // ESTA parte: mostrarle el sueldo completo a quien decide una línea de $200 lo
  // mandaría a pagar $500 donde van $100.
  const salario = parte ? parte.salarioMensual : ficha.salarioMensual;
  const factorRef = Number.isFinite(factorBase) && factorBase > 0 ? factorBase : 1;
  const quincenalReferencia =
    dinero === null && typeof salario === "number" && Number.isFinite(salario) && salario > 0
      ? centavos((salario / 2) * factorRef)
      : null;

  // 🔴 LAS HORAS EXTRA QUE ESTA LÍNEA PAGÓ. Sale de `horasMedidas` —antes del
  // reparto— y ya viene SIN los días que nadie aprobó: `medirHoras` los apartó
  // en `extraNoAprobadaMin` (con su desglose diurno/nocturno).
  //
  // 🩸 Hasta el 3-sep-2026 el comentario de acá decía «pase lo que pase con la
  // aprobación», y el aviso ámbar de la planilla lo leía como si fuera lo que
  // faltaba aprobar. No lo era: con todo sin aprobar esto es `null`, y el aviso
  // nunca salió ni el freno del cierre frenó. Lo que falta aprobar va en
  // `extraNoAprobada`, abajo, valuado con la MISMA función.
  //
  // 🔑 El monto se valúa con la MISMA fórmula del pago (`h × recargo × rata`,
  // a centavos por columna) y con la rata que la línea usa de verdad. No es una
  // estimación: es exactamente lo que se paga —o lo que se pagaría al aprobar—.
  const rataDeLaLinea = dinero?.rataHora ?? null;
  const extraMedido = resumenExtra(
    horasMedidas.extraDiurnoMin, horasMedidas.extraNocturnoMin, rataDeLaLinea, reglas,
  );
  // 🔴 LO QUE NO SE PAGÓ, PARA PODER DECIRLO — de `horasEfectivas`, o sea de la
  // parte que lo pagaría si se aprobara. Misma rata, mismos recargos.
  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,
    rataDeLaLinea,
    reglas,
  );

  return {
    extraMedido,
    extraNoAprobada,
    extraAprobada,
    fueraDePlanilla,
    parte,
    // 🔑 Es el mismo booleano con el que se calculó, no una segunda lectura de
    // la ficha: si la parte apagó los seguros, el chip «sin seguros» tiene que
    // salir, y dos lecturas distintas del mismo hecho terminan contradiciéndose.
    pagaSeguros: conSegurosLinea,
    // 🔑 Solo si de verdad se va a usar: con los seguros apagados el sello que
    // corresponde es «sin seguros», no una base que no se aplicó. Y solo en la
    // línea que lleva el reloj, que es la única donde la base se aplicó.
    baseSeguros:
      conSegurosLinea
      && (!parte || parte.llevaElReloj)
      && typeof ficha.baseSeguros === "number"
      && Number.isFinite(ficha.baseSeguros)
      && ficha.baseSeguros > 0
        ? ficha.baseSeguros
        : null,
    noMarcaReloj: noMarca,
    decidirAMano: motivoDecidir,
    quincenalReferencia,
    codigo: ficha.codigo,
    etiqueta: etiquetaPersona(ficha.codigo, ficha.nombre),
    nombre: ficha.nombre ?? null,
    // 🔴 La empresa de la LÍNEA es la de la parte: es lo que decide en qué
    // cuadro sale y qué dice el encabezado. La de la ficha queda como la
    // «principal» de la persona y no se pierde — es la primera parte.
    empresa: parte ? parte.empresa : (ficha.empresa ?? null),
    empresaEtiqueta: parte
      ? etiquetaEmpresa(parte.empresa)
      : (ficha.empresa ? etiquetaEmpresa(String(ficha.empresa)) : null),
    // ⚠️ EL SUELDO COMPLETO, también en una línea repartida. Es el número del
    // que sale `dinero.rataHora` ($1.000 → $5,77) y ponerle los $200 de la parte
    // dejaría a la contadora viendo un salario con el que su rata no cuadra. El
    // monto de esta empresa viaja en `parte.salarioMensual`.
    salarioMensual: ficha.salarioMensual ?? null,
    jornadaSemanal: ficha.jornadaSemanal ?? null,
    horas: horasEfectivas,
    faltaConfigurar,
    // 🔑 Si `calcularDinero` devolvió `null` con la ficha completa, algo del
    // divisor no sirve. No se deja pasar como línea "buena y sin números".
    dinero: faltaConfigurar.length === 0 && dinero === null ? null : dinero,
    manuales: manualesDeLaLinea,
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
  /**
   * Código → motivo por el que el sistema SE ABSTIENE de calcularle pago, sea
   * lo que sea que haya marcado. Hoy lo llena la capa que lee las fichas con
   * quien entró o salió a mitad del período (`motivoPeriodoParcial`).
   *
   * 🔴 Sin este mapa NADIE queda fuera: el cuadro es idéntico al de siempre.
   * Es lo que hace que las 29 fichas sin `fecha_ingreso` se comporten como hoy.
   */
  decidirAMano?: ReadonlyMap<string, string>;
  /**
   * Código → justificación viva, para quien NO marcó ni un día en el período.
   *
   * 🔑 Solo se mira cuando la persona no tiene UNA sola marca: alguien con dos
   * días de vacaciones y trece trabajados cobra normal, y confundir los dos
   * casos le quitaría la quincena entera a quien sí vino.
   */
  justificados?: ReadonlyMap<string, string>;
  /**
   * 🔴 ¿SE EXIGE QUE LAS HORAS EXTRA ESTÉN APROBADAS?
   *
   * `false` por defecto y eso NO es un olvido: sin la tabla
   * `asistencia_horas_extra_aprobadas` corrida, el cuadro es idéntico al de
   * siempre y se paga todo lo que midió el reloj. Es la misma degradación que
   * el resto del módulo (ver `planilla-server.ts`), y acá pesa más que en otros
   * lados: cerrar por falta de un archivo SQL dejaría a treinta personas sin
   * sus extras el día de pago.
   */
  exigirAprobacionExtra?: boolean;
  /**
   * 🔴 `codigo|fecha` de cada DÍA con la hora extra autorizada (27-ago-2026).
   *
   * Antes era un set de CÓDIGOS: la aprobación cubría el período entero. Cambió
   * porque el corte de la quincena lo mueve la contadora, y con una llave por
   * período cada corrimiento volvía a preguntar todo desde cero. Un día es un
   * hecho y no depende de dónde alguien corte.
   *
   * ⚠️ La aprobación ahora puede ser PARCIAL: martes y jueves sí, miércoles no.
   * Por eso el filtro vive en `medirHoras`, al sumar, y no en un booleano al
   * final de la línea — ahí el detalle ya se perdió.
   */
  diasExtraAprobados?: ReadonlySet<string>;
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

  // 🔴 EN QUÉ EMPRESAS SALE ESTA FICHA. Con el sueldo repartido son DOS, y por
  // eso no se puede preguntar por `f.empresa` a secas: JULIO GARAY tiene que
  // aparecer en el cuadro de Vistana Y en el de Fashion Wear. Sin reparto es la
  // de siempre, una sola. Ver `reparto.ts`.
  const empresasDe = (f: FichaPlanilla): string[] => {
    const partes = partesUsables(f);
    if (partes.length > 0) return partes.map((p) => p.empresa);
    return f.empresa ? [String(f.empresa)] : [];
  };

  const codigos = new Set<string>();
  for (const [cod, f] of fichas) {
    if (!empresa || empresasDe(f).includes(empresa)) codigos.add(cod);
  }
  for (const p of personas) {
    const f = fichas.get(p.codigo);
    // Sin ficha entra siempre; con ficha, solo si es de esta empresa.
    if (!f || !empresa || empresasDe(f).includes(empresa)) codigos.add(p.codigo);
  }

  const lineas: LineaPlanilla[] = [];
  for (const cod of codigos) {
    const ficha: FichaPlanilla = fichas.get(cod) ?? {
      codigo: cod, nombre: null, salarioMensual: null, jornadaSemanal: null, empresa: null,
    };
    const p = reporteDe.get(cod);
    const h = p
      ? medirHoras(p, reglas, jornadaDiariaMin(cod), {
          exigir: opts.exigirAprobacionExtra === true,
          claves: opts.diasExtraAprobados ?? new Set<string>(),
          codigo: cod,
        })
      : { ...HORAS_CERO, jornadaDiariaMin: jornadaDiariaMin(cod) };

    // 🔴 EL MOTIVO POR EL QUE EL SISTEMA SE ABSTIENE. Son dos causas distintas
    // y la diferencia importa: la de vigencia manda SIEMPRE (Yeishka marcó seis
    // días y aun así no se le calcula), y la de la justificación solo cuando no
    // hay NI UNA marca en todo el período.
    // 🔴 A QUIEN NO MARCA NO SE LE BUSCA JUSTIFICACIÓN. Que no haya marcas no
    // es un hecho a explicar: es su forma de trabajar. Preguntarle a
    // `justificados` lo mandaría a «Tú decides» —con un texto de vacaciones
    // que además sería falso— justo el caso que esta bandera existe para sacar
    // de ahí. La de vigencia SÍ sigue mandando: entrar o salir a mitad del
    // período es otra cosa, no tiene nada que ver con el reloj.
    const noMarca = ficha.noMarcaReloj === true;
    const motivo =
      opts.decidirAMano?.get(cod)
      ?? (p || noMarca ? null : opts.justificados?.get(cod))
      ?? null;

    // 🔴 UNA LÍNEA POR PARTE. Sin reparto la lista es `[null]`, o sea UNA línea
    // con `parte = null`: literalmente el cuadro de siempre para las 36 fichas
    // que no reparten nada. Con reparto, JULIO GARAY sale en Vistana con sus
    // $800 y en Fashion Wear con sus $200 y sus horas extra.
    //
    // 🔑 El filtro por empresa va acá y no en la lista de códigos: la ficha
    // entra al cuadro por CUALQUIERA de sus partes, pero solo la parte de ESTA
    // empresa produce una línea. Sin esto, pedir el cuadro de Vistana traería
    // también la línea de Fashion Wear.
    const partes = partesUsables(ficha);
    const paraEstaEmpresa: Array<ParteReparto | null> =
      partes.length === 0
        ? [null]
        : partes.filter((pt) => !empresa || pt.empresa === empresa);

    for (const parte of paraEstaEmpresa) {
      const linea = armarLinea(
        ficha, h, normalizarManuales(opts.manuales?.get(cod)), reglas, factorBase, motivo,
        {
          exigirAprobacion: opts.exigirAprobacionExtra === true,
          // 🔑 Ya no es «este código está aprobado»: es «no le quedó ni un minuto
          // afuera». Con la aprobación por día alguien puede tener el martes sí y
          // el miércoles no, y `medirHoras` ya descontó lo que no se autorizó.
          aprobada: h.extraNoAprobadaMin <= 0,
        },
        parte,
      );
      // 🔑 A quien no va en planilla no se le agrega «no marcó ni un día»: eso es
      // un motivo por el que NO SE PUDO PAGAR, y acá no hay nada que pagar. Si le
      // faltan marcas, se ve en el reporte de asistencia, que es donde importa.
      //
      // 🔴 Y A QUIEN NO MARCA EL RELOJ TAMPOCO, por el motivo opuesto: acá SÍ hay
      // algo que pagar, y es justo lo que «no marcó ni un día» impediría. Sale con
      // su dinero calculado y sin ser el pendiente de nadie.
      //
      // ⚠️ Lo que le falte de FICHA se conserva igual —si no tiene salario, sigue
      // diciendo «falta el salario»—: esta bandera apaga el reloj, no la
      // obligación de tener los datos completos.
      if (linea.fueraDePlanilla || linea.noMarcaReloj) {
        lineas.push(linea);
        continue;
      }
      if (p) {
        lineas.push(linea);
      } else if (linea.faltaConfigurar.length > 0) {
        lineas.push({ ...linea, faltaConfigurar: [...linea.faltaConfigurar, FALTA.sinMarcaciones] });
      } else if (motivo) {
        // 🔴 NO SE LE AGREGA «no marcó ni un día»: ya se sabe POR QUÉ no marcó, y
        // está escrito al lado. Ese texto mandaba a arreglar algo en Configuración
        // que no había nada que arreglar — es todo el punto del cambio.
        lineas.push(linea);
      } else {
        // Con ficha completa, sin una sola marca y sin explicación: se lista. No
        // se inventa ni una renuncia ni unas vacaciones.
        lineas.push({ ...linea, faltaConfigurar: [FALTA.sinMarcaciones], dinero: null });
      }
    }
  }
  return ordenarLineas(lineas);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS TOTALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ `baseSeguros` SE QUEDA AFUERA a propósito, igual que la rata y el valor del
 * minuto: es el monto de UNA persona, no algo que se sume entre varias. Un
 * «total de bases» de $175 al pie de un cuadro de 19 personas sería un número
 * sin significado que alguien terminaría cotejando contra algo.
 */
export type TotalesPlanilla =
  Omit<DineroLinea, "rataHora" | "valorMinuto" | "baseSeguros"> & {
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
  /**
   * Cuántas quedaron para que las decida una persona (entró o salió a mitad del
   * período, o está justificada). 🔴 También APARTE de `sinConfigurar`: no hay
   * nada que configurarles y contarlas ahí es justo lo que mandaba a la
   * contadora a buscar en Configuración un arreglo que no existe.
   */
  decidirAMano: number;
};

export const TOTALES_CERO: TotalesPlanilla = {
  salarioQuincenal: 0, extraDiurno: 0, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 0, ausenciaPorTardanza: 0,
  ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0, tardanzas: 0, totalBruto: 0,
  seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0,
  mercancia: 0, totalDeducciones: 0, otrosServicios: 0, netoPagar: 0,
  personas: 0, sinConfigurar: 0, fueraDePlanilla: 0, decidirAMano: 0,
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
    // 🔴 Lo mismo con las que decide una persona, y el orden importa: se
    // pregunta ANTES que `!l.dinero`, que es el cajón de los pendientes.
    // ⚠️ `quincenalReferencia` NO se suma acá ni en ningún lado: es lo que le
    // TOCARÍA, no lo que se le paga. Sumarlo inflaría el total con plata que
    // nadie decidió pagar todavía.
    if (grupoDeLinea(l) === "decidir") { t.decidirAMano += 1; continue; }
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
    // Los dos desgloses de la ausencia se suman para poder EXPLICAR el total
    // («de los $18,26 de ausencia, $12,40 son de días que llegó muy tarde»).
    // No entran en ninguna otra cuenta: ya están adentro de `ausencias`.
    t.ausenciaPorTardanza = centavos(t.ausenciaPorTardanza + d.ausenciaPorTardanza);
    t.ausenciaDeDiaCompleto = centavos(t.ausenciaDeDiaCompleto + d.ausenciaDeDiaCompleto);
    // 🔴 Lo que la planilla DEJÓ DE PAGAR por vacaciones marcadas. Ya está
    // adentro de `ausencias`; se totaliza aparte para el aviso ámbar.
    t.vacacionesYaPagadas = centavos(t.vacacionesYaPagadas + d.vacacionesYaPagadas);
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
 * En qué cajón cae una línea. **Fuente ÚNICA**: la usan el orden del cuadro,
 * los totales, la pantalla, el Excel y el PDF.
 *
 * 🔑 Cuatro cajones y no dos, y la diferencia entre los dos últimos es de la que
 * se queja la contadora: «falta un dato» es algo que ELLA tiene que arreglar en
 * Configuración; «Tú decides» es algo que el sistema no puede saber y que
 * decide una persona. Mezclarlos manda a buscar un arreglo que no existe.
 *
 * ⚠️ Si a alguien le falta un dato Y además hay que decidirlo, gana «falta»: sin
 * la ficha completa no se puede decidir nada tampoco.
 */
export type GrupoLinea = "pagada" | "fuera" | "decidir" | "falta";

export function grupoDeLinea(l: LineaPlanilla): GrupoLinea {
  if (l.fueraDePlanilla) return "fuera";
  if (l.dinero) return "pagada";
  if (l.faltaConfigurar.length > 0) return "falta";
  if (l.decidirAMano) return "decidir";
  return "falta";
}

const ORDEN_GRUPO: Record<GrupoLinea, number> = { pagada: 0, fuera: 1, decidir: 2, falta: 3 };

/**
 * El orden del cuadro: primero los que se pagan, después los que no van en
 * planilla, después los que decide una persona, y al final los pendientes.
 *
 * 🔑 Los grupos van separados porque el Excel y el PDF recorren esta lista tal
 * cual: si los de servicio profesional quedaran mezclados entre los que sí
 * cobran, en el papel se leerían como filas con las columnas de dinero vacías.
 */
export function ordenarLineas(lineas: readonly LineaPlanilla[]): LineaPlanilla[] {
  return [...lineas].sort((a, b) => {
    const ga = ORDEN_GRUPO[grupoDeLinea(a)];
    const gb = ORDEN_GRUPO[grupoDeLinea(b)];
    if (ga !== gb) return ga - gb;
    if (ga === ORDEN_GRUPO.falta) {
      return a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" });
    }
    return a.etiqueta.localeCompare(b.etiqueta, "es", { sensitivity: "base" });
  });
}

/**
 * Saca del cuadro los códigos que marcaron y NO TIENEN FICHA.
 *
 * 🩸 `armarPlanilla` los mete en TODAS las empresas a propósito —no se les puede
 * adivinar cuál es la suya, y filtrarlos por empresa los borraría de las tres
 * pantallas a la vez—. El efecto colateral era que el código 50 aparecía TRES
 * veces, una por cuadro, como si fueran tres personas distintas.
 *
 * 🔴 LA INTENCIÓN SE CONSERVA ENTERA: no desaparecen, siguen viniendo en el
 * segundo arreglo del par para mostrarse UNA sola vez, arriba y fuera del cuadro
 * de cualquier empresa. Lo que cambia es dónde se ven, no si se ven.
 */
export function separarSinFicha(lineas: readonly LineaPlanilla[]): {
  lineas: LineaPlanilla[];
  sinFicha: LineaPlanilla[];
} {
  const dentro: LineaPlanilla[] = [];
  const sinFicha: LineaPlanilla[] = [];
  for (const l of lineas) {
    (l.faltaConfigurar.includes(FALTA.ficha) ? sinFicha : dentro).push(l);
  }
  return { lineas: dentro, sinFicha };
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
