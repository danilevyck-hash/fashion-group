/* ─────────────────────────────────────────────────────────────────────────────
 * LA JUSTIFICACIÓN DE UNAS HORAS — el permiso del que llega tarde con aviso.
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel, 25-ago-2026: la justificación *"gana rango de HORAS (de X a X),
 * además del rango de días. Es para el que llega tarde con permiso
 * justificado."*
 *
 * ── 🔴 LAS DOS REGLAS QUE HACEN QUE ESTO NO SEA UN AGUJERO ───────────────────
 *
 * 1. UN PERMISO DE HORAS **NO** JUSTIFICA EL DÍA ENTERO. Perdona la tardanza
 *    que cae DENTRO de su ventana y nada más. Quien tiene permiso de 8 a 10 y
 *    no vino en todo el día sigue siendo una ausencia de día completo: dos
 *    horas de permiso no explican no haber venido.
 *    🩸 Sin esta regla, cargar «de 8 a 9» borraría el descuento del día entero
 *    —ocho horas de sueldo— y nadie lo vería hasta el día de pago.
 *
 * 2. SOLO CUENTA LO QUE SE SOLAPA CON EL INCUMPLIMIENTO DE VERDAD. Un permiso
 *    de 2 a 4 de la tarde no perdona haber llegado a las 8:45. Se cruza la
 *    ventana del permiso con la ventana del incumplimiento y se perdona la
 *    intersección, ni un minuto más.
 *
 * ── 🔴 UNA SOLA REGLA, TRES COLUMNAS (16-sep-2026) ───────────────────────────
 *
 * Daniel, textual: *«El permiso perdona lo que se solape con la ventana, sea
 * tardanza, salida temprana o exceso de almuerzo. Una sola regla, tres
 * columnas.»* y *«permiso justificado se paga»*.
 *
 * 🩸 EL DEFECTO, medido contra producción el 16-sep-2026: este módulo solo
 * sabía perdonar tardanza de ENTRADA. Andrea Pérez (16) el 1-sep entró 08:04
 * —puntual— y su última marca es 12:07:32, con una Constancia de 12:00 a 17:00
 * que cubre exactamente lo que pasó. El sistema le descontaba **292,47 minutos
 * de salida temprana ($16,43)** y la pantalla le escribía «Permiso 0 min».
 * Briceida Montero (8) el 7-sep, lo mismo: **237,05 minutos ($12,92)**.
 *
 * La regla no cambió: se perdona la INTERSECCIÓN. Lo que cambió es que ahora
 * hay tres ventanas de incumplimiento en vez de una. Ver `VentanaIncumplimiento`.
 *
 * ── ⚠️ UNA JUSTIFICACIÓN SIN HORAS NO CAMBIA NADA ────────────────────────────
 *
 * Sigue siendo lo de siempre: el día entero justificado, sin descuento. Es lo
 * que hace que las 5 justificaciones vivas de producción —ninguna tiene horas—
 * se comporten EXACTAMENTE igual que ayer, y que este cambio salga sin mover un
 * centavo.
 *
 * ── 🔴 LAS HORAS SOLO VAN CON «CONSTANCIA» (11-sep-2026) ─────────────────────
 *
 * Daniel, textual: *«que se ponga rango de hora solamente en constancia,
 * porque no siempre es todo el día, sino unas horas»*. Una constancia (del
 * juzgado, de la escuela, de un trámite) cubre unas horas; una incapacidad, una
 * catástrofe, lo escolar y el trabajo de vendedor son de DÍA COMPLETO y el
 * formulario no ofrece horas para ellos. La regla vive en `motivoAdmiteHoras` y
 * la aplican las DOS puertas (el formulario y la ruta): un motivo sin horas
 * que llegue con horas se rechaza, no se guarda a medias.
 *
 * ⚠️ El MOTOR no mira el motivo: honra las horas que estén guardadas. Es a
 * propósito — lo que ya está en la base es una decisión tomada, y cambiarle el
 * valor a una fila vieja por su motivo sería mover un pago sin que nadie lo
 * pida. Hoy no hay ninguna fila con horas fuera de Constancia (medido: las
 * justificaciones vivas no tienen horas).
 * ────────────────────────────────────────────────────────────────────────── */

import { MOTIVO_CONSTANCIA } from "./motivos";

/** ¿Este motivo admite un rango de HORAS? Solo Constancia. */
export function motivoAdmiteHoras(motivo: string | null | undefined): boolean {
  return String(motivo ?? "").trim() === MOTIVO_CONSTANCIA;
}

