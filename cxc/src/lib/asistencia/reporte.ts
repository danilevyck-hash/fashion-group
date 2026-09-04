// ─────────────────────────────────────────────────────────────────────────────
// El REPORTE de asistencia: de marcaciones sueltas a minutos que se discuten.
//
// Módulo PURO. Todas las reglas del negocio viven acá, en un solo lugar, para
// que cambiar una política sea cambiar una constante y no perseguir cuentas por
// media app.
//
// ── LOS NÚMEROS YA NO SON CONSTANTES ─────────────────────────────────────────
// Daniel, 6-ago-2026: *"todos los calculos deben de ser configurables en caso de
// que algo cambie"*. La tolerancia y el mínimo de horas extra entran por
// parámetro (`reglas`) y salen de `asistencia_reglas`. Lo que queda acá es el
// VALOR POR DEFECTO —el confirmado por la contable— para que el motor siga
// siendo puro y testeable sin base.
//
// ⚠️ EL ALMUERZO ES LA EXCEPCIÓN, y por pedido del propio Daniel (13-ago-2026):
// es FIJO en 30 minutos para todo el mundo, así que no entra por `reglas`. Ver
// `ALMUERZO_FIJO_MIN` en `config.ts`.
//
// ── LAS REGLAS, acordadas con Daniel el 5-ago-2026 ───────────────────────────
//
// 1. ENTRADA 8:00 CON TOLERANCIA (hoy 10 MINUTOS), y pasada la tolerancia se
//    cuenta DESDE LAS 8:00, no desde el fin de la gracia.
//    🩸 El "desde las 8:00" no es un detalle: si al que llega 8:11 le contaras
//    1 minuto, le acabás de enseñar que la entrada es 8:10.
//    🩸 La tolerancia arrancó en 5 y la contable la subió a 10 (6-ago-2026). Se
//    cambia en UN lugar: el default de `config.ts` o la fila de la base.
//
// 2. ALMUERZO 30 MINUTOS, IGUAL PARA TODOS. Se sigue leyendo de
//    `asistencia_horarios.almuerzo_minutos` (medido: las 33 personas con
//    horario tienen 30), y quien todavía no tenga fila cae en el mismo 30.
//    Ya no se puede elegir otro valor desde ninguna pantalla.
//
// 3. HORAS EXTRA: mínimo 10 minutos, y SE PAGAN BRUTAS (1-sep-2026).
//    🔴 El mínimo es una PUERTA, no un descuento: pasado el umbral se paga
//    TODO desde el primer minuto. Daniel, textual, preguntado «si se queda 25
//    minutos, ¿cuántos le pagás?»: *"25 minutos"*.
//    🔴 EL ATRASO DEL MISMO DÍA YA NO SE RESTA. Preguntado «llegó 20 tarde y
//    se quedó 30 → cobra 10 de extra, ¿sigue así?»: *"No, van separadas"*.
//    🩸 Hasta hoy se restaba, con el argumento de que el que llegó tarde y se
//    fue tarde RECUPERÓ. El problema de esa resta es que hacía que el atraso se
//    cobrara DOS veces —descontado por su lado y comido de la extra por el
//    otro— y encima invisible: no había forma de ver cuánta extra se había
//    perdido por llegar tarde. Ahora cada regla cobra sola. La tardanza se
//    sigue descontando, en `tiempoNoTrabajadoMin`, que es donde se mira.
//    ⚠️ No hay ninguna regla especial a los 60 minutos: *"nada especial: se
//    paga el tiempo exacto"*. Nadie agregue un redondeo a horas.
//    ⚠️ Acá solo se MIDEN. Que sean pagables lo decide una persona aprobándolas
//    — si no, cualquiera se gana un extra quedándose a conversar.
//
// 4. AUSENCIA: día hábil, sin ninguna marca, que no sea feriado ni tenga
//    justificación.
//
// 5. DÍA MAL MARCADO: **SÍ SUMA**, y además se marca para revisar.
//    🩸 Esto CONTRADICE lo que yo recomendé, y es decisión de Daniel:
//    *"quiero que sume lo que marca la persona pero si se detecta anomalía que
//    también marque para revisar, quiero que las personas sepan marcar bien, es
//    responsabilidad de ellos"*. El caso que lo motivó: Ángela García el 21-jul
//    marcó 12:41 · 13:07 · 17:04 (no marcó al entrar) → cuentan 281 minutos de
//    atraso. Es un número duro a propósito: si no doliera, nadie corregiría.
//    Por eso el resumen ADEMÁS separa cuántos de esos minutos vienen de días
//    marcados mal — para que nadie descuente sobre un dato sin haberlo mirado.
//
// 6. 🔴 UN DÍA QUE TODAVÍA NO PASÓ NO ES UN DÍA MAL MARCADO, Y NO ES UNA
//    AUSENCIA. Es la regla 5 leída con el calendario en la mano: "no tiene 4
//    marcas" solo significa algo cuando el día se acabó.
//    🩸 Medido el 13-ago-2026 a las ~15:00: **27 de 32 personas tenían 3
//    marcas** —entraron, almorzaron, volvieron y todavía no se habían ido— y el
//    reporte contaba a las 27 como error. Toda la oficina en rojo, todas las
//    tardes, todos los días. Un aviso que suena siempre deja de leerse, y de
//    paso empujaba el porcentaje de días mal marcados del 17% al 26%.
//    Lo mismo con la ausencia: a las 8:59 nadie faltó todavía.
//
//    🔴 Y NO ES SOLO HOY: SON HOY Y TODOS LOS QUE VIENEN DESPUÉS. Esto empezó
//    valiendo para un día —`fecha === diaEnCurso`— y esa versión dejaba
//    entrar por la ventana el mismo error que cerraba por la puerta. Medido
//    contra producción el 14-ago-2026, quincena del 1 al 15: la planilla
//    descontaba **$1.127,78** de ausencia y **$866,99 de eso eran del 14, el
//    día de hoy**, con las 33 personas "ausentes" a media mañana. Excluyendo
//    solo hoy quedaban los días siguientes: abierta la quincena un día 3, los
//    ~9 días hábiles que faltan se descuentan **a ~$870 cada uno** por gente
//    que todavía no tuvo oportunidad de venir a trabajar. Un día futuro no es
//    que "no terminó": es que ni siquiera empezó.
//
//    ⚠️ Las marcas del día SÍ se muestran y sus minutos SÍ se calculan — lo
//    único que se suspende hasta que el día cierre es el JUICIO sobre él. Para
//    un día futuro no hay nada que calcular: no existe una marca todavía.
//    ⚠️ Entra por parámetro (`diaEnCurso`) y sin él NADA cambia. Lo pasan el
//    Reporte y la PLANILLA, los dos con el día-calendario de PANAMÁ
//    (`hoyPanama()`) — en UTC pelado, entre las 7 p.m. y la medianoche el día
//    salta y el reporte se equivoca todas las noches. Agrupar por UTC ya dio
//    números falsos dos veces en este módulo.
// ─────────────────────────────────────────────────────────────────────────────

