// Motivos de una falta justificada.
//
// ⚠️ Viven acá y NO en el route: Next.js solo permite exportar los handlers
// (GET/POST/…) y unas pocas constantes suyas desde un archivo de ruta —
// cualquier otro export rompe el build con "does not match the required types
// of a Next.js Route".
//
// ── LA LISTA QUE ELIGIÓ DANIEL (25-ago-2026) ─────────────────────────────────
//
// Los motivos son CUATRO: Incapacidad · Catástrofe · Escolares · Trabajo de
// vendedor. Se fueron «Permiso», «Luto» y «Otro» (cajones sin forma, que en
// tres meses no dicen nada).
//
// ✅ «VACACIONES» YA SE MUDÓ (25-ago-2026) y por eso NO está en ninguna de las
// dos listas de acá. Vive en su propia pestaña y en su propia tabla
// (`asistencia_vacaciones`, ver `vacaciones.ts`), porque es OTRA COSA: en un
// día de vacaciones no se calcula nada del reloj, y llevan su propia cuenta de
// días. La ÚNICA justificación viva con ese motivo —ELOYN MENDOZA, código 29,
// 16-jul → 13-ago-2026— la migra
// `20260825160000_asistencia_vacaciones.sql`, que la inserta SIN MARCAR (o
// sea, pagándose igual que hoy) y recién después borra la fila vieja. Con la
// migración corrida no queda una sola justificación de «Vacaciones» que leer;
// mientras no corra, una fila así se lee como un motivo cualquiera y se
// comporta EXACTAMENTE como se comportaba.
//
// 🔴 LO QUE YA ESTÁ GUARDADO SIGUE VALIENDO. Quedan 4 justificaciones vivas en
// producción —3 de Incapacidad (48, 7, 43) y 1 de trabajo fuera (13, Rodrigo)—
// y ninguna se puede perder: pagan una quincena. Sacar un motivo de la lista
// OFRECIDA no borra las filas que lo usan; `MOTIVOS_RETIRADOS` existe para que
// el módulo sepa leerlas y la pantalla las muestre tal cual, sin ofrecerlas
// para una nueva.
//
// ── 🔴 «TRABAJO FUERA DE LA OFICINA» → «TRABAJO DE VENDEDOR» ─────────────────
//
// Es el MISMO motivo con mejor nombre —el de Daniel—, no uno nuevo. El caso
// vivo es RODRIGO MIRANDA (código 13), justificado del 1 al 13 de agosto.
//
// 🩸 SU FILA EN LA BASE DICE «Trabajo fuera de la oficina» Y NADIE LA VA A
// REESCRIBIR. Por eso el nombre viejo se reconoce para siempre
// (`MOTIVO_TRABAJO_FUERA_ANTES`) y `esTrabajoDeVendedor` acepta los dos: un
// `===` contra el nombre nuevo habría convertido la justificación de Rodrigo en
// una ausencia común el día que este archivo se mergea, y eso es plata.
// Las justificaciones NUEVAS se guardan con el nombre nuevo.
//
//                     Vacaciones        Trabajo de vendedor
//   ¿se le paga?          sí                    sí
//   ¿TRABAJÓ ese día?     NO                    SÍ
//   ¿le gasta vacaciones? SÍ                    no
//
// 🩸 EN EL RENGLÓN DEL DÍA SE SIGUE DICIENDO «fuera de la oficina» Y NO «fuera
// de la empresa». En castellano *"está fuera de la empresa"* se lee, con la
// misma naturalidad, como *"ya no trabaja acá"* — la confusión más cara posible
// justo en la pantalla que decide un pago.

/** El nombre nuevo, el que se guarda de ahora en adelante. */
export const MOTIVO_TRABAJO_VENDEDOR = "Trabajo de vendedor";

/**
 * Cómo se llamaba hasta el 25-ago-2026.
 *
 * 🔴 NO SE BORRA NUNCA. Es lo que dice la fila de Rodrigo en producción, y
 * mientras exista una sola justificación guardada con este texto, el módulo
 * tiene que reconocerla como lo que es. Renombrar un dato guardado sin migrarlo
 * es la forma de que una justificación viva se vuelva una ausencia en silencio.
 */
export const MOTIVO_TRABAJO_FUERA_ANTES = "Trabajo fuera de la oficina";

/**
 * 🔴 «CONSTANCIA» — el quinto, desde el 10-sep-2026.
 *
 * Daniel, textual: *«los que están en el módulo todos se deben de pagar si se
 * seleccionó, solo es agregar constancia. No hagamos justificar que no pague,
 * ensucia.»*
 *
 * Es para CUALQUIER constancia oficial —un juzgado, la escuela, un trámite— y
 * se paga igual que los otros cuatro: el rango justificado no se descuenta.
 *
 * ⛔ Y ES TODO LO QUE SE AGREGÓ. No existe —ni se va a crear— un motivo
 * «justificado pero no se paga»: Daniel lo descartó por nombre. En este módulo
 * justificar SIGNIFICA que no se descuenta, y un motivo que justifica sin pagar
 * volvería ambigua la única palabra con la que se decide un pago.
 */