/**
 * Las horas que VIAJAN al servidor para un motivo: las escritas si el motivo
 * las admite, vacías si no. Es lo que impide que un «de/hasta» tecleado con
 * Incapacidad y después cambiado a otro motivo se cuele en el guardado.
 */
export function horasParaGuardar(
  motivo: string | null | undefined,
  horaDesde: string | null | undefined,
  horaHasta: string | null | undefined,
): { horaDesde: string; horaHasta: string } {
  if (!motivoAdmiteHoras(motivo)) return { horaDesde: "", horaHasta: "" };
  return { horaDesde: String(horaDesde ?? "").trim(), horaHasta: String(horaHasta ?? "").trim() };
}

/** "HH:MM" o "HH:MM:SS" → segundos del día. `null` si no es una hora. */
export function horaASegundos(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] ?? 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

/** Segundos del día → "HH:MM", para mostrar. */
export function segundosAHora(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface VentanaPermiso {
  /** Segundos del día. */
  desdeSeg: number;
  hastaSeg: number;
}

/**
 * La ventana del permiso, o `null` si la justificación no trae horas.
 *
 * 🔑 LAS DOS HORAS VIAJAN JUNTAS. Con una sola no hay ventana que cruzar, así
 * que se devuelve `null` y la justificación se comporta como las de siempre —
 * el día entero—. Media ventana sería una regla a medias sobre un pago.
 */
export function ventanaDe(
  horaDesde: string | null | undefined,
  horaHasta: string | null | undefined,
): VentanaPermiso | null {
  const d = horaASegundos(horaDesde);
  const h = horaASegundos(horaHasta);
  if (d === null || h === null) return null;
  if (h <= d) return null;
  return { desdeSeg: d, hastaSeg: h };
}

/**
 * El BORDE de la ventana del incumplimiento que salió del reloj.
 *
 * El permiso se teclea en MINUTOS y el reloj mide en SEGUNDOS, así que el borde
 * donde la ventana del permiso se topa con una marcación real es el que se
 * estira para cubrir el minuto entero. Ver la nota del 27-ago-2026 más abajo.
 *
 * - `"fin"`  — la marca CIERRA el incumplimiento (llegó tarde: entró a las
 *   08:10:24; volvió del almuerzo a las 13:16:14).
 * - `"inicio"` — la marca ABRE el incumplimiento (se fue temprano: su última
 *   marca es 12:07:32 y el día terminaba a las 17:00).
 */
export type BordeDelReloj = "inicio" | "fin";

/**
 * La ventana de UN incumplimiento, en segundos del día.
 *
 * 🔴 LAS TRES COLUMNAS SE MIDEN CON LA MISMA REGLA (16-sep-2026). Daniel,
 * textual: *«El permiso perdona lo que se solape con la ventana, sea tardanza,
 * salida temprana o exceso de almuerzo. Una sola regla, tres columnas.»*
 *
 * | Columna           | Ventana                                               |
 * |-------------------|-------------------------------------------------------|
 * | Tardanza          | `[entrada programada, primera marca]`      → fin       |
 * | Salida temprana   | `[última marca, salida programada]`        → inicio    |
 * | Exceso de almuerzo| `[sale + almuerzo permitido, vuelve]`      → fin       |
 */
export interface VentanaIncumplimiento {
  desdeSeg: number;
  hastaSeg: number;
  bordeDelReloj: BordeDelReloj;
}

/**
 * Cuántos MINUTOS de ESTE incumplimiento perdona el permiso.
 *
 * Se perdona la INTERSECCIÓN de las dos ventanas, ni un minuto más, en minutos
 * con decimales (el módulo mide al segundo desde el 13-ago-2026).
 *
 * Devuelve 0 —nunca un negativo— cuando no hay solape, cuando no hay permiso, o
 * cuando no hubo incumplimiento que perdonar.
 */
export function minutosPerdonadosDe(
  ventana: VentanaPermiso | null,
  incumplimiento: VentanaIncumplimiento,
): number {
  if (!ventana) return 0;
  const { desdeSeg: abre, hastaSeg: cierra, bordeDelReloj } = incumplimiento;
  if (!Number.isFinite(abre) || !Number.isFinite(cierra)) return 0;
  if (cierra <= abre) return 0;

  // 🔴 SI LA MARCA CAE EN EL MISMO MINUTO QUE EL BORDE DEL PERMISO, SE PERDONA
  // ENTERA (27-ago-2026).
  //
  // 🩸 EL CASO REAL. El lunes 17 de agosto llovió y llegaron tarde diez
  // personas. A cada una le cargaron el permiso con el MINUTO de su marcación
  // —08:10, 08:18, 08:44— y a NUEVE DE DIEZ les siguió descontando, porque el
  // reloj mide al SEGUNDO y ellas habían entrado 08:10:24, 08:18:01, 08:44:06.
  // A Ballesta le quedó UN segundo afuera.
  //
  // El permiso se teclea en minutos y la marcación se mide en segundos: nadie
  // le va a acertar nunca. Y «hasta las 8:10» no significa «hasta el segundo 0
  // de las 8:10».
  //
  // 🔴 SE ESTIRA EL BORDE QUE MIRA A LA MARCA, Y SOLO ÉSE (16-sep-2026). En la
  // tardanza la marca cierra la ventana y el que se estira es el FINAL del
  // permiso —conducta de siempre, intacta—. En la salida temprana la marca la
  // ABRE (la persona se va 12:07:32 con permiso «desde las 12:00») y entonces
  // el que se estira es el PRINCIPIO. El borde que NO mira a una marca no se
  // corre: un permiso de 08:05 a 08:10 no perdona el atraso de 08:00 a 08:05.
  //
  // ⚠️ ACOTADO AL MISMO MINUTO, y por eso no vive en `ventanaDe`. Estirar la
  // ventana 59 s a secas le regalaba casi un minuto a CUALQUIER permiso —un
  // «de 8 a 10» pasaba a perdonar 120,98— y convertía una ventana de duración
  // cero (dos horas iguales, que es un tipeo) en un permiso de 59 segundos.
  // Los dos candados que ya existían lo cazaron.
  const estiraFin =
    bordeDelReloj === "fin" && Math.floor(ventana.hastaSeg / 60) === Math.floor(cierra / 60);
  const estiraInicio =
    bordeDelReloj === "inicio" && Math.floor(ventana.desdeSeg / 60) === Math.floor(abre / 60);

  const desde = estiraInicio ? abre : Math.max(ventana.desdeSeg, abre);
  const hasta = estiraFin ? cierra : Math.min(ventana.hastaSeg, cierra);
  return Math.max(0, (hasta - desde) / 60);
}

/**
 * Cuántos MINUTOS de atraso de ENTRADA perdona este permiso.
 *
 * `entradaSeg` es la hora a la que la persona TENÍA que entrar y `marcaSeg` la
 * hora a la que de verdad entró.
 *
 * 🔑 Es la tardanza vista por `minutosPerdonadosDe`, con el mismo resultado que
 * daba antes del 16-sep-2026. Se conserva con su firma porque la nombran los
 * candados de la lluvia del 17-ago y el de «solo Constancia».
 */
export function minutosPerdonados(
  ventana: VentanaPermiso | null,
  entradaSeg: number,
  marcaSeg: number,
): number {
  return minutosPerdonadosDe(ventana, {
    desdeSeg: entradaSeg, hastaSeg: marcaSeg, bordeDelReloj: "fin",
  });
}

/** Cómo se lee un permiso de horas, en pantalla y en el papel. Fuente única. */
export function textoPermiso(
  motivo: string,
  horaDesde: string | null | undefined,
  horaHasta: string | null | undefined,
): string {
  const v = ventanaDe(horaDesde, horaHasta);
  if (!v) return motivo;
  return `${motivo} — permiso de ${segundosAHora(v.desdeSeg)} a ${segundosAHora(v.hastaSeg)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 NADA CALLADO (16-sep-2026)
//
// Daniel, textual: *«La columna muestra los minutos reales y, al lado, cuánto
// se perdonó. Nada callado.»* y *«y si tuviese tardanza, deberia de salir en
// tardanza no callado»*.
//
// 🩸 Hasta hoy el perdón se restaba y el minuto DESAPARECÍA: la columna quedaba
// en «—» y el día se leía como si la persona hubiera llegado puntual y se
// hubiera ido a la hora. Encima el chip decía «Permiso 0 min» —Andrea Pérez, el
// 1-sep-2026, con un permiso que le cubría la tarde entera— porque solo sabía
// contar tardanza.
//
// El texto sale de ACÁ, no de un `.tsx`: la pantalla, el título y el Excel
// tienen que decir exactamente lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que un permiso perdonó en UN día, columna por columna. */
export interface PerdonDelDia {
  tardeMin: number;
  salidaTempranaMin: number;
  almuerzoMin: number;
}

export const PERDON_CERO: PerdonDelDia = { tardeMin: 0, salidaTempranaMin: 0, almuerzoMin: 0 };

/** Los tres, juntos. */
export function totalPerdonado(p: PerdonDelDia): number {
  return p.tardeMin + p.salidaTempranaMin + p.almuerzoMin;
}

/** El rango del permiso para el chip: «12:00–17:00». `null` sin ventana. */
export function rangoPermiso(
  horaDesde: string | null | undefined,
  horaHasta: string | null | undefined,
): string | null {
  const v = ventanaDe(horaDesde, horaHasta);
  if (!v) return null;
  return `${segundosAHora(v.desdeSeg)}–${segundosAHora(v.hastaSeg)}`;
}

/** Los minutos como se escriben en pantalla: sin decimales, redondeados. */
function min(n: number): string {
  return String(Math.round(n));
}

/**
 * Qué perdonó, en palabras y sin jerga:
 *   «perdona 292 min de salida temprana»
 *   «perdona 12 min de tardanza y 3 min de exceso de almuerzo»
 *   «no perdona minutos de este día»  ← cuando el permiso no se solapó con nada
 */
export function textoPerdon(p: PerdonDelDia): string {
  const partes = partesDelPerdon(p);
  if (partes.length === 0) return "no perdona minutos de este día";
  return `perdona ${enLista(partes)}`;
}

/**
 * 🔑 El orden es el del DÍA: primero la entrada, después el almuerzo y al final
 * la salida. Es el orden en que la persona vivió el día, y el mismo en la
 * pantalla, en el título y en el Excel.
 */
function partesDelPerdon(p: PerdonDelDia): string[] {
  const partes: string[] = [];
  if (p.tardeMin > 0) partes.push(`${min(p.tardeMin)} min de tardanza`);
  if (p.almuerzoMin > 0) partes.push(`${min(p.almuerzoMin)} min de exceso de almuerzo`);
  if (p.salidaTempranaMin > 0) partes.push(`${min(p.salidaTempranaMin)} min de salida temprana`);
  return partes;
}

function enLista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * La línea del resumen de una persona: qué perdonaron sus permisos en todo el
 * período. `null` cuando no perdonaron nada — no se dibuja un aviso vacío.
 */
export function textoPerdonDelPeriodo(p: PerdonDelDia): string | null {
  const partes = partesDelPerdon(p);
  if (partes.length === 0) return null;
  return `Los permisos de horas perdonaron ${enLista(partes)}. `
    + "Esos minutos ya NO se descuentan.";
}

/**
 * El chip del día: «Permiso 12:00–17:00 · perdona 292 min de salida temprana».
 *
 * Sin rango —no debería pasar: sin ventana no hay permiso— se dice «Permiso» a
 * secas antes que inventar un horario.
 */
export function etiquetaPermisoDelDia(rango: string | null, p: PerdonDelDia): string {
  return `Permiso${rango ? ` ${rango}` : ""} · ${textoPerdon(p)}`;
}

/**
 * El texto largo: el título de la pantalla y la celda del Excel.
 * `permiso` es lo que devuelve `textoPermiso` («Constancia — permiso de 12:00 a
 * 17:00»).
 */
export function textoPermisoDelDia(permiso: string, p: PerdonDelDia): string {
  return `${permiso} · ${textoPerdon(p)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `participacion.ts`, `seguros.ts` y `vigencia.ts`: en este
// proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
// semanas. Sin las columnas, TODO el módulo sigue funcionando —las
// justificaciones son de día entero, o sea como están hoy— y la pantalla dice
// qué archivo falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_PERMISO_HORAS = "20260825140000_asistencia_permiso_horas.sql";

/** Las columnas nuevas. Se nombran acá para que el `select` y la detección del
 *  error no se puedan separar. */
export const COLS_PERMISO_HORAS = ["hora_desde", "hora_hasta"] as const;

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existen las columnas"?
 *
 * ⚠️ El error tiene que NOMBRAR alguna de las dos. Tragarse cualquier error
 * convertiría un problema real —permisos, red, RLS— en una pantalla que miente
 * diciendo "falta la migración".
 */
export function esColumnaPermisoHorasFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!COLS_PERMISO_HORAS.some((c) => texto.includes(c))) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionPermisoHoras(): string {
  return (
    "Todavía no se pueden cargar permisos de horas: falta preparar la base de "
    + `datos. Pídele a Daniel que corra el archivo ${MIGRACION_PERMISO_HORAS} en `
    + "Supabase. Mientras tanto las justificaciones se cargan por día entero, "
    + "como hasta ahora."
  );
}