import { ALMUERZO_FIJO_MIN, REGLAS_DEFAULT, type ReglasAsistencia } from "./config";
// 🔑 Un motivo de justificación puede significar "trabajó, pero no acá". El
// motor lo necesita para NO contar esos días como ausencias justificadas.
import { esTrabajoDeVendedor } from "./motivos";
import { minutosPerdonados, textoPermiso, ventanaDe } from "./permiso-horas";
// 🔴 UN DÍA DE VACACIONES NO SE CALCULA. Ver `vacaciones.ts`: aunque la persona
// haya pasado por el reloj, ese día no genera horas, ni tardanza, ni ausencia.
import { vacacionDe, type DiaVacacion, type Vacacion } from "./vacaciones";
// 🔑 SOLO EL TIPO. `correcciones.ts` importa `diaPanama` de acá (un valor), así
// que un import normal armaría un ciclo en tiempo de ejecución; `import type`
// se borra al compilar y no queda ninguno.
import type { CorreccionVisible } from "./correcciones";

/** Panamá es UTC−5 fijo, sin horario de verano. */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Los tres números que el motor usa. Son los VALORES POR DEFECTO: si no se le
// pasan reglas, se comporta como la configuración confirmada por la contable.
// Se re-exportan desde acá para que quien ya los importaba no tenga dos fuentes.
export const TOLERANCIA_MIN = REGLAS_DEFAULT.toleranciaTardanzaMin;
/**
 * El almuerzo de quien todavía no tiene fila en `asistencia_horarios`.
 *
 * 🔑 Ya NO sale de las reglas configurables: es fijo en 30 minutos y se lee de
 * `ALMUERZO_FIJO_MIN`, la única fuente. Se re-exporta con el nombre de siempre
 * para no partir en dos a quien ya lo importaba.
 */
export const ALMUERZO_DEFAULT_MIN = ALMUERZO_FIJO_MIN;
export const EXTRA_MINIMO_MIN = REGLAS_DEFAULT.extraMinimoMin;
export const ENTRADA_DEFAULT = "08:00";
export const SALIDA_DEFAULT = "17:00";

/** Lo único de `asistencia_reglas` que el reporte de minutos usa hoy. */
export type ReglasReporte = Pick<
  ReglasAsistencia,
  "toleranciaTardanzaMin" | "extraMinimoMin"
>;

export interface Marcacion {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  /**
   * El `id` de la fila en `asistencia_marcaciones`.
   *
   * Opcional a propósito: los tests del motor y cualquier consumidor viejo
   * siguen andando sin él. Lo usan las CORRECCIONES, para poder decir cuál de
   * las marcas del día se está corrigiendo. Una marca AGREGADA a mano no tiene
   * `id` —no existe en la tabla del reloj— y eso es lo que la distingue.
   */
  id?: string | null;
}

export interface HorarioPersona {
  empleado_codigo: string;
  entrada: string;   // "08:00"
  salida: string;    // "16:30" | "17:00"
  almuerzo_minutos: number;
}

export interface Justificacion {
  empleado_codigo: string;
  desde: string; // YYYY-MM-DD
  hasta: string;
  motivo: string;
  /**
   * Opcionales, y VIAJAN JUNTAS: "HH:MM" o "HH:MM:SS". Con las dos, el permiso
   * es de HORAS —perdona la tardanza que cae adentro de esa ventana y NADA
   * MÁS—; sin ellas es lo de siempre, el día entero justificado.
   *
   * 🔴 No existen hasta que se corra `MIGRACION_PERMISO_HORAS`, y sin ellas
   * TODO se comporta exactamente igual que hoy. Ver `permiso-horas.ts`.
   */
  hora_desde?: string | null;
  hora_hasta?: string | null;
}