export const MOTIVO_CONSTANCIA = "Constancia";

/**
 * 🔴 «COMPENSATORIO» — el sexto, desde el 14-sep-2026.
 *
 * Daniel, textual: *«compensatorio es cuando por ejemplo trabajan un día
 * domingo y se le compensa ese día por uno de la semana»* y *«debería de haber,
 * así como incapacidad, una opción de compensatorio de días que le debemos
 * libres; al poner qué día será compensatorio, no se le descuente»*.
 *
 * Es un día libre que la empresa le DEBE, y se comporta como Incapacidad: el
 * día no se descuenta. Nada más cambia — no genera horas, no toca el domingo
 * que lo originó (ese se pagó o se aprobó por su lado en Aprobaciones), y es de
 * día completo (sin horas: `motivoAdmiteHoras` sigue siendo solo Constancia).
 * ⚠️ Sin CHECK en la base sobre `motivo` (a propósito, ver las migraciones
 * `20260825140000` y `20260825160000`): no hace falta migración.
 */
export const MOTIVO_COMPENSATORIO = "Compensatorio";

/**
 * 🔴 «DÍA LIBRE DE LA EMPRESA» — el séptimo, desde el 17-sep-2026.
 *
 * Daniel, textual: *«en las fiestas judías hay días libres, dentro de las
 * jornadas ordinarias, que son libres para el colaborador, pero se pagan con el
 * tiempo de horas extra»* y *«se le paga ese día pero deben las horas laborales
 * (8 horas para todos)»*.
 *
 * El día se paga completo —del lado del sueldo se comporta igual que un
 * compensatorio— y a cambio nace una deuda de 8 horas EN DÓLARES, que se paga
 * SOLO con horas extra y arrastra entre quincenas hasta saldarse. La regla
 * entera vive en `dia-libre-empresa.ts`.
 *
 * ⚠️ ES LO CONTRARIO DE `MOTIVO_COMPENSATORIO`, y por eso los dos textos de
 * pantalla están escritos para que no se puedan confundir: el compensatorio es
 * un libre que la empresa DEBÍA y no cuesta nada; éste es un libre que la
 * empresa REGALA y deja debiendo horas. Elegir el equivocado mueve plata.
 *
 * ⚠️ Sin CHECK en la base sobre `motivo` (a propósito, ver `20260825140000`):
 * el motivo no necesita migración. La que hace falta es la de la DEUDA
 * (`20261203120000`), y sin ella el motivo se puede elegir igual: el día se
 * paga y no nace deuda, que es exactamente lo que pasaba ayer.
 */
export const MOTIVO_DIA_LIBRE_EMPRESA = "Día libre de la empresa";

/** Los siete que la pantalla ofrece. Compensatorio va al lado de Incapacidad
 *  (Daniel: *«así como incapacidad»*); el día libre de la empresa va ÚLTIMO,
 *  lejos del compensatorio, porque es el único que mueve plata al elegirlo. */
export const MOTIVOS_JUSTIFICACION = [
  "Incapacidad",
  MOTIVO_COMPENSATORIO,
  "Catástrofe",
  "Escolares",
  MOTIVO_TRABAJO_VENDEDOR,
  MOTIVO_CONSTANCIA,
  MOTIVO_DIA_LIBRE_EMPRESA,
] as const;

/**
 * 🔴 EL DÍA AFUERA SE PAGA COMO UN DÍA NORMAL DE 9 A 6 (14-sep-2026).
 *
 * Daniel, textual: *«a ellas cuando están afuera se les paga el día regular
 * como si hubiesen trabajado las 8 horas, en horario de 9-6, con una hora de
 * almuerzo»* y *«alguien va a decir cada quincena qué días estuvieron afuera,
 * así como a Rodrigo, siempre y cuando no marquen»*.
 *
 * Es «Trabajo de vendedor» con RANGO de fechas, desde la ficha: el motivo ya
 * hacía exactamente eso (no es ausencia, no descuenta, no genera extras).
 *
 * 🔑 EL HORARIO NO SE GUARDA, y no es un olvido. 9:00 a 18:00 con una hora de
 * almuerzo son las 8 horas de un día normal, y un día normal es lo que el
 * quincenal ya paga cuando el día no se descuenta: no hay nada que sumar ni
 * restar. Y guardarlo como `hora_desde`/`hora_hasta` sería PEOR que inútil:
 * en este módulo un rango de horas es un PERMISO (perdona tardanza dentro de
 * la ventana y el día NO queda justificado — ver `permiso-horas.ts`), así que
 * un «9:00 a 18:00» guardado convertiría el día afuera en una AUSENCIA.
 * 🩸 Ya pasó: Rodrigo (13) tiene dos filas del 14-ago-2026 con «Trabajo de
 * vendedor» de 08:00 a 16:30, cargadas antes de que las horas se cerraran a
 * Constancia, y ese día para el motor es un permiso de horas, no un día
 * afuera. Por eso el texto se DICE en el formulario y las horas no viajan.
 *
 * 🔴 SOLO CUENTA LOS DÍAS SIN MARCA. Daniel: *«siempre y cuando no marquen»*.
 * Si la persona marcó ese día, manda el reloj — es lo que el motor hace desde
 * siempre (`reporte.ts`: con marcas, `justificado` es solo un rótulo).
 */
