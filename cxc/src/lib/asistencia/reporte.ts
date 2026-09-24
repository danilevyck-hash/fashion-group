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
import { motivoAutomaticoDelDiaSinMarca } from "./trabaja-afuera";
// 🔴 Dos marcas y la segunda a mediodía: un aviso, NUNCA un cálculo. Ver
// `salida-sospechosa.ts` — no toca `revisar` ni un centavo.
import { salidaSospechosa } from "./salida-sospechosa";
import { minutosPerdonadosDe, rangoPermiso, textoPermiso, ventanaDe } from "./permiso-horas";
// 🔴 LA MARCA REPETIDA SE OLVIDA SOLA (18-sep-2026): a 60 s o menos de la
// última que cuenta, no cuenta. La regla y el número viven en
// `marca-repetida.ts`; aquí solo se le pregunta, sobre las marcas de CADA día.
import { olvidarRepetidas, type MarcaRepetidaVisible } from "./marca-repetida";
// 🔴 UN DÍA DE VACACIONES NO SE CALCULA. Ver `vacaciones.ts`: aunque la persona
// haya pasado por el reloj, ese día no genera horas, ni tardanza, ni ausencia.
import { vacacionDe, type DiaVacacion, type Vacacion } from "./vacaciones";
import { diaFueraDeVigencia, type Vigencia } from "./vigencia";
// 🔴 LOS DÍAS Y LOS DOS HORARIOS, CONFIGURABLES (18-sep-2026). Qué días trabaja
// cada quien (Multifashion, lunes a sábado) y con qué horario se mide el día
// (lo decide la PRIMERA marca: teléfono → el de afuera). La regla vive en
// `horario-configurable.ts`; acá solo se le pregunta. Sin nada configurado,
// lunes a viernes y un horario: lo de siempre.
import { esDiaLaborable, horarioDelDia } from "./horario-configurable";
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
  /**
   * Qué aparato la registró (`asistencia_marcaciones.dispositivo`): un reloj
   * físico o `telefono`. Opcional a propósito: sin él —una hora agregada a
   * mano, o una llamada vieja— la marca es del RELOJ y se mide con el horario
   * de siempre. 🔴 Solo se mira en la PRIMERA marca del día, para elegir el
   * horario (18-sep-2026). No entra en ninguna otra cuenta.
   */
  dispositivo?: string | null;
}