export interface DiaReporte {
  fecha: string;
  /** Horas HH:MM en orden. Normalmente 4. */
  marcas: string[];
  /**
   * El `id` de cada marca de `marcas`, en el MISMO orden. `null` = esa marca no
   * viene del reloj (se agregó a mano con una corrección), así que no hay una
   * fila que corregir: se deshace la corrección que la creó.
   *
   * 🔑 Existe para que la pantalla sepa QUÉ corregir al tocar una hora. No entra
   * en ninguna cuenta.
   */
  marcasIds: (string | null)[];
  entrada: string | null;
  salida: string | null;
  tardeMin: number;
  excesoAlmuerzoMin: number;
  salidaTempranaMin: number;
  extraMin: number;
  trabajadoMin: number;
  /** El día no tiene 4 marcas: los números salen igual, pero hay que revisarlo. */
  revisar: boolean;
  /**
   * El día TODAVÍA NO PASÓ: es hoy (que sigue corriendo) o es posterior a hoy,
   * en hora de Panamá. Ver regla 6.
   *
   * 🔴 Mientras esto sea `true`, `revisar` y `ausente` van SIEMPRE en `false`:
   * no se puede juzgar un día que no terminó, y menos uno que no empezó. Las
   * marcas y los minutos se calculan y se muestran igual — lo único que se
   * suspende es el veredicto.
   *
   * `false` en todos los días de un rango que ya cerró: ahí no hay nada que
   * suspender y el cálculo es idéntico al de siempre.
   */
  enCurso: boolean;
  ausente: boolean;
  /**
   * Este día está cubierto por unas VACACIONES. `null` = no lo está.
   *
   * 🔴 CUANDO ESTO NO ES `null`, TODO LO DE ARRIBA VA EN CERO Y `marcas` VA
   * VACÍO — aunque la persona haya marcado. Es el punto entero de las
   * vacaciones: no genera horas, ni tardanza, ni ausencia. Las horas que sí
   * marcó viajan en `vacacion.marcasIgnoradas` para que la pantalla pueda
   * mostrarlas: descartarlas está bien, esconderlas no.
   *
   * ⚠️ Es EXCLUYENTE con `justificado` y con `ausente`: una vacación gana. Un
   * día de vacaciones no es una falta que haya que explicar.
   */
  vacacion: DiaVacacion | null;
  justificado: string | null;
  /**
   * El permiso de HORAS que cubre este día, ya escrito («Escolares — permiso de
   * 08:00 a 10:00»). `null` = no hay, o la justificación es de día entero.
   *
   * 🔑 Es EXCLUYENTE con `justificado`: una justificación con horas NO justifica
   * el día. Ver `permiso-horas.ts`.
   */
  permiso: string | null;
  /** Cuántos minutos de tardanza perdonó ese permiso. Ya están descontados de
   *  `tardeMin`: esto es para poder EXPLICARLO, no para volver a restarlo. */
  permisoPerdonaMin: number;
  feriado: string | null;
  /**
   * El día cae de lunes a viernes.
   *
   * 🩸 Existe por la PLANILLA: los domingos se pagan al 1.5 y para eso el motor
   * tiene que verlos (`incluirNoHabiles`). Pero un domingo sin marcas NO es una
   * ausencia —nadie faltó, es domingo—, y sin este campo el mismo `if` que
   * detecta la ausencia se los tragaría a todos.
   */
  habil: boolean;
  /**
   * Las horas de este día que se tocaron a mano (`asistencia_correcciones`).
   *
   * 🔴 ES INFORMATIVO Y NADA MÁS: cuando este arreglo trae algo, las horas
   * corregidas YA vienen dentro de `marcas` —la corrección se aplica ANTES de
   * llegar acá, en `aplicarCorrecciones`— así que ningún número de arriba se
   * calcula con este campo. Existe para que el reporte pueda mostrar las dos
   * horas (la del reloj y la corregida) sin que nadie tenga que abrir otra
   * pantalla, y para que no haya forma de leer un total sin enterarse.
   */
  correcciones: CorreccionVisible[];
}

export interface PersonaReporte {
  codigo: string;
  /**
   * El nombre configurado en `asistencia_personas`, o `null` si nadie se lo
   * puso todavía. 🩸 NO sale del reloj: `empleado_nombre` viene vacío en las
   * 3.287 marcaciones cargadas. Quien lo pinte usa `etiquetaPersona`, que cae
   * al código en vez de dejar la celda en blanco.
   */
  nombre: string | null;
  salida: string;
  almuerzoMin: number;
  /**
   * 🔴 `true` = servicio profesional: se le miden tardanzas y ausencias, y NO
   * se le cuentan las horas extra (3-sep-2026). Daniel, textual: *«yulisa
   * marca pero no deberia de calcular ya que es salario fijo, es solo para ver
   * sus tardanzas y ausencias»*. El motor sigue midiendo `extraMin` —es lo que
   * marcó el reloj—; la bandera la pone la RUTA desde la ficha, y la pantalla,
   * el Excel y el PDF muestran «—» en esa columna y no la suman al total.
   * Opcional a propósito: sin ficha, o en cualquier llamada vieja, no cambia
   * nada. Quien decida algo con esto pregunta por `cuentaHorasExtra`.
   */
  servicioProfesional?: boolean;
  dias: DiaReporte[];
  resumen: {
    diasTrabajados: number;
    ausenciasSinJustificar: number;
    /**
     * Días sin marcas cubiertos por una justificación que SÍ es una ausencia
     * (vacaciones, incapacidad, permiso, luto, otro).
     *
     * 🔑 NO incluye los de «Trabajo fuera de la oficina»: esos van aparte en
     * `diasTrabajandoFuera`. Los dos conjuntos son DISJUNTOS a propósito —
     * sumarlos bajo la misma etiqueta es justo lo que este motivo vino a
     * eliminar. Ningún número histórico se mueve: hasta hoy ese motivo no
     * existía, así que no había un solo día que sacar de acá.
     */
    ausenciasJustificadas: number;
    /**
     * Días sin marcas en los que la persona estaba TRABAJANDO, fuera de la
     * oficina. No son ausencias y no se cuentan como tales.
     */
    diasTrabajandoFuera: number;
    /**
     * Días del rango cubiertos por unas VACACIONES. Van APARTE de las ausencias
     * —justificadas o no— porque no son ausencias: la persona no faltó.
     */
    diasVacaciones: number;
    /**
     * De esos, los que están marcados «ya se le pagó». Son los únicos que la
     * planilla deja de pagar, y por eso se cuentan solos.
     */
    diasVacacionesYaPagadas: number;
    vecesTarde: number;
    minutosTarde: number;
    /** De `minutosTarde`, cuántos salen de días mal marcados. Ver regla 5. */
    minutosTardeDeDiasARevisar: number;
    /** Días cubiertos por un permiso de HORAS (no son ausencias: la persona
     *  vino, con permiso para llegar más tarde). */
    diasConPermiso: number;
    /** Minutos de tardanza que perdonaron esos permisos. Ya están FUERA de
     *  `minutosTarde`; se guardan para poder explicar la diferencia. */
    minutosPerdonadosPorPermiso: number;
    excesoAlmuerzoMin: number;
    salidaTempranaMin: number;
    extraMin: number;
    diasARevisar: number;
    /**
     * Cuántos días del rango TODAVÍA NO PASARON: hoy más los que vengan
     * después, si el rango llega hasta allá. Ver regla 6.
     *
     * 🔑 Se devuelve para que la pantalla pueda decir *"estos días todavía no
     * pasaron"* en vez de esconderlos: un día que desaparece de la cuenta sin
     * explicación se lee como un número que no cuadra. Va SIEMPRE aparte de
     * `diasARevisar`, nunca sumado.
     */
    diasEnCurso: number;
    tiempoNoTrabajadoMin: number;
    /** Días de esta persona con al menos una hora corregida a mano. */
    diasCorregidos: number;
    /** Cuántas horas se tocaron a mano en total, en todo el rango. */
    correcciones: number;
  };
}

