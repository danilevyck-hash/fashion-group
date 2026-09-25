/* ─────────────────────────────────────────────────────────────────────────────
 * DE NOCHE Y EL FIN DE SEMANA, EL RELOJ APAGADO NO ES UNA AVERÍA (25-sep-2026).
 * Módulo PURO: sin base, sin red, sin `new Date()` — «ahora» entra por parámetro.
 *
 * Daniel, textual, mirando la pastilla de la fila de mandos que decía «Los dos
 * relojes sin responder · hace 16 h»: *«es normal que se apaguen de noche y
 * fines de semana»*.
 *
 * 🩸 QUÉ VINO A ARREGLAR. La PC de la oficina —la que empuja las marcas de los
 * dos relojes— se apaga al cerrar y se prende al abrir. A las 12 minutos sin
 * noticias (`MINUTOS_PARA_CALLADO`) la pantalla pinta ÁMBAR, así que de 6 de la
 * tarde a 8 de la mañana y todos los sábados y domingos la pastilla estaba en
 * ámbar diciendo que algo pasa. Un aviso que suena todas las noches es la forma
 * más barata de perder el aviso de verdad — es exactamente lo que ya le pasó al
 * Telegram del reloj el 15-sep-2026 (ver `agente.ts` › el vigía).
 *
 * 🔴 LA REGLA, en una línea: **el mismo silencio se lee distinto según la hora**.
 *
 *   · FUERA DE HORARIO (antes de la entrada, después de la salida, o un día que
 *     esa empresa no trabaja) **y** con la última lectura de HOY o del ÚLTIMO
 *     DÍA HÁBIL → gris: «Reloj apagado · última lectura ayer 18:32». Sin ámbar.
 *   · EN HORARIO HÁBIL y callado (los mismos 12 minutos de siempre) → ÁMBAR,
 *     igual que hoy: a esa hora la PC tendría que estar prendida.
 *   · EN HORARIO HÁBIL y al día → verde, igual que hoy.
 *   · Y **si la última lectura es más vieja que el último día hábil, ÁMBAR
 *     aunque sean las 3 de la mañana**: eso ya no es «la tienda cerró», es un
 *     día de marcaciones que no entraron.
 *
 * 🔴 NINGÚN NÚMERO CAMBIA, y «Traer ahora» tampoco. Acá no se mide un minuto ni
 * un centavo: se decide de qué color y con qué palabras se lee una línea. El
 * umbral de «callado» sigue siendo el de `agente.ts` y lo sigue decidiendo el
 * servidor; esto solo mira lo que ya vino.
 *
 * 🔑 LOS DÍAS SALEN DE LA REGLA DE LA CASA, no de un `if`: `diasLaborablesDe-
 * Empresas` (`horario-configurable.ts`) — Multifashion lunes a SÁBADO, las
 * otras lunes a viernes — con las empresas que le tocan a cada reloj
 * (`RELOJ_DE_EMPRESAS`). Las HORAS son una lista escrita a mano, como todas las
 * de la casa, y su valor por defecto es ESPEJO de `ENTRADA_DEFAULT`/
 * `SALIDA_DEFAULT` de `reporte.ts` (candado que compara los dos).
 *
 * ⚠️ NO HAY FERIADOS. Asistencia no los tiene por empresa (CLAUDE.md), así que
 * un feriado en día hábil se lee como un día hábil: peca de avisar de más, que
 * es el lado correcto para equivocarse.
 * ────────────────────────────────────────────────────────────────────────── */

import { nombreRelojEnPantalla, type SaludAgente } from "./agente";
import { diasLaborablesDeEmpresas } from "./horario-configurable";
import { RELOJ_DE_EMPRESAS } from "./relojes-en-la-fila";