export interface HorarioPersona {
  empleado_codigo: string;
  entrada: string;   // "08:00"
  salida: string;    // "16:30" | "17:00"
  almuerzo_minutos: number;
  /**
   * El horario de cuando marca por el TELÉFONO (18-sep-2026). Vacío = el
   * mismo de adentro, campo por campo. Ver `horario-configurable.ts`.
   */
  entrada_afuera?: string | null;
  salida_afuera?: string | null;
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
  /**
   * 🔴 LAS MARCAS REPETIDAS QUE SE OLVIDARON SOLAS (18-sep-2026). Daniel:
   * *«quiero que el sistema agarre la primera marcación y olvide la próxima si
   * es en x cantidad de tiempo»* — y la x es **1 minuto**. Una marca a
   * `SEGUNDOS_MARCA_REPETIDA` o menos de la última que cuenta NO está en
   * `marcas` ni entra a ninguna cuenta: viaja aquí, con su hora, la marca que la
   * hizo repetida y cuántos segundos después llegó, para que la pantalla la
   * tache y el Excel la escriba. ⚠️ La fila sigue en `asistencia_marcaciones`:
   * se descarta al LEER, igual que una corrección.
   *
   * Vacío en los días de vacaciones, fuera de vigencia y sin marcas: ahí no se
   * calcula nada y las marcas se muestran tal cual.
   */
  repetidas: MarcaRepetidaVisible[];
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
   * 🔴 DOS MARCAS Y LA SEGUNDA MUY ANTES DE SU HORA DE SALIDA (16-sep-2026):
   * probablemente le falte la marca de salida. La regla —y el umbral, con su
   * medición— viven en `salida-sospechosa.ts`; acá solo se le pregunta.
   *
   * ⚠️ ES UN AVISO, NO UN CÁLCULO. Los minutos no cambian: la salida temprana
   * se sigue descontando igual. Y va APARTE de `revisar` a propósito —`revisar`
   * entra a la planilla que se guarda (`dias_a_revisar`)— así que prender esto
   * no mueve ningún número de ninguna quincena.
   */
  salidaSospechosa: boolean;
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
  /**
   * 🔴 ESE DÍA ESA PERSONA NO TRABAJABA ACÁ (15-sep-2026): es anterior a su
   * `fecha_ingreso` o posterior a su `fecha_salida`. La regla vive en
   * `vigencia.ts` (`diaFueraDeVigencia`); acá solo se le pregunta.
   *
   * 🔴 Mientras esto sea `true`, TODOS los minutos van en cero y `ausente` y
   * `revisar` van en `false`: el día no suma, no resta y no existe para ella.
   * Es el hermano de `enCurso` —allá el día todavía no llegó, acá no le
   * tocaba— y por eso se resuelve igual: el veredicto se suspende, no se
   * calcula y se anula después.
   *
   * ⚠️ Las MARCAS de ese día se conservan tal cual, aunque no cuenten para
   * nada: son lo único con lo que el aviso «marcó después de irse» puede
   * existir (`marcoDespuesDeLaBaja`). Descartar un dato está bien; esconderlo
   * no.
   *
   * `false` en todos los días de quien trabajó el período entero —y en las 9
   * fichas sin `fecha_ingreso`—: ahí no hay nada que suspender.
   */
  fueraDeVigencia: boolean;
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
  /**
   * Solo el rango del permiso, para el chip del día: «12:00–17:00». `null` = no
   * hay permiso. Es el MISMO dato que va dentro de `permiso`, separado para que
   * la pantalla no tenga que recortar un texto.
   */
  permisoRango: string | null;
  /**
   * 🔴 LOS TRES PERDONES VIAJAN POR SEPARADO (16-sep-2026). Daniel: *«La columna
   * muestra los minutos reales y, al lado, cuánto se perdonó. Nada callado.»*
   *
   * Cada uno ya está descontado de su columna (`tardeMin`, `salidaTempranaMin`,
   * `excesoAlmuerzoMin`): esto es para poder EXPLICARLO, no para volver a
   * restarlo. Juntos en `totalPerdonado` (`permiso-horas.ts`).
   *
   * ⚠️ `permisoPerdonaMin` conserva su nombre y su significado —los minutos de
   * TARDANZA— porque lo leen la pantalla, el Excel y tres candados.
   */
  permisoPerdonaMin: number;
  permisoPerdonaSalidaMin: number;
  permisoPerdonaAlmuerzoMin: number;
  feriado: string | null;
  /**
   * El día es LABORABLE para esta persona: lunes a viernes, salvo que tenga
   * otra lista de días (`diasLaborables`; Multifashion trabaja lunes a
   * sábado desde el 18-sep-2026). El domingo nunca lo es.
   *
   * 🩸 Existe por la PLANILLA: los domingos se pagan al 1.5 y para eso el motor
   * tiene que verlos (`incluirNoHabiles`). Pero un domingo sin marcas NO es una
   * ausencia —nadie faltó, es domingo—, y sin este campo el mismo `if` que
   * detecta la ausencia se los tragaría a todos. 🔴 Es lo que la planilla
   * mira para decidir sábado/domingo (`clasificarDia`): no se recalcula allá.
   */
  habil: boolean;
  /**
   * El día se midió con el horario de AFUERA (la primera marca vino del
   * teléfono y la persona tiene ese horario configurado). Informativo, para
   * que la pantalla lo diga; los minutos ya salen calculados con él. Ausente
   * o `false` = el horario de siempre.
   */
  horarioDeAfuera?: boolean;
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
   * ⚠️ Desde el 14-sep-2026 es INFORMATIVA: ya no decide si se cuentan las
   * horas extra. Eso lo dice `cobraHorasExtra`, abajo.
   */
  servicioProfesional?: boolean;
  /**
   * 🔴 ¿Se le cuentan las horas extra? La casilla «¿Cobra horas extra?» de la
   * FICHA (14-sep-2026). Daniel, textual: *«solo yulissa no cobra, todos los
   * demás sí. Ella es la única excepción hoy y siempre»*. La pone la ruta
   * desde la ficha; ausente = sí, como las 46 fichas el día que nació la
   * casilla. Es lo ÚNICO que mira `cuentaHorasExtra`.
   */
  cobraHorasExtra?: boolean;
  /**
   * 🔴 NO MARCÓ NI UNA VEZ EN EL PERÍODO (24-sep-2026). La fila existe para que
   * se la pueda ver y corregir, pero **todos sus días van en cero y ninguno es
   * ausencia**: es lo que la planilla ya hace con esta persona. La pantalla la
   * dibuja en gris y lo dice. Ausente o `false` = la persona de siempre.
   */
  sinMarcas?: boolean;
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
    /**
     * 🔴 TODO lo que perdonaron esos permisos, las TRES columnas juntas
     * (16-sep-2026). Ya está FUERA de `minutosTarde`, `excesoAlmuerzoMin` y
     * `salidaTempranaMin`; se guarda para poder explicar la diferencia.
     *
     * ⚠️ Hasta el 16-sep-2026 solo contaba la TARDANZA, porque era lo único que
     * el permiso sabía perdonar. El nombre no cambió —lo leen los candados— y
     * para un permiso de mañana, que es lo que había en producción, sigue
     * dando exactamente el mismo número.
     */
    minutosPerdonadosPorPermiso: number;
    /** De ese total, cuánto era tardanza de entrada. */
    minutosPerdonadosTarde: number;
    /** De ese total, cuánto era salida temprana. */
    minutosPerdonadosSalidaTemprana: number;
    /** De ese total, cuánto era exceso de almuerzo. */
    minutosPerdonadosAlmuerzo: number;
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
    /** Cuántas marcas repetidas del reloj se olvidaron solas en el rango
     *  (18-sep-2026). Suma de `dias[].repetidas.length`; solo para decirlo. */
    marcasRepetidas: number;
  };
}

