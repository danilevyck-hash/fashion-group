/* ─────────────────────────────────────────────────────────────────────────────
 * EL AGENTE DEL RELOJ — reglas puras (sin base, sin red, sin env).
 *
 * El reloj Hikvision vive en `192.168.10.10`, una IP PRIVADA de la oficina.
 * Vercel no la alcanza y nunca la va a alcanzar. Por eso hay un programita
 * (`scripts/agente-reloj/`) corriendo en una PC de la oficina que le pregunta
 * al reloj y empuja lo que encuentra a `/api/asistencia/ingest`.
 *
 * Este archivo tiene las TRES decisiones que no pueden vivir sueltas:
 *
 *   1. QUÉ SE MUESTRA EN PANTALLA cuando la PC está apagada. Un botón que gira
 *      para siempre es peor que un cartel que dice "prende la PC".
 *   2. CUÁNDO SE AVISA POR TELEGRAM. Regla de las tres de CLAUDE.md: si se
 *      recupera solo, NO se avisa. Desde el 15-sep-2026 eso es UN solo aviso —
 *      el vigía, a las 24 h sin poder leer el reloj y de lunes a viernes— y ni
 *      uno más: ver la nota de «acá vivía la regla de las tres alertas».
 *   3. CÓMO SE SABE QUE FALTA EL DDL. Los DDL los corre Daniel a mano y varios
 *      esperaron semanas; todo lo de acá tiene que funcionar sin la migración.
 *
 * Puro a propósito: se testea entero sin base y sin reloj — que es lo único
 * que se puede testear desde afuera de la oficina.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 🔑 EL NOMBRE DEL RELOJ ES ESTE Y NO OTRO.
 *
 * Medido contra producción el 6-ago-2026: las **3.287** marcaciones cargadas
 * están TODAS bajo `dispositivo = 'reloj cboston'`, con `evento_id` = el
 * `serialNo` del propio aparato. Si el agente usara otro nombre, el índice
 * único `(dispositivo, evento_id)` no las reconocería y volvería a insertar
 * julio entero como si fuera nuevo: las horas trabajadas saldrían al doble.
 *
 * O sea que esta constante no es una etiqueta: es la llave que hace que
 * correr el agente dos veces —o después de un backfill— no duplique nada.
 */
export const DISPOSITIVO_FG = "reloj cboston";

/**
 * 🔑 CÓMO SE LLAMA CADA RELOJ EN PANTALLA — lista ESCRITA A MANO.
 *
 * Desde el 10-sep-2026 hay DOS relojes: el de Confecciones Boston y el de
 * Multifashion, los dos leídos por la misma PC de la oficina. El nombre técnico
 * (`reloj cboston`, `reloj acs`) es la LLAVE anti-duplicado y no se toca; esto
 * es solo cómo se lee.
 *
 * Lista a mano y no derivada de nada: es la regla de la casa para pasar de un
 * código a un nombre. Un reloj que no esté en la lista se muestra **con su
 * llave tal cual** — nunca se inventa un nombre bonito para algo que el sistema
 * no conoce.
 *
 * ⚠️ Se dice **Multifashion**, no «American Classics»: es el nombre que va en
 * todas las pantallas desde el 6-sep-2026, aunque la llave diga `acs`.
 */
export const NOMBRE_DE_RELOJ: Readonly<Record<string, string>> = {
  "reloj cboston": "Reloj de Boston",
  "reloj acs": "Reloj de Multifashion",
};

export function nombreRelojEnPantalla(clave: string): string {
  return NOMBRE_DE_RELOJ[clave] ?? clave;
}

/** El archivo que Daniel tiene que correr para que el botón "Traer ahora"
 *  funcione. Se nombra en pantalla; nadie deduce un DDL de un 500. */
export const MIGRACION_AGENTE = "20260806200000_asistencia_agente_pedido.sql";

export function avisoMigracionAgente(): string {
  return `Falta correr la migración ${MIGRACION_AGENTE} en Supabase. Mientras tanto las marcaciones siguen entrando solas; lo único que no funciona es el botón "Traer ahora".`;
}

