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
 * 2. SOLO CUENTA LO QUE SE SOLAPA CON EL ATRASO DE VERDAD. Un permiso de 2 a 4
 *    de la tarde no perdona haber llegado a las 8:45. Se cruza la ventana del
 *    permiso con la ventana del atraso —de la hora de entrada a la primera
 *    marca— y se perdona la intersección, ni un minuto más.
 *
 * ── ⚠️ UNA JUSTIFICACIÓN SIN HORAS NO CAMBIA NADA ────────────────────────────
 *
 * Sigue siendo lo de siempre: el día entero justificado, sin descuento. Es lo
 * que hace que las 5 justificaciones vivas de producción —ninguna tiene horas—
 * se comporten EXACTAMENTE igual que ayer, y que este cambio salga sin mover un
 * centavo.
 * ────────────────────────────────────────────────────────────────────────── */

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
 * Cuántos MINUTOS de atraso perdona este permiso.
 *
 * `entradaSeg` es la hora a la que la persona TENÍA que entrar y `marcaSeg` la
 * hora a la que de verdad entró. Se perdona la intersección de las dos
 * ventanas, en minutos, con decimales (el módulo mide al segundo desde el
 * 13-ago-2026).
 *
 * Devuelve 0 —nunca un negativo— cuando no hay solape, cuando no hay permiso, o
 * cuando la persona llegó a tiempo.
 */
export function minutosPerdonados(
  ventana: VentanaPermiso | null,
  entradaSeg: number,
  marcaSeg: number,
): number {
  if (!ventana) return 0;
  if (!Number.isFinite(entradaSeg) || !Number.isFinite(marcaSeg)) return 0;
  if (marcaSeg <= entradaSeg) return 0;
  const desde = Math.max(ventana.desdeSeg, entradaSeg);

  // 🔴 SI LA MARCA CAE EN EL MISMO MINUTO QUE EL FINAL DEL PERMISO, SE PERDONA
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
  // ⚠️ ACOTADO AL MISMO MINUTO, y por eso no vive en `ventanaDe`. Estirar la
  // ventana 59 s a secas le regalaba casi un minuto a CUALQUIER permiso —un
  // «de 8 a 10» pasaba a perdonar 120,98— y convertía una ventana de duración
  // cero (dos horas iguales, que es un tipeo) en un permiso de 59 segundos.
  // Los dos candados que ya existían lo cazaron.
  const mismoMinuto = Math.floor(ventana.hastaSeg / 60) === Math.floor(marcaSeg / 60);
  const hasta = mismoMinuto ? marcaSeg : Math.min(ventana.hastaSeg, marcaSeg);
  return Math.max(0, (hasta - desde) / 60);
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