/** Lo mínimo que esta regla le pide a un reloj. */
export interface RelojParaElHorario {
  dispositivo: string;
  salud: SaludAgente;
  /** Minutos desde el último contacto. `null` = nunca hubo. */
  minutosSinNoticias?: number | null;
  /** El último contacto de la PC, en ISO. Con él la hora es EXACTA. */
  vistoEn?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Las horas de cada empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔑 ESPEJO de `ENTRADA_DEFAULT`/`SALIDA_DEFAULT` (`reporte.ts`). Se repiten acá
 * —en vez de importarlos— para no arrastrar el motor del reporte entero al
 * navegador por dos cadenas de cinco letras; la igualdad la sostiene el candado
 * `reloj-fuera-de-horario`, que importa los dos archivos y compara.
 */
export const ENTRADA_DE_SIEMPRE = "08:00";
export const SALIDA_DE_SIEMPRE = "17:00";

/**
 * Las horas de cada empresa. Lista ESCRITA A MANO: no se deriva de nada.
 * Daniel, al configurar Multifashion: *«multifashion es de 10-1830»*.
 * Una empresa que no esté acá usa las de siempre.
 */
export const HORARIO_POR_EMPRESA: Readonly<Record<string, { entrada: string; salida: string }>> =
  Object.freeze({
    american_classic: { entrada: "10:00", salida: "18:30" },
  });

/** `"18:30"` → 1110 minutos desde la medianoche. `null` si no es una hora. */
export function minutosDeLaHora(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * La ventana de un reloj: los días en que trabaja ALGUNA de sus empresas y el
 * horario MÁS ANCHO de todas ellas.
 *
 * 🔴 EL MÁS ANCHO, no el promedio ni el de la primera: un reloj que lee tres
 * empresas está en horario mientras cualquiera de ellas lo esté. Achicar la
 * ventana sería llamar «apagado normal» a un silencio de media mañana.
 *
 * 🔴 FALLA ABIERTA: un reloj que no esté en `RELOJ_DE_EMPRESAS` usa lunes a
 * viernes y las horas de siempre.
 */
export function ventanaDelReloj(dispositivo: string): {
  dias: readonly number[];
  desde: number;
  hasta: number;
} {
  const empresas = RELOJ_DE_EMPRESAS[dispositivo] ?? [];
  const dias = diasLaborablesDeEmpresas(empresas.length ? empresas : [null]);
  const horarios = (empresas.length ? empresas : [""]).map(
    (e) => HORARIO_POR_EMPRESA[e] ?? { entrada: ENTRADA_DE_SIEMPRE, salida: SALIDA_DE_SIEMPRE },
  );
  const desdes = horarios
    .map((h) => minutosDeLaHora(h.entrada))
    .filter((n): n is number => n !== null);
  const hastas = horarios
    .map((h) => minutosDeLaHora(h.salida))
    .filter((n): n is number => n !== null);
  return {
    dias,
    desde: desdes.length ? Math.min(...desdes) : (minutosDeLaHora(ENTRADA_DE_SIEMPRE) as number),
    hasta: hastas.length ? Math.max(...hastas) : (minutosDeLaHora(SALIDA_DE_SIEMPRE) as number),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La hora de Panamá (UTC−5 fijo, sin horario de verano)
// ─────────────────────────────────────────────────────────────────────────────

const MS_PANAMA = 5 * 3_600_000;

/** Qué hora y qué día es en Panamá en ese instante. */
export function enPanama(ms: number): {
  fecha: string;
  /** 0 = domingo … 6 = sábado, como `DIAS_LABORABLES_*`. */
  dia: number;
  minutosDelDia: number;
  hhmm: string;
} {
  const d = new Date(ms - MS_PANAMA);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return {
    fecha: d.toISOString().slice(0, 10),
    dia: d.getUTCDay(),
    minutosDelDia: d.getUTCHours() * 60 + d.getUTCMinutes(),
    hhmm: `${hh}:${mm}`,
  };
}

/** Le suma (o le resta) días a una fecha `YYYY-MM-DD`. */
function masDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(t)) return fecha;
  return new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
}

/** El día de la semana (0 = domingo) de una fecha `YYYY-MM-DD`. */
export function diaDeLaSemana(fecha: string): number {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t).getUTCDay() : 0;
}

/**
 * El último día hábil ANTERIOR a esa fecha, con la lista de días que le toca.
 * Se busca hacia atrás como mucho una semana; sin ninguno, el día anterior.
 */
export function diaHabilAnterior(fecha: string, dias: readonly number[]): string {
  for (let i = 1; i <= 7; i++) {
    const f = masDias(fecha, -i);
    if (dias.includes(diaDeLaSemana(f))) return f;
  }
  return masDias(fecha, -1);
}

// ─────────────────────────────────────────────────────────────────────────────
// La decisión
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Es ahora hora de trabajo para lo que lee este reloj? */
export function enHorarioHabil(dispositivo: string, ahoraMs: number): boolean {
  const { dias, desde, hasta } = ventanaDelReloj(dispositivo);
  const ahora = enPanama(ahoraMs);
  if (!dias.includes(ahora.dia)) return false;
  return ahora.minutosDelDia >= desde && ahora.minutosDelDia <= hasta;
}

/** El instante del último contacto, en milisegundos. `null` si no se sabe. */
function ultimoContactoMs(reloj: RelojParaElHorario, ahoraMs: number): number | null {
  if (reloj.vistoEn) {
    const t = Date.parse(reloj.vistoEn);
    if (Number.isFinite(t)) return t;
  }
  if (typeof reloj.minutosSinNoticias === "number" && Number.isFinite(reloj.minutosSinNoticias)) {
    return ahoraMs - reloj.minutosSinNoticias * 60_000;
  }
  return null;
}

/**
 * 🔴 ¿ESTE RELOJ ESTÁ APAGADO PORQUE LA OFICINA ESTÁ CERRADA?
 *
 * Solo si (a) está CALLADO —«nunca instalado» y «no pudo leer el reloj» son
 * otra cosa y siguen avisando—, (b) ahora no es horario hábil suyo, y (c) la
 * última vez que se supo de él fue HOY o el ÚLTIMO DÍA HÁBIL. Sin saber cuándo
 * fue la última lectura NO se calla: ante la duda, se avisa.
 */
export function esApagadoPorHorario(reloj: RelojParaElHorario, ahoraMs: number): boolean {
  if (reloj.salud !== "callado") return false;
  if (enHorarioHabil(reloj.dispositivo, ahoraMs)) return false;
  const contacto = ultimoContactoMs(reloj, ahoraMs);
  if (contacto === null) return false;
  const { dias } = ventanaDelReloj(reloj.dispositivo);
  const hoy = enPanama(ahoraMs).fecha;
  const fechaContacto = enPanama(contacto).fecha;
  return fechaContacto === hoy || fechaContacto === diaHabilAnterior(hoy, dias);
}

const DIAS_EN_PALABRAS = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
] as const;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * «hoy 10:05» · «ayer 18:32» · «el sábado 18:32» · «el 12 sep 18:32».
 * `null` cuando no se sabe cuándo fue — y entonces no se dice nada.
 */