/* ── Detección de "falta la columna" ────────────────────────────────────────
 * PostgREST devuelve PGRST204 con el texto
 *   Could not find the 'pedido_en' column of 'asistencia_dispositivos' ...
 * Mismo criterio que `config.ts`: solo se degrada cuando el error NOMBRA la
 * columna o trae el código. Tragarse cualquier error convertiría un problema
 * real —permisos, red, RLS— en una pantalla que miente diciendo "falta el DDL".
 */
const COLUMNAS_NUEVAS = [
  "pedido_en",
  "pedido_por",
  "pedido_atendido_en",
  "fallos_seguidos",
  "alertado_en",
  "agente_version",
  "hueco_alertado_en",
  "leido_ok_en",
] as const;

export function esColumnaFaltante(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const nombraColumna = COLUMNAS_NUEVAS.some((c) => msg.includes(`'${c}'`) || msg.includes(`"${c}"`));
  if (!nombraColumna) return false;
  // PGRST204 = "columna no encontrada en el schema cache". 42703 = Postgres
  // "column does not exist". Cualquiera de los dos, más el nombre, es certeza.
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    msg.includes("could not find") ||
    msg.includes("does not exist")
  );
}

/* ── Estado del agente, tal como se lee en pantalla ─────────────────────── */

/** Lo que guarda `asistencia_dispositivos`. Los campos nuevos son opcionales
 *  porque sin la migración corrida simplemente no vienen. */
export interface FilaDispositivo {
  dispositivo: string;
  leido_hasta?: string | null;
  visto_en?: string | null;
  ultimo_error?: string | null;
  pedido_en?: string | null;
  pedido_atendido_en?: string | null;
  fallos_seguidos?: number | null;
  alertado_en?: string | null;
  agente_version?: string | null;
  /** Candado del aviso "hay un hueco que el programa ya no alcanza".
   *  DDL: 20260812130000_asistencia_hueco_alertado.sql — sin correr, no viene. */
  hueco_alertado_en?: string | null;
  /**
   * 🔴 Cuándo se LEYÓ el reloj bien por última vez (15-sep-2026).
   *
   * ⚠️ NO ES `visto_en`. `visto_en` es el último contacto de la PC, y se mueve
   * también cuando el agente reporta que NO pudo leer el reloj. Esta se mueve
   * SOLO en el camino del éxito, y es la que hace medible «lleva más de 24
   * horas sin poder leerse».
   *
   * DDL: 20261130120000_asistencia_leido_ok_en.sql — sin correr, no viene, y
   * el vigía cae a `visto_en` (la conducta de antes).
   */
  leido_ok_en?: string | null;
}

export type SaludAgente = "nunca" | "al_dia" | "callado" | "con_error";

/**
 * Cuántos minutos sin noticias antes de decir que la PC no responde.
 *
 * El agente da una vuelta cada 3 minutos (ver `VUELTA_MIN_DEFAULT` en
 * `scripts/agente-reloj/config.mjs`), así que 12 minutos son CUATRO vueltas
 * perdidas seguidas. Con menos, un reinicio de Windows o una vuelta lenta
 * pintarían la pantalla de rojo sin que pase nada.
 */
export const MINUTOS_PARA_CALLADO = 12;

/**
 * Cuánto espera el botón antes de admitir que nadie recogió el pedido.
 *
 * Dos vueltas completas + margen. Pasado esto la pantalla DEJA DE GIRAR y dice
 * qué hacer: girar para siempre es la forma más cara de no informar nada.
 */
export const MINUTOS_PEDIDO_SIN_ATENDER = 7;

export interface EstadoAgente {
  salud: SaludAgente;
  /** Titular corto, el que se lee de un vistazo. */
  titulo: string;
  /** Qué hacer al respecto, en cristiano. Puede ser `null` si no hay nada que hacer. */
  detalle: string | null;
  /** Hay un "Traer ahora" pedido que la PC todavía no recogió. */
  pedidoPendiente: boolean;
  /** El pedido lleva demasiado sin que nadie lo recoja → dejar de girar. */
  pedidoSinRespuesta: boolean;
  /** Minutos desde el último contacto. `null` si nunca hubo. */
  minutosSinNoticias: number | null;
}