/**
 * ¿Se le cuentan las horas extra a esta persona? Al servicio profesional no
 * (3-sep-2026). Es la ÚNICA pregunta que hacen la pantalla, el Excel y el PDF
 * del Reporte antes de mostrar o sumar `extraMin`: una sola definición, para
 * que la columna y el total no puedan discrepar.
 */
export function cuentaHorasExtra(p: Pick<PersonaReporte, "servicioProfesional">): boolean {
  return p.servicioProfesional !== true;
}

/** `extraMin` si se le cuenta; 0 si no. Para los totales. */
export function extraQueCuenta(p: Pick<PersonaReporte, "servicioProfesional" | "resumen">): number {
  return cuentaHorasExtra(p) ? p.resumen.extraMin : 0;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** El día-calendario de Panamá de un instante ISO. */
export function diaPanama(iso: string): string {
  return new Date(Date.parse(iso) - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * SEGUNDOS desde medianoche, en hora de Panamá. Es la unidad con la que se mide
 * todo el día: el instante exacto que marcó la persona, sin tocar.
 *
 * 🩸 ACÁ ESTABA EL REDONDEO QUE DANIEL CAZÓ (13-ago-2026), textual: *"y la
 * marcancion tiene que ser al segundo, porque redondeas minutos"*. Esta función
 * devolvía MINUTOS y empujaba los segundos al minuto más cercano
 * (`segundos >= 30 ? 1 : 0`), con el argumento de que "discutir por segundos es
 * lo que la tolerancia evita". El argumento confundía dos cosas: **medir** y
 * **perdonar**. La tolerancia perdona 10 minutos a la entrada y sigue igual; lo
 * que no se puede es medir mal a la salida, porque ahí no hay nada que perdonar
 * y el error se paga: hasta 30 segundos por marca, cuatro marcas al día, en
 * horas extra que se multiplican por 1.25 o 1.50.
 *
 * El dato SIEMPRE estuvo completo — las marcaciones de producción traen los
 * segundos —: lo que se perdía era acá, en el cálculo.
 */
export function segundosDelDia(iso: string): number {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/**
 * Minutos ENTEROS desde medianoche, redondeados.
 *
 * ⚠️ NO se usa para calcular nada de plata. Su único consumidor es la SUGERENCIA
 * de hora de salida (`salidaSugerida`), que elige entre 16:30 y 17:00 con la
 * mediana de las últimas marcas: ahí los segundos no cambian ninguna decisión.
 */
export function minutosDelDia(iso: string): number {
  return Math.round(segundosDelDia(iso) / 60);
}

export function horaPanama(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/**
 * "HH:MM" o "HH:MM:SS" → minutos, CON DECIMALES.
 *
 * 🔑 Los segundos entran como fracción de minuto en vez de descartarse: esta
 * función también parsea las horas de las MARCAS (que ahora traen segundos), y
 * truncarlas acá devolvería el redondeo por la puerta de atrás.
 */
function hhmmAMin(hhmm: string): number {
  const [h, m, sg] = String(hhmm ?? "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0) + (sg || 0) / 60;
}

/** Segundos desde medianoche de una hora "HH:MM" (o "HH:MM:SS"). */
function hhmmASeg(hhmm: string): number {
  return Math.round(hhmmAMin(hhmm) * 60);
}

/**
 * Un tiempo en minutos, como se MUESTRA.
 *
 * 🔑 Se calcula al segundo y se muestra con 2 decimales cuando hay fracción.
 * Es la forma que no miente y además SUMA: en una columna de minutos, "30.48"
 * más "12.02" da lo que dice el total, cosa que no pasa si cada celda se
 * redondea al entero. Los enteros se siguen viendo enteros («30 min»), que es
 * el 99% de los casos en pantalla.
 */
export function fmtMin(min: number): string {
  if (!Number.isFinite(min)) return "0";
  const r = Math.round(min * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** ¿La fecha cae de lunes a viernes? Nadie trabaja sábado de rutina: medido. */
export function esHabil(fecha: string): boolean {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Los días del rango que el reporte recorre.
 *
 * Por defecto solo los hábiles —es lo que el Reporte siempre mostró—. Con
 * `todos` entran también sábados y domingos, que es lo que necesita la
 * PLANILLA: el 26 de julio de 2026 (domingo) hay 5 personas con marcas, y sin
 * este camino esas horas al 1.5 simplemente no existirían para el cálculo.
 */
function diasDelRango(desde: string, hasta: string, todos: boolean): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    const iso = d.toISOString().slice(0, 10);
    if (todos || esHabil(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * La justificación que cubre este día, o `null`.
 *
 * 🔴 SE DEVUELVE LA FILA ENTERA Y NO SOLO EL MOTIVO, porque desde el
 * 25-ago-2026 la diferencia entre "el día entero" y "un permiso de dos horas"
 * está en las horas, y quedarse con el motivo la borraría.
 */
function justificacionDe(
  justis: readonly Justificacion[],
  codigo: string,
  fecha: string,
): Justificacion | null {
  return justis.find(
    (x) => x.empleado_codigo === codigo && x.desde <= fecha && fecha <= x.hasta,
  ) ?? null;
}

export function armarReporte(opts: {
  marcaciones: readonly Marcacion[];
  horarios: readonly HorarioPersona[];
  justificaciones: readonly Justificacion[];
  /**
   * Las VACACIONES que tocan el rango.
   *
   * 🔴 SIN ESTO NADA CAMBIA. Es un arreglo opcional y vacío por defecto: el
   * motor da EXACTAMENTE los mismos números que daba antes de que las
   * vacaciones existieran, que es lo que hace que la tabla nueva pueda tardar
   * en correrse sin mover un centavo.
   */
  vacaciones?: readonly Vacacion[];
  feriados: ReadonlyMap<string, string>;
  desde: string;
  hasta: string;
  /** Lo configurado en `asistencia_reglas`. Sin esto, los valores por defecto. */
  reglas?: Partial<ReglasReporte>;
  /**
   * Código del reloj → nombre, del directorio (`asistencia_personas`).
   *
   * 🩸 Manda sobre el nombre que venga en la marcación. El reloj lo manda vacío
   * en las 3.287 filas cargadas, así que sin esto el reporte —y con él el Excel
   * y el PDF— salen con números pelados en la columna Persona.
   */
  nombres?: ReadonlyMap<string, string>;
  /**
   * Recorrer TODOS los días del rango, no solo lunes a viernes.
   *
   * Lo usa la PLANILLA, que necesita los domingos trabajados (se pagan al 1.5).
   * El Reporte no lo pasa y sigue viendo exactamente lo que veía antes.
   */
  incluirNoHabiles?: boolean;
  /**
   * EL PRIMER DÍA QUE TODAVÍA NO PASÓ: hoy, en formato `YYYY-MM-DD` y **en hora
   * de Panamá** (`hoyPanama()`). Ese día **y todos los posteriores** dejan de
   * juzgarse. Ver regla 6.
   *
   * 🔴 ES `>=`, NO `===`, Y ESA LETRA VALE $870 POR DÍA. Con la igualdad, abrir
   * una quincena el día 3 dejaba los ~9 días hábiles que faltan contándose como
   * falta de las 33 personas. El nombre se conserva —lo usan la ruta del
   * Reporte y sus tests— pero lo que significa es "de acá en adelante todavía
   * no pasó nada".
   *
   * 🔴 NO se calcula acá a propósito: este módulo es PURO y no puede mirar el
   * reloj, o los tests dependerían de la hora a la que se corran. Lo pasa quien
   * llama: el Reporte y la Planilla.
   *
   * ⚠️ No hace falta comprobar que caiga dentro de `[desde, hasta]`: si el rango
   * termina antes de hoy, ningún día del recorrido lo alcanza y no hay nada que
   * excluir. Ése es justamente el borde — un rango pasado se juzga entero.
   */
  diaEnCurso?: string | null;
  /**
   * Qué horas se tocaron a mano, por `codigo|fecha` (ver `llaveDia`).
   *
   * 🔴 ES SOLO PARA MOSTRAR. Las horas corregidas ya vienen dentro de
   * `marcaciones` (las aplica `aplicarCorrecciones` antes de llamar acá): este
   * mapa NO entra en ninguna cuenta. Sin él, el motor da EXACTAMENTE los mismos
   * números que daba antes de que las correcciones existieran.
   */
  correccionesPorDia?: ReadonlyMap<string, readonly CorreccionVisible[]>;
}): PersonaReporte[] {
  const { marcaciones, horarios, justificaciones, feriados, desde, hasta, nombres } = opts;
  const vacaciones = opts.vacaciones ?? [];

  // 🔑 Nunca se toma un valor a medias: un `undefined` en `reglas` cae al
  // default, no a `NaN`. Con `NaN` de tolerancia toda comparación da `false` y
  // NADIE llegaría tarde nunca — un fallo silencioso que se paga en planilla.
  const num = (v: number | undefined, def: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
  const toleranciaMin = num(opts.reglas?.toleranciaTardanzaMin, TOLERANCIA_MIN);
  const extraMinimoMin = num(opts.reglas?.extraMinimoMin, EXTRA_MINIMO_MIN);
  // ⛔ El almuerzo NO entra por `reglas`: es fijo (ver `ALMUERZO_FIJO_MIN`).

  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const habiles = diasDelRango(desde, hasta, opts.incluirNoHabiles === true);

  // Agrupar marcaciones por persona y día.
  const porPersona = new Map<
    string,
    {
      nombre: string | null;
      dias: Map<string, number[]>;
      /**
       * `dia` → (segundo del día → id de la marcación). Es lo único que se
       * agrega a la agrupación, y NO toca la aritmética: los cálculos siguen
       * leyendo `dias`, el mismo arreglo de números de siempre. Sirve para que
       * la pantalla sepa qué fila corregir al tocar una hora.
       */
      ids: Map<string, Map<number, string>>;
    }
  >();
  for (const m of marcaciones) {
    const cod = (m.empleado_codigo ?? m.empleado_nombre ?? "").trim();
    if (!cod || !m.ocurrio_en) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (dia < desde || dia > hasta) continue;
    let p = porPersona.get(cod);
    if (!p) { p = { nombre: m.empleado_nombre, dias: new Map(), ids: new Map() }; porPersona.set(cod, p); }
    if (!p.nombre && m.empleado_nombre) p.nombre = m.empleado_nombre;
    const lista = p.dias.get(dia);
    // 🔑 SEGUNDOS, no minutos: el instante exacto que marcó la persona.
    const seg = segundosDelDia(m.ocurrio_en);
    if (lista) lista.push(seg);
    else p.dias.set(dia, [seg]);
    if (m.id) {
      const del = p.ids.get(dia);
      if (del) del.set(seg, String(m.id));
      else p.ids.set(dia, new Map([[seg, String(m.id)]]));
    }
  }

  const out: PersonaReporte[] = [];
  for (const [codigo, p] of porPersona) {
    const h = horarioDe.get(codigo);
    // 🔑 TODO EL DÍA SE MIDE EN SEGUNDOS. Los umbrales de negocio siguen siendo
    // en minutos (la tolerancia, el mínimo de extra, el almuerzo) y se escalan
    // acá: medir fino y perdonar en minutos es lo correcto.
    const entradaProgSeg = hhmmASeg(h?.entrada ?? ENTRADA_DEFAULT);
    const salidaProgSeg = hhmmASeg(h?.salida ?? SALIDA_DEFAULT);
    // 🔑 La columna por persona SE SIGUE LEYENDO —es lo que Daniel pidió que no
    // se tocara— y solo cae al fijo quien todavía no tiene horario guardado.
    const almuerzoProg = h?.almuerzo_minutos ?? ALMUERZO_FIJO_MIN;
    const almuerzoProgSeg = almuerzoProg * 60;
    const toleranciaSeg = toleranciaMin * 60;
    const extraMinimoSeg = extraMinimoMin * 60;

    const dias: DiaReporte[] = [];
    for (const fecha of habiles) {
      const feriado = feriados.get(fecha) ?? null;
      const just = justificacionDe(justificaciones, codigo, fecha);
      const ventana = just ? ventanaDe(just.hora_desde, just.hora_hasta) : null;
      // 🔴 UN PERMISO DE HORAS NO JUSTIFICA EL DÍA ENTERO. `justificado` es lo
      // que decide si un día SIN MARCAS deja de ser ausencia, y dos horas de
      // permiso no explican no haber venido: eso borraría ocho horas de sueldo
      // y nadie lo vería hasta el día de pago. Con ventana, el día NO queda
      // justificado y el permiso solo perdona minutos de tardanza más abajo.
      const justificado = just && !ventana ? just.motivo : null;
      /** El permiso de horas, tal como se muestra. `null` = no hay. */
      const permiso = just && ventana
        ? textoPermiso(just.motivo, just.hora_desde, just.hora_hasta)
        : null;
      const habil = esHabil(fecha);
      // Regla 6. Hoy sigue corriendo y mañana ni empezó: no se los juzga.
      // 🔴 `>=`, no `===`. Ver la nota de `diaEnCurso`.
      const enCurso = !!opts.diaEnCurso && fecha >= opts.diaEnCurso;
      // Segundos desde medianoche, en orden.
      const crudas = (p.dias.get(fecha) ?? []).slice().sort((a, b) => a - b);
      // Informativo: qué horas de este día se tocaron a mano. No entra en
      // ninguna cuenta — ver la nota de `correccionesPorDia`.
      const correcciones = [...(opts.correccionesPorDia?.get(`${codigo}|${fecha}`) ?? [])];

      // ── 🔴 VACACIONES: ACÁ NO SE CALCULA NADA, Y VA PRIMERO ────────────────
      //
      // Antes de mirar las marcas, antes de la tardanza, antes de la ausencia.
      // Daniel, textual: *"si alguien pasó por el reloj estando de vacaciones,
      // no genera horas, ni tardanza, ni ausencia"*.
      //
      // 🩸 Y por eso el `return` está ACÁ y no en un `if` más abajo: cualquier
      // cosa que se calcule antes es una cuenta que después hay que acordarse
      // de anular, y basta con olvidarse de una para que un día de vacaciones
      // aparezca con 47 minutos de tardanza el día de pago.
      //
      // ⚠️ Las marcas NO se pierden: viajan en `marcasIgnoradas` y la pantalla
      // las muestra. Descartar un dato está bien; descartarlo en silencio no.
      const vac = vacacionDe(vacaciones, codigo, fecha);
      if (vac) {
        const marcadas = (p.dias.get(fecha) ?? []).slice().sort((a, b) => a - b);
        dias.push({
          fecha, marcas: [], marcasIds: [], entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false,
          enCurso,
          // 🔴 NUNCA una ausencia. Quien está de vacaciones no faltó.
          ausente: false,
          vacacion: {
            yaPagadas: vac.ya_pagadas === true,
            marcasIgnoradas: marcadas.map(
              (seg) =>
                `${p2(Math.floor(seg / 3600))}:${p2(Math.floor((seg % 3600) / 60))}:${p2(seg % 60)}`,
            ),
          },
          // 🔑 `null` a propósito, aunque haya una justificación cargada encima:
          // el renglón tiene que decir «Vacaciones» y una sola cosa. Dos
          // etiquetas para el mismo día es la forma de que la pantalla y el
          // papel terminen diciendo cosas distintas.
          justificado: null, permiso: null, permisoPerdonaMin: 0,
          feriado, habil,
          correcciones,
        });
        continue;
      }
      // Sin marcas: ausente, salvo que sea feriado, esté justificado… o
      // simplemente no sea día de trabajo. 🔑 Lo último solo puede pasar con
      // `incluirNoHabiles`, y sin el guard un domingo libre contaría como falta.
      if (crudas.length === 0) {
        dias.push({
          fecha, marcas: [], marcasIds: [], entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false,
          enCurso,
          // 🔴 Regla 6, la otra mitad: a las 8:59 de la mañana NADIE faltó
          // todavía. Sin este guard, el día en curso metía a media oficina en
          // "ausencias sin justificar" cada mañana — el mismo error que el de
          // los días mal marcados, con otro nombre.
          ausente: !enCurso && habil && !feriado && !justificado,
          vacacion: null,
          justificado, permiso, permisoPerdonaMin: 0, feriado, habil,
          correcciones,
        });
        continue;
      }

      // 🔴 LAS MARCAS SE MUESTRAN CON SEGUNDOS. Son el dato crudo del que salen
      // todos los números de abajo: si el papel dijera 08:00 y 17:04, nadie
      // podría reproducir a mano las horas que la planilla paga.
      const fmt = (seg: number) =>
        `${p2(Math.floor(seg / 3600))}:${p2(Math.floor((seg % 3600) / 60))}:${p2(seg % 60)}`;
      const ent = crudas[0];
      // 🩸 CON UNA SOLA MARCA NO SE SABE A QUÉ HORA SE FUE. Antes se tomaba esa
      // misma hora como entrada Y como salida, y salían disparates: en el
      // export histórico de enero-julio (995 días, TODOS con solo la entrada)
      // Roxana entrando 07:04 aparecía saliendo 9 horas temprano.
      //
      // Esto NO contradice la regla 5. Contar el atraso de una entrada real es
      // contar lo que la persona marcó; inventarle una salida a partir de esa
      // MISMA marca es usar un dato dos veces para dos cosas distintas. La
      // entrada se conoce, la salida no.
      const soloUna = crudas.length === 1;
      const sal = crudas[crudas.length - 1];

      // Regla 1. Tolerancia para CLASIFICAR; una vez pasada, se cuenta desde
      // la hora de entrada, no desde el fin de la tolerancia.
      const tardeBrutaMin = ent > entradaProgSeg + toleranciaSeg ? (ent - entradaProgSeg) / 60 : 0;
      // 🔴 EL PERMISO PERDONA SOLO LO QUE SE SOLAPA CON EL ATRASO DE VERDAD.
      // Un permiso de 2 a 4 de la tarde no perdona haber llegado a las 8:45:
      // se cruza la ventana del permiso con la del atraso —de la hora de
      // entrada a la primera marca— y se perdona la intersección, ni un minuto
      // más. Sin ventana el número es 0 y esta línea no cambia nada.
      const permisoPerdonaMin = Math.min(tardeBrutaMin, minutosPerdonados(ventana, entradaProgSeg, ent));
      const tardeMin = Math.max(0, tardeBrutaMin - permisoPerdonaMin);

      // Regla 2. Solo se puede medir con 4 marcas (o más): las del medio son
      // el almuerzo. Con 2 marcas no hay almuerzo que medir.
      let excesoAlmuerzoMin = 0;
      let almuerzoTomado = 0;
      if (crudas.length >= 4) {
        almuerzoTomado = crudas[2] - crudas[1]; // segundos
        excesoAlmuerzoMin = Math.max(0, (almuerzoTomado - almuerzoProgSeg) / 60);
      }

      const salidaTempranaMin = soloUna ? 0 : Math.max(0, (salidaProgSeg - sal) / 60);
      // Regla 3. LA HORA EXTRA ES BRUTA: un mínimo que hay que pasar, y nada
      // más. Dos decisiones de Daniel del 1-sep-2026, las dos textuales:
      //
      // 🔴 EL MÍNIMO ES UNA PUERTA, NO UN DESCUENTO. Preguntado «si se queda
      //    25 minutos, ¿cuántos le pagás?»: *"25 minutos"*. Pasado el umbral se
      //    paga TODO desde el primer minuto, no el excedente sobre el umbral.
      //    El umbral bajó de 15 a 10 minutos y vive en `REGLAS_DEFAULT`; acá
      //    solo se compara. Se compara en SEGUNDOS contra el umbral en minutos:
      //    quedarse 09:59 no es hora extra, 10:00 en punto sí.
      //
      // 🔴 EL ATRASO YA NO SE RESTA DE LA EXTRA. Preguntado «llegó 20 tarde y
      //    se quedó 30 → cobra 10 de extra, ¿sigue así?»: *"No, van
      //    separadas"*. Hasta hoy esto decía `bruto − tardeMin` y llegar tarde
      //    se pagaba con horas extra sin que apareciera en ningún lado: el
      //    mismo minuto servía para dos cosas. Ahora cada regla cobra por su
      //    lado — la tardanza SIGUE descontándose, en `tiempoNoTrabajadoMin`,
      //    que es donde se ve.
      //
      // ⚠️ Y NO HAY NINGUNA REGLA ESPECIAL A LOS 60 MINUTOS. Preguntado si a
      //    la hora cumplida pasaba algo: *"nada especial: se paga el tiempo
      //    exacto"*. Nadie agregue acá un redondeo a horas.
      const brutoSeg = soloUna ? 0 : Math.max(0, sal - salidaProgSeg);
      const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;

      const trabajadoMin = soloUna ? 0 : Math.max(0, (sal - ent - almuerzoTomado) / 60);
      // Regla 5. 4 marcas es lo normal; cualquier otra cosa se revisa —pero
      // los números se calculan igual.
      // Regla 6. Salvo que el día siga corriendo: quien entró, almorzó y volvió
      // tiene 3 marcas a las 3 de la tarde y todavía le falta irse. Eso no es un
      // día mal marcado, es un día a medias.
      const revisar = !enCurso && crudas.length !== 4;

      dias.push({
        fecha,
        marcas: crudas.map(fmt),
        // `null` = esa marca no vino del reloj (la agregó una corrección).
        marcasIds: crudas.map((seg) => p.ids.get(fecha)?.get(seg) ?? null),
        entrada: fmt(ent),
        // `null` y no la hora de entrada: no sabemos cuándo se fue.
        salida: soloUna ? null : fmt(sal),
        tardeMin, excesoAlmuerzoMin, salidaTempranaMin, extraMin, trabajadoMin,
        revisar, enCurso, ausente: false, vacacion: null, justificado, permiso, permisoPerdonaMin, feriado, habil,
        correcciones,
      });
    }

    const conMarcas = dias.filter((d) => d.marcas.length > 0);
    const resumen = {
      diasTrabajados: conMarcas.length,
      ausenciasSinJustificar: dias.filter((d) => d.ausente).length,
      ausenciasJustificadas: dias.filter(
        (d) => !d.marcas.length && d.justificado && !esTrabajoDeVendedor(d.justificado),
      ).length,
      diasTrabajandoFuera: dias.filter((d) => !d.marcas.length && esTrabajoDeVendedor(d.justificado)).length,
      // 🔑 Los días de vacaciones NUNCA entran en las dos cuentas de arriba: en
      // un día de vacaciones `justificado` es `null` a propósito, así que los
      // filtros de ausencia no los ven. Se cuentan acá, solos, porque no son
      // una ausencia de ningún tipo.
      diasVacaciones: dias.filter((d) => d.vacacion !== null).length,
      diasVacacionesYaPagadas: dias.filter((d) => d.vacacion?.yaPagadas === true).length,
      vecesTarde: conMarcas.filter((d) => d.tardeMin > 0).length,
      minutosTarde: conMarcas.reduce((a, d) => a + d.tardeMin, 0),
      minutosTardeDeDiasARevisar: conMarcas.filter((d) => d.revisar).reduce((a, d) => a + d.tardeMin, 0),
      /** Días con un permiso de HORAS. No son ausencias: la persona vino. */
      diasConPermiso: dias.filter((d) => d.permiso !== null).length,
      /** Minutos de tardanza que perdonaron esos permisos. Ya NO están en
       *  `minutosTarde`: se muestran para poder explicar la diferencia. */
      minutosPerdonadosPorPermiso: dias.reduce((a, d) => a + d.permisoPerdonaMin, 0),
      excesoAlmuerzoMin: conMarcas.reduce((a, d) => a + d.excesoAlmuerzoMin, 0),
      salidaTempranaMin: conMarcas.reduce((a, d) => a + d.salidaTempranaMin, 0),
      extraMin: conMarcas.reduce((a, d) => a + d.extraMin, 0),
      diasARevisar: conMarcas.filter((d) => d.revisar).length,
      // 🔴 APARTE, NUNCA SUMADO A `diasARevisar`. Se cuenta sobre TODOS los
      // días y no solo sobre los que tienen marcas: hoy, a las 8:59, la persona
      // todavía no marcó y ese día también está en curso.
      diasEnCurso: dias.filter((d) => d.enCurso).length,
      tiempoNoTrabajadoMin: 0,
      // 🔑 Sobre TODOS los días, no solo `conMarcas`: si algún día una
      // corrección pudiera existir sobre un día sin marcas, contarla solo en
      // los que tienen marcas la escondería justo donde más raro sería.
      diasCorregidos: dias.filter((d) => d.correcciones.length > 0).length,
      correcciones: dias.reduce((a, d) => a + d.correcciones.length, 0),
    };
    // El número de planilla: todo lo que no se trabajó, junto.
    resumen.tiempoNoTrabajadoMin =
      resumen.minutosTarde + resumen.excesoAlmuerzoMin + resumen.salidaTempranaMin;

    out.push({
      codigo,
      // El directorio primero: es lo que una persona escribió. El nombre de la
      // marcación queda de respaldo por si algún día el reloj empieza a mandarlo.
      nombre: nombres?.get(codigo) ?? p.nombre ?? null,
      salida: h?.salida ?? SALIDA_DEFAULT,
      almuerzoMin: almuerzoProg,
      dias,
      resumen,
    });
  }

  // Lo que más duele, arriba.
  return out.sort((a, b) => b.resumen.tiempoNoTrabajadoMin - a.resumen.tiempoNoTrabajadoMin);
}

/**
 * Hora de salida sugerida a partir de las marcaciones reales.
 *
 * 🩸 Se usa para SEMBRAR la pantalla de Horarios, porque el `Turno` de iVMS
 * está mal en 12 de 31 personas (medido). Se toma la MEDIANA de la última marca
 * de cada día: el promedio lo arruina un día que alguien se quedó hasta las 9.
 */
export function salidaSugerida(ultimasMarcas: readonly number[]): string {
  if (ultimasMarcas.length === 0) return SALIDA_DEFAULT;
  const ord = [...ultimasMarcas].sort((a, b) => a - b);
  const mediana = ord[Math.floor(ord.length / 2)];
  // Solo dos turnos reales en el negocio; se elige el más cercano.
  return Math.abs(mediana - 16 * 60 - 30) <= Math.abs(mediana - 17 * 60) ? "16:30" : "17:00";
}