export function cuandoFueLaUltimaLectura(
  reloj: RelojParaElHorario,
  ahoraMs: number,
): string | null {
  const contacto = ultimoContactoMs(reloj, ahoraMs);
  if (contacto === null) return null;
  const hoy = enPanama(ahoraMs).fecha;
  const c = enPanama(contacto);
  if (c.fecha === hoy) return `hoy ${c.hhmm}`;
  if (c.fecha === masDias(hoy, -1)) return `ayer ${c.hhmm}`;
  for (let i = 2; i <= 6; i++) {
    if (c.fecha === masDias(hoy, -i)) return `el ${DIAS_EN_PALABRAS[diaDeLaSemana(c.fecha)]} ${c.hhmm}`;
  }
  const [, mes, dia] = c.fecha.split("-");
  return `el ${Number(dia)} ${MESES[Number(mes) - 1] ?? mes} ${c.hhmm}`;
}

/** El que más tiempo lleva sin dar señales — el más viejo manda. */
function elMasViejo(
  relojes: readonly RelojParaElHorario[],
  ahoraMs: number,
): RelojParaElHorario | null {
  let peor: RelojParaElHorario | null = null;
  let peorMs = Infinity;
  for (const r of relojes) {
    const c = ultimoContactoMs(r, ahoraMs);
    if (c === null) continue;
    if (c < peorMs) {
      peorMs = c;
      peor = r;
    }
  }
  return peor ?? relojes[0] ?? null;
}

/** «Reloj de Boston y Reloj de Multifashion». Nunca una coma final. */
function nombresJuntos(relojes: readonly RelojParaElHorario[]): string {
  const n = relojes.map((r) => nombreRelojEnPantalla(r.dispositivo));
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/**
 * 🔴 LO QUE DICE LA PASTILLA CUANDO LA OFICINA ESTÁ CERRADA, o `null` cuando no
 * es el caso y manda lo de siempre (`textoDeLaPastilla`).
 *
 * Devuelve algo SOLO si hay algún reloj que no está al día **y TODOS los que no
 * lo están son apagones de horario**. Con uno solo que tenga un problema de
 * verdad, la pastilla sigue en ámbar: esconder un reloj caído detrás de otro
 * apagado sería justo al revés de lo que hace falta.
 *
 *   · los dos apagados          → «Relojes apagados · última lectura ayer 18:32»
 *   · uno solo, y apagado       → «Reloj apagado · última lectura ayer 18:32»
 *   · uno apagado y otro al día → «Reloj de Multifashion apagado · última lectura…»
 */
export function textoRelojApagado(
  relojes: readonly RelojParaElHorario[],
  ahoraMs: number,
): string | null {
  if (relojes.length === 0) return null;
  const malos = relojes.filter((r) => r.salud !== "al_dia");
  if (malos.length === 0) return null;
  if (!malos.every((r) => esApagadoPorHorario(r, ahoraMs))) return null;

  const todos = malos.length === relojes.length;
  const cabeza = todos
    ? malos.length > 1
      ? "Relojes apagados"
      : "Reloj apagado"
    : `${nombresJuntos(malos)} ${malos.length > 1 ? "apagados" : "apagado"}`;

  const peor = elMasViejo(malos, ahoraMs);
  const cuando = peor ? cuandoFueLaUltimaLectura(peor, ahoraMs) : null;
  return cuando ? `${cabeza} · última lectura ${cuando}` : cabeza;
}