/** "hace 3 minutos" / "hace 2 horas" / "hace 4 días" — en español simple. */
export function hace(minutos: number): string {
  if (minutos < 1) return "hace menos de un minuto";
  if (minutos < 60) return `hace ${Math.round(minutos)} ${Math.round(minutos) === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(minutos / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

function minutosDesde(iso: string | null | undefined, ahoraMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (ahoraMs - t) / 60_000);
}

/**
 * Traduce la fila de la base a lo que ve una persona.
 *
 * ⚠️ El orden de las ramas importa: primero "nunca" (todavía no se instaló),
 * después "callado" (la PC está apagada) y recién al final "con_error". Un
 * error viejo de hace tres días NO puede tapar el hecho de que la PC lleva
 * apagada desde entonces — lo accionable es prenderla, no leer el error.
 */
export function estadoAgente(fila: FilaDispositivo | null, ahoraMs: number): EstadoAgente {
  const mins = minutosDesde(fila?.visto_en, ahoraMs);

  // ¿Hay un pedido sin atender? `pedido_atendido_en` más nuevo que `pedido_en`
  // significa que la vuelta que lo recogió ya pasó. Se comparan instantes y no
  // un booleano para que un pedido NUEVO hecho mientras el agente trabajaba no
  // quede marcado como atendido por la vuelta anterior.
  const pedidoEn = fila?.pedido_en ? Date.parse(fila.pedido_en) : NaN;
  const atendidoEn = fila?.pedido_atendido_en ? Date.parse(fila.pedido_atendido_en) : NaN;
  const pedidoPendiente =
    Number.isFinite(pedidoEn) && (!Number.isFinite(atendidoEn) || atendidoEn < pedidoEn);
  const minsPedido = pedidoPendiente ? (ahoraMs - pedidoEn) / 60_000 : 0;
  const pedidoSinRespuesta = pedidoPendiente && minsPedido > MINUTOS_PEDIDO_SIN_ATENDER;

  const base = { pedidoPendiente, pedidoSinRespuesta, minutosSinNoticias: mins };

  if (mins === null) {
    return {
      ...base,
      salud: "nunca",
      titulo: "El agente del reloj todavía no está instalado",
      // Sin agente NO hay otra vía: la carga por Excel se retiró el 6-ago-2026
      // porque duplicaba las marcaciones que el reloj ya había traído. Ofrecerla
      // acá como plan B sería invitar al bug que se acaba de cerrar.
      detalle:
        "Hasta que se instale en la PC de la oficina, no entran marcaciones. Es la única vía.",
    };
  }

  if (mins > MINUTOS_PARA_CALLADO) {
    return {
      ...base,
      salud: "callado",
      titulo: `La PC de la oficina no responde (${hace(mins)})`,
      detalle:
        "Casi siempre es porque está apagada. Préndela y en unos minutos se pone al día sola — el reloj guarda las marcaciones, no se pierde ninguna.",
    };
  }

  if (fila?.ultimo_error) {
    return {
      ...base,
      salud: "con_error",
      titulo: "La PC está prendida pero no pudo leer el reloj",
      detalle: fila.ultimo_error,
    };
  }

  return {
    ...base,
    salud: "al_dia",
    titulo: `Las marcaciones están entrando solas (última revisión ${hace(mins)})`,
    detalle: null,
  };
}

/* ── 🩸 ACÁ VIVÍA «LA REGLA DE LAS TRES ALERTAS». SE RETIRÓ EL 15-sep-2026. ──
 *
 * `FALLOS_PARA_ALERTAR = 3`, `decidirAlerta`, `textoCaido` y `textoRecuperado`
 * eran la máquina que avisaba a la TERCERA falla seguida y mandaba el «ya
 * volvió» al recuperarse. Funcionaba exactamente como estaba escrita — y eso
 * era el problema.
 *
 * 🩸 EL CASO, con la captura de Telegram delante: cuatro mensajes en 35 minutos
 * por el reloj de Multifashion —«falló 3 veces» / «ya volvió» / «falló 3 veces»
 * / «ya volvió»—, a las 11:04, 11:11, 11:22 y 11:39 de la noche. El dato que
 * faltaba lo puso Daniel: *«pero la PC del reloj está apagada a estas horas»*.
 * El reloj de Multifashion vive EN LA TIENDA, que cierra a las 7. Que de noche
 * no se pueda leer NO ES UNA AVERÍA: es que la tienda está cerrada. Nueve
 * minutos de reloj mudo son, ahí, el horario normal — y un aviso que suena
 * todas las noches es la forma más barata de perder el aviso de verdad.
 *
 * Su decisión, textual: *«¿que me avise si lleva más de 24 horas, si de lunes a
 * viernes?»*. Queda UN solo aviso, el del vigía, con umbral de 24 h y de lunes
 * a viernes (`HORAS_PARA_VIGIA`, abajo). El «ya volvió» se fue con ellos: con
 * un umbral de 24 horas, tranquilizar por un bajón corto no le sirve a nadie.
 *
 * ⚠️ NADA SE PIERDE POR AVISAR UN DÍA DESPUÉS: el reloj guarda las marcaciones
 * adentro y el agente recupera 15 días hacia atrás al volver
 * (`DIAS_RECUPERACION_AGENTE`). Medido el 15-sep-2026: la PC estuvo caída del
 * viernes 11 al martes 15 y al volver entraron solas las 141 marcaciones del
 * lunes y las 136 del martes.
 *
 * ⚠️ `asistencia_dispositivos.fallos_seguidos` NO se dropea (patrón
 * `mayor_lineas`): el ingest la sigue llevando como diagnóstico y `alertado_en`
 * sigue siendo el candado del vigía.
 * ────────────────────────────────────────────────────────────────────────── */

/* ── El vigía: el ÚNICO aviso del reloj ─────────────────────────────────── */

/**
 * 🩸 POR QUÉ ESTO EXISTE, Y POR QUÉ DESDE EL 15-sep-2026 ES LO ÚNICO QUE AVISA.
 *
 * Cuando la PC está apagada el agente no reporta nada: no hay falla, hay
 * silencio. Y el silencio no dispara ningún código. Por eso hace falta que
 * alguien del lado de Vercel mire el reloj de pared un par de veces al día.
 *
 * ⚠️ SOLO CORRE DE DÍA, Y ESO LO DECIDE `vercel.json`, NO ESTE ARCHIVO. Tres
 * pasadas entre las 10:00 a.m. y las 5:15 p.m. de Panamá (15:00, 20:00 y 22:15
 * UTC — Panamá es UTC-5 todo el año). De madrugada no se revisa a propósito:
 * nadie va a levantarse a las 3 a.m. a prender una PC, así que un aviso a esa
 * hora solo enseña a silenciar el canal.
 *
 * 🩸 Y TAMPOCO a primera hora: la pasada de las 8:45 a.m. (13:45 UTC) se quitó
 * el 10-ago-2026. Daniel apaga la PC de la oficina a las 5/6 p.m., así que a las
 * 8:45 a.m. llevaba ~14 h de silencio y el umbral de entonces (6 h) se cruzaba
 * SIEMPRE — era una falsa alarma diaria. Con las 24 h de hoy ese caso ya no se
 * cruzaría, pero la pasada no vuelve: a las 8:45 la oficina todavía no abrió.
 *
 * 🩸 SOLO DE LUNES A VIERNES, y esto cambió de dirección el 15-sep-2026.
 * Acá decía «TODOS LOS DÍAS, incluidos sábado y domingo. La oficina cierra,
 * pero la PC no». Era falso: Daniel, textual, *«sábado y domingo la PC
 * permanece apagada»*. Con la regla vieja el sábado a las 10 a.m. siempre se
 * cruzaban las 6 h de silencio, así que el vigía avisaba de algo que es el
 * horario normal — y peor, ESE aviso gastaba el candado y dejaba mudo el lunes.
 *
 * 🩸 MEDIDO, el caso que lo destapó (15-sep-2026): los dos relojes dejaron de
 * reportar el viernes 11 a las 7:52 p.m.; el sábado 12 a las 10:00 a.m. el
 * vigía avisó y marcó `alertado_en`; y el lunes 14 y el martes 15 —dos días
 * hábiles enteros sin una sola marcación, con 34 colaboradores saliendo como
 * ausentes— no sonó ni una vez. Un aviso el sábado y silencio el lunes es
 * exactamente al revés de lo que hace falta.
 *
 * 🔴 Y AHORA REPITE mientras la PC siga apagada, una vez por pasada (Daniel:
 * *«telegram me tiene que avisar»*). El candado no se fue: `alertado_en` sigue
 * frenando el doble aviso dentro de la misma pasada y cualquier reintento del
 * cron. Lo que cambió es que deja de ser UNO POR EPISODIO y pasa a ser uno cada
 * `HORAS_ENTRE_AVISOS_VIGIA`. Se apaga solo: el ingest pone `alertado_en` en
 * NULL apenas el agente vuelve a reportar.
 *
 * Los días y las horas los filtra `vercel.json` (`0 15 * * 1-5`, `0 20 * * 1-5`,
 * `15 22 * * 1-5`), no una condición acá: un cron que corre y decide no hacer
 * nada gasta invocación y deja logs que confunden.
 *
 * ── 🔴 EL UMBRAL: 24 HORAS, Y CAMBIÓ EL 15-sep-2026 (antes eran 6) ───────────
 *
 * Daniel, textual: *«¿que me avise si lleva más de 24 horas, si de lunes a
 * viernes?»*. Con 6 h, el reloj de Multifashion —que vive EN LA TIENDA, y la
 * tienda cierra a las 7— cruzaba el umbral todas las noches: el aviso sonaba
 * por el horario normal. Con 24 h, una noche cerrada no suena y un día hábil
 * entero sin poder leer el reloj sí.
 *
 * ⚠️ NADA SE PIERDE POR AVISAR UN DÍA DESPUÉS: el reloj guarda las marcaciones
 * adentro y el agente recupera `DIAS_RECUPERACION_AGENTE` (15) días hacia atrás
 * al volver. Medido el 15-sep-2026: la PC estuvo caída del viernes 11 al martes
 * 15 y al volver entraron solas las 141 marcaciones del lunes y las 136 del
 * martes.
 */
export const HORAS_PARA_VIGIA = 24;

/**
 * Cuánto tiene que pasar para volver a avisar del MISMO silencio.
 *
 * 🔑 Sale de la separación real entre pasadas: 10:00 a.m. → 3:00 p.m. son 5 h y
 * 3:00 p.m. → 5:15 p.m. son 2 h 15. Con 2 h, cada pasada del día avisa una vez
 * y ni una de más; con un número mayor, la de las 5:15 se perdería.
 */
export const HORAS_ENTRE_AVISOS_VIGIA = 2;

/**
 * 🔴 CUÁNDO SE PUDO LEER EL RELOJ POR ÚLTIMA VEZ — y NO cuándo se supo de la PC.
 *
 * 🩸 LA DIFERENCIA ES EL CASO QUE ORIGINÓ TODO ESTO. `visto_en` es el último
 * contacto de la PC de la oficina, y el ingest lo mueve TAMBIÉN cuando el
 * agente reporta que NO pudo leer el reloj. En el episodio del 15-sep-2026 la
 * PC estaba PRENDIDA —por eso llegaron los cuatro mensajes de «falló 3 veces»—
 * y el reloj de Multifashion inalcanzable: midiendo `visto_en`, ese caso no
 * habría sonado NUNCA. Daniel pidió que avise «si lleva más de 24 horas sin
 * poder leerse»: el RELOJ, no la PC.
 *
 * ⚠️ FALLA ABIERTA. Sin la migración `20261130120000` corrida, `leido_ok_en` no
 * viene y se cae a `visto_en`: la conducta de antes (24 h de silencio de la PC),
 * que es correcta y solo cubre menos. Nunca al revés — nunca callar de más.
 */
function ultimaLecturaBuena(fila: FilaDispositivo): string | null | undefined {
  return fila.leido_ok_en ?? fila.visto_en;
}

/**
 * ¿El vigía tiene que escribir? Solo si (a) el agente alguna vez existió —no se
 * avisa de algo que nunca se instaló—, (b) hace más de `horas` que no se puede
 * LEER el reloj y (c) no se avisó de este mismo silencio hace menos de
 * `horasEntreAvisos`.
 */
export function vigiaDebeAlertar(
  fila: FilaDispositivo | null,
  ahoraMs: number,
  horas: number = HORAS_PARA_VIGIA,
  horasEntreAvisos: number = HORAS_ENTRE_AVISOS_VIGIA,
): boolean {
  // Nunca se instaló —ni una lectura buena, ni un contacto de la PC—: no hay
  // nada que reclamar. Se pregunta por la MISMA función que después mide, para
  // que las dos no puedan opinar distinto sobre qué cuenta como «hubo algo».
  if (!fila) return false;
  const ultima = ultimaLecturaBuena(fila);
  if (!ultima) return false;
  const mins = minutosDesde(ultima, ahoraMs);
  if (mins === null || mins <= horas * 60) return false;
  if (fila.alertado_en) {
    // Ya se avisó: solo se repite si pasó el respiro. Una fecha ilegible se
    // trata como «recién avisado» — ante la duda, callar.
    const desdeAviso = minutosDesde(fila.alertado_en, ahoraMs);
    if (desdeAviso === null || desdeAviso <= horasEntreAvisos * 60) return false;
  }
  return true;
}

/* ── El hueco que el programa ya no alcanza ─────────────────────────────────
 *
 * 🔔 4ª ALERTA DE SISTEMA — LA PIDIÓ DANIEL EXPLÍCITAMENTE EL 12-AGO-2026,
 * textual: "ok lo corro pero si pasa mas de 15 dias que me llegue notificacion
 * a telegram alertas para saber q hay q arreglarlo". La lista de CLAUDE.md
 * ("SOLO 3 ALERTAS DE SISTEMA", 30-jul-2026) es cerrada A PROPÓSITO y sigue
 * vigente: esta se suma como la cuarta porque él la aprobó, no porque la
 * política se haya aflojado. No agregar más sin su OK.
 *
 * EL CASO: el agente de la PC tiene ventana normal de 3 días y, al detectar un
 * hueco, barre `VENTANA_RECUPERACION_DIAS` (15) días automáticamente. Un hueco
 * MÁS VIEJO que eso ya no lo alcanza ninguna vuelta — no se arregla solo, y la
 * única salida es que alguien amplíe la ventana en el `.env` de la PC de la
 * oficina. Exactamente la regla de tres del canal SISTEMA: real, no se arregla
 * solo, alguien tiene que hacer algo.
 */

/**
 * Hasta cuántos días hacia atrás recupera SOLO el agente de la PC.
 *
 * 🔑 NO ES UN NÚMERO NUESTRO: es el espejo de `VENTANA_RECUPERACION_DIAS_DEFAULT`
 * en `scripts/agente-reloj/config.mjs` (v1.1.0, la que está instalada en la
 * oficina). Se repite acá porque el código de Next no puede importar los .mjs
 * del agente sin arrastrarlos al bundle; la igualdad la sostiene el test
 * `asistencia-vigia-hueco.test.ts`, que importa el archivo REAL del agente y
 * compara — si alguien mueve uno solo de los dos, el build se pone rojo.
 *
 * ⚠️ Si algún día se amplía la ventana en el `.env` de la PC (VENTANA_
 * RECUPERACION_DIAS=30, p.ej.), este espejo NO se entera: refleja el DEFAULT
 * del programa, no el override local. Está bien así — el aviso peca de
 * temprano, nunca de tarde.
 */
export const DIAS_RECUPERACION_AGENTE = 15;

const MINUTOS_POR_DIA = 24 * 60;

/**
 * ¿Hay que avisar que quedó un hueco fuera del alcance del programa?
 *
 * Solo si (a) el reloj ya trajo algo alguna vez —sin fecha de "leído hasta" no
 * hay hueco, hay un reloj recién puesto—, (b) lo último traído es MÁS viejo que
 * la ventana de recuperación (o sea, esas marcaciones ya no entran solas), y
 * (c) no se avisó ya de este mismo episodio (candado `hueco_alertado_en`,
 * igual que `alertado_en` para el silencio: UN mensaje por episodio, no uno
 * por pasada del cron).
 */
export function vigiaDebeAlertarHueco(
  fila: FilaDispositivo | null,
  ahoraMs: number,
  dias: number = DIAS_RECUPERACION_AGENTE,
): boolean {
  if (!fila?.leido_hasta) return false; // reloj recién puesto: no es hueco
  if (fila.hueco_alertado_en) return false; // ya se avisó de este episodio
  const mins = minutosDesde(fila.leido_hasta, ahoraMs);
  return mins !== null && mins > dias * MINUTOS_POR_DIA;
}

/**
 * ¿El episodio se cerró y hay que mandar el "ya se arregló"?
 *
 * Solo si hubo alerta previa (`hueco_alertado_en` puesto) Y lo leído volvió a
 * estar dentro de la ventana. Sin alerta previa no se manda nada (no hay a
 * quién tranquilizar), y con la fecha ilegible tampoco: afirmar "ya entró"
 * sin poder medirlo sería mentir.
 */
export function vigiaHuecoCerrado(
  fila: FilaDispositivo | null,
  ahoraMs: number,
  dias: number = DIAS_RECUPERACION_AGENTE,
): boolean {
  if (!fila?.hueco_alertado_en) return false; // no hubo episodio abierto
  const mins = minutosDesde(fila.leido_hasta, ahoraMs);
  return mins !== null && mins <= dias * MINUTOS_POR_DIA;
}

/* ── Los textos de Telegram ─────────────────────────────────────────────── */

/**
 * Los tres mensajes dicen lo mismo en el mismo orden: QUÉ pasó · QUÉ significa
 * para el negocio · QUÉ hacer. Es el formato que pide CLAUDE.md para el canal
 * de sistema, y el que hace que se pueda actuar sin abrir la computadora.
 */
/**
 * 🔴 EL ÚNICO MENSAJE QUE QUEDA (15-sep-2026). Dice QUÉ pasó · QUÉ significa ·
 * QUÉ hacer, que es el formato del canal de sistema.
 *
 * ⚠️ Habla del RELOJ, no de la PC: desde que el umbral mide `leido_ok_en`, esto
 * suena tanto con la PC apagada como con la PC prendida y el reloj inalcanzable
 * (el caso de Multifashion). Decir «la PC no manda marcaciones» mandaría a
 * Daniel a mirar una PC que está perfectamente prendida. Las dos causas van en
 * «qué hacer», en orden de probabilidad.
 */
export function textoSilencio(dispositivo: string, minutos: number): string {
  return [
    `Hace ${hace(minutos).replace("hace ", "")} que no se puede leer el reloj (${dispositivo}).`,
    "Qué significa: la asistencia de esos días está sin actualizar. El reloj las guarda adentro, así que no se pierde ninguna — entran solas cuando se restablezca.",
    "Qué hacer: prender la PC del iVMS de la oficina; si ya está prendida, revisar que el reloj esté encendido y en la red.",
  ].join("\n");
}

/**
 * El hueco fuera de alcance. El número de días viene SIEMPRE de la constante
 * compartida (nunca un 15 escrito a mano acá): si el agente cambia su ventana,
 * este texto cambia con él.
 */
export function textoHuecoViejo(
  dispositivo: string,
  dias: number = DIAS_RECUPERACION_AGENTE,
): string {
  return [
    `El reloj de asistencia tiene marcaciones de hace más de ${dias} días sin traer (${dispositivo}).`,
    `Qué significa: el programa de la PC solo recupera hasta ${dias} días hacia atrás, así que esas marcaciones ya no van a entrar solas.`,
    "Qué hacer: hay que ampliar la ventana de recuperación en la PC de la oficina — pídele los pasos a Claude.",
  ].join("\n");
}

export function textoHuecoCerrado(dispositivo: string): string {
  return `Ya entraron las marcaciones atrasadas del reloj (${dispositivo}). No hay que hacer nada.`;
}