export const TEXTO_DIA_AFUERA =
  "Se paga como un día normal de 8 horas (9:00 a 18:00 con una hora de almuerzo). "
  + "Cuenta solo los días en que no marcó el reloj; si marcó, manda el reloj.";

/** Lo que se le dice a quien justifica un día compensatorio. Una línea. */
export const TEXTO_DIA_COMPENSATORIO =
  "Un día libre que se le debe (por un domingo o feriado trabajado). No se descuenta.";

/**
 * Lo que se le dice a quien carga un día libre de la empresa.
 *
 * 🔴 TIENE QUE LEERSE DISTINTO DEL COMPENSATORIO. Es el único motivo de la
 * lista que crea una deuda, y quien lo elige tiene que enterarse ANTES de
 * guardar, no cuando la contadora vea el cuadro.
 */
export const TEXTO_DIA_LIBRE_EMPRESA =
  "Se paga el día completo y quedan debiendo 8 horas, que se pagan con sus horas "
  + "extra hasta saldar. Nunca sale del sueldo.";

/** ¿Es el día libre que regala la empresa (el que deja debiendo 8 horas)? */
export function esDiaLibreDeLaEmpresa(motivo: string | null | undefined): boolean {
  if (typeof motivo !== "string") return false;
  return motivo.trim() === MOTIVO_DIA_LIBRE_EMPRESA;
}

/**
 * 🔴 MULTIFASHION NUNCA LLEVA DEUDA DE DÍA LIBRE (18-sep-2026).
 *
 * Daniel, textual, dos veces: *«multifashion no se comporta igual, ese día se
 * les regala, igual no van a marcar»* · *«te dije que no hay deuda del día
 * libre a multifashion»*.
 *
 * A ellas ese día se les REGALA: no se descuenta y no queda debiendo nada. Por
 * eso el motivo NO se les ofrece (`motivosParaElegir`) y el servidor rechaza
 * cargarles la deuda (`dia-libre-empresa-server.ts`) con este texto. La lista
 * es por `empresa_key` de la ficha, ESCRITA A MANO: una empresa nueva lleva
 * deuda hasta que Daniel diga lo contrario.
 */
export const EMPRESAS_SIN_DIA_LIBRE: readonly string[] = Object.freeze(["american_classic"]);

/** ¿A esta empresa se le carga el día libre (con su deuda)? Sin empresa, sí: lo de siempre. */
export function ofreceDiaLibreDeLaEmpresa(empresa: string | null | undefined): boolean {
  return !EMPRESAS_SIN_DIA_LIBRE.includes(String(empresa ?? "").trim());
}

/** Lo que contesta el servidor —y lo que se lee en pantalla— si alguien lo intenta igual. */
export const TEXTO_DIA_LIBRE_NO_APLICA =
  "A Multifashion el día libre de la empresa se le regala: ese día no se descuenta y no queda "
  + "debiendo horas, así que no se carga como día libre. Si la tienda cerró ese día, va como "
  + "feriado, en «Feriados y cierres».";

/**
 * Los motivos que la pantalla ofrece para ESA persona: los siete, menos el día
 * libre de la empresa donde no aplica. Sin empresa conocida se ofrecen todos
 * (el servidor lo vuelve a preguntar con la ficha en la mano).
 */
export function motivosParaElegir(empresa: string | null | undefined): readonly string[] {
  return ofreceDiaLibreDeLaEmpresa(empresa)
    ? MOTIVOS_JUSTIFICACION
    : MOTIVOS_JUSTIFICACION.filter((m) => !esDiaLibreDeLaEmpresa(m));
}

