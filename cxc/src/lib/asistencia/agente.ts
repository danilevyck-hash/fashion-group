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
 *      recupera solo, NO se avisa. Un corte de luz de dos minutos no es un
 *      incidente.
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

/* ── La regla de las tres alertas ───────────────────────────────────────── */

/**
 * Cuántas fallas SEGUIDAS antes de escribirle a Daniel.
 *
 * 🩸 El punto 2 de la regla de sistema de CLAUDE.md: "si se arregla solo, NO se
 * avisa". El agente reintenta cada 3 minutos, así que tres fallas seguidas son
 * ~9 minutos de reloj mudo de verdad. Avisar a la primera convertiría cada
 * reinicio del aparato en una notificación al celular, y en dos semanas Daniel
 * silenciaría el canal — que es exactamente cómo se pierde una alerta real.
 */
export const FALLOS_PARA_ALERTAR = 3;

export interface ContadorAlerta {
  fallosSeguidos: number;
  alertadoEn: string | null;
}

export type QueAlerta = "ninguna" | "caido" | "recuperado";

export interface DecisionAlerta extends ContadorAlerta {
  alerta: QueAlerta;
}

/**
 * Máquina de estados del aviso. Sube el contador con cada falla, lo pone en
 * cero con cada éxito, y avisa UNA sola vez por episodio.
 *
 * `alertadoEn` cumple dos funciones a la vez: es el candado que evita repetir
 * el mismo aviso en cada vuelta, y es la memoria de que hubo un episodio
 * abierto — sin él no se sabría si hace falta mandar el "ya volvió".
 *
 * El "ya volvió" NO es ruido: sin él, Daniel se queda con la última noticia
 * mala y va a la oficina a revisar algo que ya se arregló.
 */
export function decidirAlerta(prev: ContadorAlerta, evento: "falla" | "exito", ahoraIso: string): DecisionAlerta {
  if (evento === "exito") {
    if (prev.alertadoEn) {
      return { fallosSeguidos: 0, alertadoEn: null, alerta: "recuperado" };
    }
    return { fallosSeguidos: 0, alertadoEn: null, alerta: "ninguna" };
  }
  const fallos = Math.max(0, prev.fallosSeguidos ?? 0) + 1;
  if (fallos >= FALLOS_PARA_ALERTAR && !prev.alertadoEn) {
    return { fallosSeguidos: fallos, alertadoEn: ahoraIso, alerta: "caido" };
  }
  return { fallosSeguidos: fallos, alertadoEn: prev.alertadoEn ?? null, alerta: "ninguna" };
}

/* ── El vigía: cuando la PC está apagada, NADIE llama ───────────────────── */

/**
 * 🩸 EL CASO QUE LA MÁQUINA DE ARRIBA NO PUEDE VER.
 *
 * `decidirAlerta` sube el contador cuando el agente REPORTA una falla. Pero si
 * la PC está apagada, el agente no reporta nada: no hay falla, hay silencio. Y
 * el silencio no dispara ningún código. Por eso hace falta que alguien del lado
 * de Vercel mire el reloj de pared una vez al día.
 *
 * ⚠️ SOLO CORRE DE DÍA, Y ESO LO DECIDE `vercel.json`, NO ESTE ARCHIVO. Cuatro
 * pasadas entre las 8:45 a.m. y las 5:15 p.m. de Panamá (13:45, 15:00, 20:00 y
 * 22:15 UTC — Panamá es UTC-5 todo el año). De madrugada no se revisa a
 * propósito: nadie va a levantarse a las 3 a.m. a prender una PC, así que un
 * aviso a esa hora solo enseña a silenciar el canal.
 *
 * ⚠️ TODOS LOS DÍAS, incluidos sábado y domingo. La oficina cierra, pero la PC
 * no: el agente reporta cada 3 minutos aunque no haya nadie. Un domingo mudo
 * es una PC apagada de verdad, y enterarse el domingo a las 9 de la mañana es
 * mejor que enterarse el lunes con dos días de asistencia sin entrar.
 *
 * Que corra cuatro veces NO multiplica los avisos: `alertado_en` es el candado
 * y deja pasar uno solo por episodio (ver `vigiaDebeAlertar`). Las otras tres
 * pasadas solo achican la demora entre que la PC se apaga y Daniel se entera.
 */
export const HORAS_PARA_VIGIA = 6;

/**
 * ¿El vigía tiene que escribir? Solo si (a) el agente alguna vez existió —no se
 * avisa de algo que nunca se instaló—, (b) lleva más de `horas` sin dar señales
 * y (c) no se avisó ya de este mismo episodio.
 */
export function vigiaDebeAlertar(
  fila: FilaDispositivo | null,
  ahoraMs: number,
  horas: number = HORAS_PARA_VIGIA,
): boolean {
  if (!fila?.visto_en) return false; // nunca se instaló: no hay nada que reclamar
  if (fila.alertado_en) return false; // ya se avisó de este episodio
  const mins = minutosDesde(fila.visto_en, ahoraMs);
  return mins !== null && mins > horas * 60;
}

/* ── Los textos de Telegram ─────────────────────────────────────────────── */

/**
 * Los tres mensajes dicen lo mismo en el mismo orden: QUÉ pasó · QUÉ significa
 * para el negocio · QUÉ hacer. Es el formato que pide CLAUDE.md para el canal
 * de sistema, y el que hace que se pueda actuar sin abrir la computadora.
 */
export function textoCaido(dispositivo: string, motivo: string): string {
  return [
    `El agente de asistencia no puede leer el reloj (${dispositivo}).`,
    `Falló ${FALLOS_PARA_ALERTAR} veces seguidas. Detalle: ${motivo}`,
    "Qué significa: las marcaciones de hoy no están entrando. El reloj las guarda, así que no se pierden — entran cuando se restablezca.",
    "Qué hacer: revisar que el reloj de la entrada esté prendido y en la red.",
  ].join("\n");
}

export function textoSilencio(dispositivo: string, minutos: number): string {
  return [
    `Hace ${hace(minutos).replace("hace ", "")} que la PC de la oficina no manda marcaciones (${dispositivo}).`,
    "Qué significa: la asistencia de hoy está sin actualizar. El reloj las guarda, no se pierde ninguna.",
    "Qué hacer: prender la PC del iVMS. Sola se pone al día en unos minutos.",
  ].join("\n");
}

export function textoRecuperado(dispositivo: string): string {
  return `Ya volvieron a entrar las marcaciones del reloj (${dispositivo}). No hay que hacer nada.`;
}