/**
 * ¿Se le cuentan las horas extra a esta persona? Es la ÚNICA pregunta que
 * hacen la pantalla, el Excel y el PDF del Reporte antes de mostrar o sumar
 * `extraMin`: una sola definición, para que la columna y el total no puedan
 * discrepar.
 *
 * 🔴 14-sep-2026 — LA CONTESTA LA CASILLA DE LA FICHA, no la bandera de
 * servicio profesional. Hasta hoy decía `servicioProfesional !== true`
 * (3-sep-2026, Daniel sobre Yulissa: *«es solo para ver sus tardanzas y
 * ausencias»*). Daniel, hoy: *«los servicios profesionales de fashion wear sí
 * llevan horas extras»*, *«solo yulissa no cobra»*. Yulissa sigue con «—»
 * porque su ficha tiene la casilla en NO; la regla es la MISMA que aplica el
 * motor de la planilla (`armarLinea`), así que el Reporte y la Planilla no
 * pueden decir cosas distintas de la misma persona.
 */
export function cuentaHorasExtra(p: Pick<PersonaReporte, "cobraHorasExtra">): boolean {
  return p.cobraHorasExtra !== false;
}

/** `extraMin` si se le cuenta; 0 si no. Para los totales. */
export function extraQueCuenta(p: Pick<PersonaReporte, "cobraHorasExtra" | "resumen">): number {
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

/**
 * ¿La fecha cae de lunes a viernes? Es la regla de SIEMPRE, sin mirar a nadie.
 *
 * ⚠️ Desde el 18-sep-2026 el MOTOR no la usa para decidir si un día es
 * laborable: eso lo contesta `esDiaLaborable(fecha, dias)` con los días de
 * cada persona (Multifashion trabaja lunes a sábado). Y desde esa misma tarde
 * TAMPOCO la usan «faltan N días hábiles» (`periodo.ts`), el prorrateo
 * (`prorrateo-ingreso.ts`) ni el día libre (`dia-libre-empresa.ts`): los tres
 * cuentan con `diasLaborablesDelRango` y los días de cada quien. Daniel:
 * *«obvio todo de lunes a sábado con multifashion»*. Queda como respaldo de
 * `clasificarDia` para un día viejo sin `habil`, y es idéntico a
 * `esDiaLaborable(fecha)` sin lista.
 */
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
  /**
   * 🔴 Los códigos con la casilla «Trabaja afuera» de la ficha (14-sep-2026).
   * Ver `trabaja-afuera.ts`. Para ellos, un día hábil sin marca y sin otra
   * explicación NO es ausencia: se le pone «Trabajo de vendedor» solo. El día
   * que SÍ marcan se mide exactamente igual que el de todos.
   *
   * 🔑 SIN ESTO NADA CAMBIA: vacío por defecto, y con la migración sin aplicar
   * la lectura devuelve vacío. El motor da los mismos números que hoy.
   */
  trabajaAfuera?: ReadonlySet<string>;
  /**
   * 🔴 DESDE CUÁNDO Y HASTA CUÁNDO TRABAJA CADA QUIEN (15-sep-2026), por
   * código. Un día anterior a su `fecha_ingreso` —o posterior a su
   * `fecha_salida`— deja de generar ausencia, tardanza, salida temprana y hora
   * extra: esa persona no trabajaba acá ese día. La regla vive en
   * `vigencia.ts`; acá solo se le pregunta.
   *
   * 🔑 SIN ESTO NADA CAMBIA: vacío por defecto, y una ficha sin ninguna de las
   * dos fechas se comporta exactamente como hoy. Lo pasan el Reporte y la
   * Planilla, que ya leían este mapa para otra cosa (`codigosFueraDeRango`).
   */
  vigencias?: ReadonlyMap<string, Vigencia>;
  /**
   * 🔴 QUÉ DÍAS TRABAJA CADA QUIEN (18-sep-2026), por código: la lista de
   * `resolverDiasLaborables` (la columna de la persona, si no la empresa de su
   * ficha). Un día de la lista sin marca es AUSENCIA; uno fuera de la lista
   * es el sábado/domingo de siempre. El domingo nunca entra.
   *
   * 🔑 SIN ESTO NADA CAMBIA: vacío por defecto, y con la migración sin aplicar
   * la lectura devuelve vacío. Lunes a viernes para todo el mundo, como hoy.
   */
  diasLaborables?: ReadonlyMap<string, readonly number[]>;
  /**
   * 🔴 QUIÉN SALE AUNQUE NO HAYA MARCADO NI UNA VEZ (24-sep-2026).
   *
   * 🩸 Hasta hoy la lista se armaba SOLO con quien tiene marcas en el período,
   * así que Yeisibeth Muñoz (306, Multifashion) no existía para la pantalla de
   * la quincena 1–15 de septiembre y no había forma de arreglarle las horas.
   *
   * 🔴 SU VEREDICTO QUEDA SUSPENDIDO, COMO EL DÍA EN CURSO Y EL DÍA FUERA DE
   * VIGENCIA: todos sus días salen en cero y **ninguno es ausencia**. Es lo que
   * la planilla ya hace con esta persona (`armarPlanilla` le da `HORAS_CERO`
   * porque no tiene reporte), y la pantalla no puede decir otra cosa que el
   * pago. Los días existen para poder TOCARLOS y agregarles una hora.
   *
   * 🔑 SIN ESTO NADA CAMBIA: vacío por defecto. La PLANILLA no lo pasa, así que
   * su cuadro es exactamente el de siempre. Un código que sí marcó se ignora
   * acá: ése sale por el camino de siempre, con sus números.
   */
  sinMarcas?: ReadonlySet<string>;
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
  // 🔴 Los días se recorren POR PERSONA desde el 18-sep-2026: sin
  // `incluirNoHabiles`, cada quien ve SUS días laborables (Multifashion, el
  // sábado incluido). Con él, todos los del rango, como siempre.
  const todosLosDias = diasDelRango(desde, hasta, true);

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
      /**
       * 🔴 `dia` → de qué aparato vino la PRIMERA marca del día (18-sep-2026).
       * Es lo único que decide con qué horario se mide ese día: teléfono → el
       * de afuera, reloj → el de siempre. Daniel: *«que se fije por la primera
       * marcación pues»*. No entra en ninguna otra cuenta.
       */
      primera: Map<string, { seg: number; dispositivo: string | null }>;
    }
  >();
  for (const m of marcaciones) {
    const cod = (m.empleado_codigo ?? m.empleado_nombre ?? "").trim();
    if (!cod || !m.ocurrio_en) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (dia < desde || dia > hasta) continue;
    let p = porPersona.get(cod);
    if (!p) { p = { nombre: m.empleado_nombre, dias: new Map(), ids: new Map(), primera: new Map() }; porPersona.set(cod, p); }
    if (!p.nombre && m.empleado_nombre) p.nombre = m.empleado_nombre;
    const lista = p.dias.get(dia);
    // 🔑 SEGUNDOS, no minutos: el instante exacto que marcó la persona.
    const seg = segundosDelDia(m.ocurrio_en);
    if (lista) lista.push(seg);
    else p.dias.set(dia, [seg]);
    // La primera del día por HORA, no por orden de llegada: una marca del
    // teléfono que llegó tarde al servidor (sin señal) sigue siendo la primera
    // si se tomó antes.
    const prim = p.primera.get(dia);
    if (!prim || seg < prim.seg) p.primera.set(dia, { seg, dispositivo: m.dispositivo ?? null });
    if (m.id) {
      const del = p.ids.get(dia);
      if (del) del.set(seg, String(m.id));
      else p.ids.set(dia, new Map([[seg, String(m.id)]]));
    }
  }

  // 🔴 LOS QUE NO MARCARON NI UNA VEZ ENTRAN AL FINAL DE LA LISTA (24-sep-2026).
  // Se agregan DESPUÉS de recorrer las marcaciones, así que un código que sí
  // marcó nunca pasa por acá: `porPersona.has(cod)` ya es verdadero y se lo
  // deja como está, con sus números de siempre. Ver `sin-marcas.ts`.
  const sinMarcasDeVerdad = new Set<string>();
  for (const cod of opts.sinMarcas ?? []) {
    const c = String(cod ?? "").trim();
    if (!c || porPersona.has(c)) continue;
    porPersona.set(c, { nombre: nombres?.get(c) ?? null, dias: new Map(), ids: new Map(), primera: new Map() });
    sinMarcasDeVerdad.add(c);
  }

  const out: PersonaReporte[] = [];
  for (const [codigo, p] of porPersona) {
    /** 🔴 Esta persona no marcó NADA en el período: su veredicto se suspende. */
    const noMarcoNada = sinMarcasDeVerdad.has(codigo);
    const h = horarioDe.get(codigo);
    // 🔑 TODO EL DÍA SE MIDE EN SEGUNDOS. Los umbrales de negocio siguen siendo
    // en minutos (la tolerancia, el mínimo de extra, el almuerzo) y se escalan
    // acá: medir fino y perdonar en minutos es lo correcto.
    // 🔴 La entrada y la salida se eligen DÍA POR DÍA más abajo (18-sep-2026):
    // la primera marca del día decide si es el horario del reloj o el del
    // teléfono. Sin horario de afuera son estos dos, todos los días.
    // 🔑 La columna por persona SE SIGUE LEYENDO —es lo que Daniel pidió que no
    // se tocara— y solo cae al fijo quien todavía no tiene horario guardado.
    const almuerzoProg = h?.almuerzo_minutos ?? ALMUERZO_FIJO_MIN;
    const almuerzoProgSeg = almuerzoProg * 60;
    const toleranciaSeg = toleranciaMin * 60;
    const extraMinimoSeg = extraMinimoMin * 60;
    // 🔴 SUS días laborables. Sin lista, lunes a viernes: lo de siempre.
    const diasDeEsta = opts.diasLaborables?.get(codigo);
    const habiles = opts.incluirNoHabiles === true
      ? todosLosDias
      : todosLosDias.filter((f) => esDiaLaborable(f, diasDeEsta));

    const dias: DiaReporte[] = [];
    for (const fecha of habiles) {
      // ── 🔴 CON QUÉ HORARIO SE MIDE ESTE DÍA (18-sep-2026) ──────────────────
      // Lo decide la PRIMERA marca del día: si vino del teléfono y la persona
      // tiene horario de afuera, ése; si no, el de siempre. Sin marcas no hay
      // primera y se mide con el de siempre (que igual no se usa: sin marcas
      // no hay tardanza ni salida que medir).
      const horarioHoy = horarioDelDia(
        h ?? { entrada: ENTRADA_DEFAULT, salida: SALIDA_DEFAULT },
        p.primera.get(fecha)?.dispositivo,
      );
      const entradaProgSeg = hhmmASeg(horarioHoy.entrada);
      const salidaProgSeg = hhmmASeg(horarioHoy.salida);
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
      /** Solo el rango, para el chip del día: «12:00–17:00». */
      const permisoRango = just && ventana ? rangoPermiso(just.hora_desde, just.hora_hasta) : null;
      // 🔴 Laborable PARA ESTA PERSONA (18-sep-2026): lunes a viernes, o su
      // lista. Multifashion suma el sábado; el domingo nunca entra.
      const habil = esDiaLaborable(fecha, diasDeEsta);
      // Regla 6. Hoy sigue corriendo y mañana ni empezó: no se los juzga.
      // 🔴 `>=`, no `===`. Ver la nota de `diaEnCurso`.
      const enCurso = !!opts.diaEnCurso && fecha >= opts.diaEnCurso;
      // Segundos desde medianoche, en orden.
      const crudas = (p.dias.get(fecha) ?? []).slice().sort((a, b) => a - b);
      // 🔴 LAS MARCAS SE MUESTRAN CON SEGUNDOS. Son el dato crudo del que salen
      // todos los números de abajo: si el papel dijera 08:00 y 17:04, nadie
      // podría reproducir a mano las horas que la planilla paga.
      const fmt = (seg: number) =>
        `${p2(Math.floor(seg / 3600))}:${p2(Math.floor((seg % 3600) / 60))}:${p2(seg % 60)}`;
      // ── 🔴 LA MARCA REPETIDA SE OLVIDA SOLA (18-sep-2026) ───────────────────
      //
      // Daniel: *«quiero que el sistema agarre la primera marcación y olvide la
      // próxima si es en x cantidad de tiempo»*, y la x fue **«1 minuto»**.
      //
      // 🩸 Ramón Miranda (21), 3-ago: 07:58:36 · 07:58:37 · 13:55:43 · 14:22:04
      // · 17:10:43. El dedo tocó dos veces al entrar, la 2.ª marca dejó de ser
      // la salida a almorzar y el Reporte le medía 5 h 57 min de almuerzo (327
      // minutos de exceso), con el día en ámbar frenando el cierre.
      //
      // Se aplica AQUÍ, sobre las marcas que YA QUEDARON después de las
      // correcciones (una quitada a mano ya no está en `crudas`; una corregida
      // entra con su hora nueva) y sobre las de ESTE día: no cruza de un día a
      // otro porque `p.dias` ya está partido por día de Panamá. De aquí para
      // abajo TODO se calcula sobre `buenas`; las olvidadas viajan en
      // `repetidas` para que se vean tachadas y con su porqué. La fila de
      // `asistencia_marcaciones` no se toca: se descarta al LEER.
      //
      // ⚠️ Se conserva la PRIMERA. Si el doble toque fue a la SALIDA, la salida
      // pasa a ser la primera de las dos (hasta 60 s antes): es la regla de
      // Daniel, y ese minuto se ve en la marca tachada.
      const { buenas, olvidadas } = olvidarRepetidas(crudas);
      const repetidas: MarcaRepetidaVisible[] = olvidadas.map((o) => ({
        hora: fmt(o.seg),
        despuesDe: fmt(o.despuesDeSeg),
        segundosDespues: o.segundosDespues,
        id: p.ids.get(fecha)?.get(o.seg) ?? null,
      }));
      // Informativo: qué horas de este día se tocaron a mano. No entra en
      // ninguna cuenta — ver la nota de `correccionesPorDia`.
      const correcciones = [...(opts.correccionesPorDia?.get(`${codigo}|${fecha}`) ?? [])];

      // ── 🔴 NO MARCÓ NI UNA VEZ EN TODO EL PERÍODO (24-sep-2026) ────────────
      //
      // El día existe para poder TOCARLO y agregarle una hora, y nada más: en
      // cero, sin ausencia y sin nada que revisar. Es lo MISMO que la planilla
      // ya hace con esta persona (`HORAS_CERO`), y la pantalla no puede decir
      // otra cosa que el pago. Va antes que la vigencia y que las vacaciones
      // por la misma razón de siempre: lo que se calcule antes hay que
      // acordarse de anularlo después. Ver `sin-marcas.ts`.
      if (noMarcoNada) {
        dias.push({
          fecha,
          marcas: [], marcasIds: [], repetidas: [],
          entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false, salidaSospechosa: false,
          enCurso, fueraDeVigencia: false,
          // 🔴 NUNCA una ausencia: la planilla no se la cobra.
          ausente: false,
          vacacion: null, justificado: null, permiso: null, permisoRango: null,
          permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
          feriado, habil,
          correcciones,
        });
        continue;
      }

      // ── 🔴 ESE DÍA NO ERA SUYO: VA ANTES QUE TODO, HASTA DE LAS VACACIONES ──
      //
      // 🩸 ENRIQUE SÁNCHEZ (56) entró el 7 de septiembre y en la quincena del 1
      // al 15 el sistema le cobraba CUATRO ausencias —el 1, 2, 3 y 4— por
      // −$100,16, días en que todavía no trabajaba acá. Encima de eso ya le
      // prorrateaba el sueldo por los 7 días que sí trabajó ($175,00, que es lo
      // que paga la contadora): lo castigaba dos veces por lo mismo.
      //
      // 🔴 VA PRIMERO, Y ESO ES LA MITAD DEL ARREGLO. Igual que con las
      // vacaciones: cualquier cosa que se calcule antes es una cuenta que
      // después hay que acordarse de anular, y basta olvidarse de una para que
      // un día anterior al ingreso aparezca con tardanza el día de pago. Y va
      // antes que las vacaciones porque es un hecho más fuerte: unas vacaciones
      // «ya pagadas» de un día en que la persona ni existía para la empresa se
      // le descontarían de su primera quincena.
      //
      // ⚠️ LAS MARCAS SE CONSERVAN. No se pierden ni se esconden: son lo único
      // con lo que el aviso «marcó después de irse» puede existir
      // (`marcoDespuesDeLaBaja`, que mira `ultimoDiaConMarcas`). Lo que se
      // suspende es el VEREDICTO, no el dato.
      if (diaFueraDeVigencia(opts.vigencias?.get(codigo), fecha)) {
        dias.push({
          fecha,
          marcas: crudas.map(
            (seg) =>
              `${p2(Math.floor(seg / 3600))}:${p2(Math.floor((seg % 3600) / 60))}:${p2(seg % 60)}`,
          ),
          marcasIds: crudas.map((seg) => p.ids.get(fecha)?.get(seg) ?? null),
          // Las marcas se muestran TAL CUAL, todas: aquí no se calcula nada.
          repetidas: [],
          entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          // 🔴 Los tres veredictos, suspendidos: no faltó, no hay nada que
          // revisar, y el día no se juzga por ningún lado.
          revisar: false, salidaSospechosa: false, enCurso, fueraDeVigencia: true, ausente: false,
          vacacion: null, justificado: null, permiso: null, permisoRango: null,
          permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
          feriado, habil,
          correcciones,
        });
        continue;
      }

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
          fecha, marcas: [], marcasIds: [], repetidas: [], entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false, salidaSospechosa: false,
          enCurso,
          fueraDeVigencia: false,
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
          justificado: null, permiso: null, permisoRango: null,
          permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
          feriado, habil,
          correcciones,
        });
        continue;
      }
      // Sin marcas: ausente, salvo que sea feriado, esté justificado… o
      // simplemente no sea día de trabajo. 🔑 Lo último solo puede pasar con
      // `incluirNoHabiles`, y sin el guard un domingo libre contaría como falta.
      if (crudas.length === 0) {
        // 🔴 «TRABAJA AFUERA» (14-sep-2026): a quien tiene la casilla, el día
        // hábil sin marca y sin otra explicación se le pone «Trabajo de
        // vendedor» SOLO — la MISMA condición que abajo lo haría ausencia, y
        // nada más: un feriado, un fin de semana, un día en curso o un día ya
        // justificado no se tocan. La regla vive en `trabaja-afuera.ts`; acá
        // solo se le pregunta. Sin la casilla, `justificadoDelDia` ES
        // `justificado` y este renglón es el de siempre.
        const justificadoDelDia = justificado ?? motivoAutomaticoDelDiaSinMarca({
          trabajaAfuera: opts.trabajaAfuera?.has(codigo) === true,
          habil, feriado, enCurso, justificado,
        });
        dias.push({
          fecha, marcas: [], marcasIds: [], repetidas: [], entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false, salidaSospechosa: false,
          enCurso,
          fueraDeVigencia: false,
          // 🔴 Regla 6, la otra mitad: a las 8:59 de la mañana NADIE faltó
          // todavía. Sin este guard, el día en curso metía a media oficina en
          // "ausencias sin justificar" cada mañana — el mismo error que el de
          // los días mal marcados, con otro nombre.
          ausente: !enCurso && habil && !feriado && !justificadoDelDia,
          vacacion: null,
          justificado: justificadoDelDia, permiso, permisoRango,
          permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0, feriado, habil,
          correcciones,
        });
        continue;
      }

      // 🔑 De aquí para abajo, SOLO las marcas buenas: la repetida ya se fue a
      // `repetidas` y no existe para ninguna cuenta.
      const ent = buenas[0];
      // 🩸 CON UNA SOLA MARCA NO SE SABE A QUÉ HORA SE FUE. Antes se tomaba esa
      // misma hora como entrada Y como salida, y salían disparates: en el
      // export histórico de enero-julio (995 días, TODOS con solo la entrada)
      // Roxana entrando 07:04 aparecía saliendo 9 horas temprano.
      //
      // Esto NO contradice la regla 5. Contar el atraso de una entrada real es
      // contar lo que la persona marcó; inventarle una salida a partir de esa
      // MISMA marca es usar un dato dos veces para dos cosas distintas. La
      // entrada se conoce, la salida no.
      const soloUna = buenas.length === 1;
      const sal = buenas[buenas.length - 1];

      // Regla 1. Tolerancia para CLASIFICAR; una vez pasada, se cuenta desde
      // la hora de entrada, no desde el fin de la tolerancia.
      const tardeBrutaMin = ent > entradaProgSeg + toleranciaSeg ? (ent - entradaProgSeg) / 60 : 0;
      // ── 🔴 EL PERMISO PERDONA LAS TRES COLUMNAS (16-sep-2026) ──────────────
      //
      // Daniel, textual: *«El permiso perdona lo que se solape con la ventana,
      // sea tardanza, salida temprana o exceso de almuerzo. Una sola regla,
      // tres columnas.»*
      //
      // La regla es la de siempre y vive entera en `permiso-horas.ts`: se cruza
      // la ventana del permiso con la del INCUMPLIMIENTO y se perdona la
      // intersección, ni un minuto más. Acá solo se dice cuál es la ventana de
      // cada columna y se capea el perdón a SU propio bruto — perdonar más de
      // lo que se incumplió sería regalar minutos de otra columna.
      //
      // 🩸 Hasta hoy solo se perdonaba la tardanza de ENTRADA, y Andrea Pérez
      // (16), que el 1-sep entró PUNTUAL y se fue a las 12:07:32 con permiso de
      // 12:00 a 17:00, perdía $16,43 por «salida temprana».
      //
      // Sin ventana los tres números son 0 y nada de esto cambia una coma.
      const permisoPerdonaMin = Math.min(tardeBrutaMin, minutosPerdonadosDe(ventana, {
        // La marca CIERRA el atraso: se llegó tarde hasta que se marcó.
        desdeSeg: entradaProgSeg, hastaSeg: ent, bordeDelReloj: "fin",
      }));
      const tardeMin = Math.max(0, tardeBrutaMin - permisoPerdonaMin);

      // Regla 2. Solo se puede medir con 4 marcas (o más): las del medio son
      // el almuerzo. Con 2 marcas no hay almuerzo que medir.
      // ⚠️ Y sin almuerzo que medir no hay nada que perdonar: no se inventa un
      // almuerzo donde no hay marcas.
      let excesoAlmuerzoMin = 0;
      let permisoPerdonaAlmuerzoMin = 0;
      let almuerzoTomado = 0;
      if (buenas.length >= 4) {
        almuerzoTomado = buenas[2] - buenas[1]; // segundos
        const excesoAlmuerzoBrutoMin = Math.max(0, (almuerzoTomado - almuerzoProgSeg) / 60);
        permisoPerdonaAlmuerzoMin = Math.min(excesoAlmuerzoBrutoMin, minutosPerdonadosDe(ventana, {
          // El exceso empieza cuando se acabó el almuerzo permitido y termina
          // cuando la persona volvió a marcar: esa marca lo CIERRA.
          desdeSeg: buenas[1] + almuerzoProgSeg, hastaSeg: buenas[2], bordeDelReloj: "fin",
        }));
        excesoAlmuerzoMin = Math.max(0, excesoAlmuerzoBrutoMin - permisoPerdonaAlmuerzoMin);
      }

      const salidaTempranaBrutaMin = soloUna ? 0 : Math.max(0, (salidaProgSeg - sal) / 60);
      const permisoPerdonaSalidaMin = Math.min(salidaTempranaBrutaMin, minutosPerdonadosDe(ventana, {
        // 🔑 Acá la marca ABRE el incumplimiento —se fue a las 12:07:32 y le
        // faltaba hasta las 17:00—, así que el borde que se estira al minuto
        // entero es el PRINCIPIO del permiso, no el final.
        desdeSeg: sal, hastaSeg: salidaProgSeg, bordeDelReloj: "inicio",
      }));
      const salidaTempranaMin = Math.max(0, salidaTempranaBrutaMin - permisoPerdonaSalidaMin);
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
      // 🔴 18-sep-2026: se cuenta DESPUÉS de olvidar la repetida. Un día de 5
      // con una repetida deja de estar a revisar; uno de 5 con una marca que
      // falta sigue estándolo.
      const revisar = !enCurso && buenas.length !== 4;
      // 🔴 DOS MARCAS Y LA SEGUNDA MUY ANTES DE SU SALIDA (16-sep-2026): se
      // AVISA, no se calcula. Los minutos de arriba ya están decididos y esto
      // no los toca. La regla y el umbral viven en `salida-sospechosa.ts`.
      const sospechosa = salidaSospechosa({
        marcas: buenas, salidaTempranaMin, habil, enCurso, fueraDeVigencia: false, vacacion: null,
      });

      dias.push({
        fecha,
        marcas: buenas.map(fmt),
        // `null` = esa marca no vino del reloj (la agregó una corrección).
        marcasIds: buenas.map((seg) => p.ids.get(fecha)?.get(seg) ?? null),
        repetidas,
        entrada: fmt(ent),
        // `null` y no la hora de entrada: no sabemos cuándo se fue.
        salida: soloUna ? null : fmt(sal),
        tardeMin, excesoAlmuerzoMin, salidaTempranaMin, extraMin, trabajadoMin,
        revisar, salidaSospechosa: sospechosa,
        enCurso, fueraDeVigencia: false, ausente: false, vacacion: null, justificado, permiso, permisoRango,
        permisoPerdonaMin, permisoPerdonaSalidaMin, permisoPerdonaAlmuerzoMin, feriado, habil,
        // Solo para decirlo: los minutos de arriba ya salieron con ese horario.
        horarioDeAfuera: horarioHoy.deAfuera,
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
      minutosPerdonadosPorPermiso: dias.reduce(
        (a, d) => a + d.permisoPerdonaMin + d.permisoPerdonaSalidaMin + d.permisoPerdonaAlmuerzoMin, 0),
      minutosPerdonadosTarde: dias.reduce((a, d) => a + d.permisoPerdonaMin, 0),
      minutosPerdonadosSalidaTemprana: dias.reduce((a, d) => a + d.permisoPerdonaSalidaMin, 0),
      minutosPerdonadosAlmuerzo: dias.reduce((a, d) => a + d.permisoPerdonaAlmuerzoMin, 0),
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
      marcasRepetidas: dias.reduce((a, d) => a + d.repetidas.length, 0),
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
      // 🔴 Solo cuando de verdad no marcó: la bandera no se pone sola.
      ...(noMarcoNada ? { sinMarcas: true as const } : {}),
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