/**
 * La nota de UNA línea que el formulario muestra debajo del motivo elegido.
 * `null` = ese motivo no necesita explicación (los de siempre).
 *
 * 🔑 Vive acá, en el módulo puro, para que la ficha y la fila del día —que
 * montan el MISMO `JustificarForm`— digan lo mismo, y para que el candado lo
 * pruebe sin montar nada.
 */
export function notaDelMotivo(motivo: string | null | undefined): string | null {
  if (esTrabajoDeVendedor(motivo)) return TEXTO_DIA_AFUERA;
  if (String(motivo ?? "").trim() === MOTIVO_COMPENSATORIO) return TEXTO_DIA_COMPENSATORIO;
  if (esDiaLibreDeLaEmpresa(motivo)) return TEXTO_DIA_LIBRE_EMPRESA;
  return null;
}

/**
 * Los que ya NO se ofrecen pero SIGUEN GUARDADOS en la base.
 *
 * 🔑 Están acá para que se puedan LEER, no para que se puedan elegir. Una fila
 * vieja con «Luto» tiene que seguir mostrándose y seguir sin descontar; lo que
 * cambia es que nadie puede crear una nueva.
 *
 * ⛔ «Vacaciones» NO ESTÁ ACÁ, y no es un olvido: se MUDÓ a su propia pestaña
 * (25-ago-2026, ver la nota de arriba). Volver a ponerla haría que el
 * desplegable la ofreciera de nuevo por la puerta de atrás y que el mismo día
 * pudiera existir dos veces —una como vacación y otra como «Ausencia
 * justificada — Vacaciones»—, con dos etiquetas contradictorias en el renglón
 * que decide un pago.
 */
export const MOTIVOS_RETIRADOS = [
  "Permiso",
  "Luto",
  "Otro",
  MOTIVO_TRABAJO_FUERA_ANTES,
] as const;

/** ¿Este motivo se puede elegir hoy? Los retirados se leen, no se ofrecen. */
export function motivoSeOfrece(motivo: string | null | undefined): boolean {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  return (MOTIVOS_JUSTIFICACION as readonly string[]).includes(m);
}

/** ¿Es un motivo que el módulo conoce, aunque ya no se ofrezca? */
export function motivoConocido(motivo: string | null | undefined): boolean {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  return motivoSeOfrece(m) || (MOTIVOS_RETIRADOS as readonly string[]).includes(m);
}

/**
 * ¿Este motivo dice "trabajó, pero no acá"?
 *
 * 🔴 ACEPTA LOS DOS NOMBRES, el nuevo y el de antes del 25-ago-2026. Es lo que
 * hace que la justificación de Rodrigo —guardada con el texto viejo— siga sin
 * descontarse. Hay candado en dólares.
 *
 * 🔑 Compara contra las constantes y nada más — sin `includes`, sin buscar la
 * palabra "trabajo" adentro. Un motivo escrito a mano parecido ("permiso para
 * trabajar afuera") NO es este caso: se sabe cuál es porque es el que la
 * pantalla ofrece, no porque se le parezca.
 */
export function esTrabajoDeVendedor(motivo: string | null | undefined): boolean {
  if (typeof motivo !== "string") return false;
  const m = motivo.trim();
  return m === MOTIVO_TRABAJO_VENDEDOR || m === MOTIVO_TRABAJO_FUERA_ANTES;
}

/**
 * Cómo se lee un día justificado, en pantalla y en el Excel.
 *
 * 🔴 EL PUNTO DE TODO ESTO. Con el texto genérico —«Ausencia justificada —
 * Trabajo de vendedor»— el renglón diría que la persona estuvo AUSENTE, que es
 * exactamente lo contrario de lo que pasó. Un día de vendedor se lee
 * «Trabajando fuera de la oficina», sin la palabra "ausencia" en ningún lado.
 *
 * ⚠️ Se dice «(vendedor)» al lado para que quien busque la palabra de Daniel la
 * encuentre, sin perder la frase que describe el día — que es la que evita que
 * se lea como "ya no trabaja acá".
 */
export function textoDiaJustificado(motivo: string): string {
  if (esTrabajoDeVendedor(motivo)) return "Trabajando fuera de la oficina (vendedor)";
  // 🔴 Un compensatorio tampoco es una «ausencia»: es un día libre que se le
  // debía (14-sep-2026). Se lee como lo que es.
  if (motivo.trim() === MOTIVO_COMPENSATORIO) return "Día compensatorio (libre que se le debía)";
  // 🔴 Y el día libre que REGALA la empresa tampoco es una ausencia: se pagó
  // entero. Se dice lo que lo separa del compensatorio —que deja debiendo— para
  // que los dos no se lean igual en una lista de días (17-sep-2026).
  if (esDiaLibreDeLaEmpresa(motivo)) return "Día libre de la empresa (queda debiendo 8 horas)";
  return `Ausencia justificada — ${motivo}`;
}
