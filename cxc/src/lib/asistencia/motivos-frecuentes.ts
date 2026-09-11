/* ─────────────────────────────────────────────────────────────────────────────
 * LOS MOTIVOS MÁS USADOS AL CORREGIR UNA HORA — el motor, PURO.
 *
 * Daniel, textual (11-sep-2026): *«el porqué se corrige debe de ser obligatorio
 * y campo libre con opciones rápidas de las más usadas (autocrear a medida de
 * tiempo poniendo las más usadas y eliminando si una no se usa, empezar
 * vacíos)»*, y *«máximo 4»*.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 *   · Se miran los motivos GUARDADOS en `asistencia_correcciones` (las anuladas
 *     también: un motivo escrito es un motivo usado, deshacer la corrección no
 *     lo des-escribe) de los ÚLTIMOS 90 DÍAS.
 *   · Se agrupan por su CLAVE: minúsculas, sin acentos, sin bordes y con un solo
 *     espacio entre palabras. «No marcó salida» y «no marco salida» son uno.
 *   · Entran los que tienen 2 O MÁS usos; se ofrecen los 4 más usados.
 *   · Se muestra la GRAFÍA MÁS RECIENTE de cada grupo — la última vez que
 *     alguien lo escribió es cómo lo escribe hoy.
 *   · Sin historia, NINGÚN botón. «Empezar vacíos» — y un motivo que deja de
 *     usarse 90 días sale solo.
 *
 * 🔴 NINGUNA LISTA ESCRITA A MANO. Los botones nacen de lo que la gente
 * escribe; el campo libre sigue siendo lo que se guarda.
 *
 * Medido el 11-sep-2026 contra producción: 8 correcciones, todas dentro de los
 * 90 días; con esta regla salen TRES botones («No marco salida» 2× · «Boda de
 * Daniel» 2× · «ENFERMEDAD» 2×) y quedan fuera dos sueltos («Mensajería de
 * Daniel», «No marco la salida» — que con un artículo de diferencia es otra
 * clave, a propósito: nada se ata por parecido).
 * ────────────────────────────────────────────────────────────────────────── */

/** Cuántos días hacia atrás se miran. */
export const VENTANA_MOTIVOS_DIAS = 90;
/** Cuántos botones como máximo. Daniel: «máximo 4». */
export const MAX_MOTIVOS_FRECUENTES = 4;
/** Con un solo uso no es «frecuente»: hace falta que se repita. */
export const MIN_USOS_MOTIVO = 2;

export interface MotivoGuardado {
  motivo: string;
  /** ISO de cuándo se escribió (`creada_en`). */
  creadaEn: string;
}

/**
 * La clave con la que dos grafías cuentan como el mismo motivo: minúsculas,
 * sin acentos, sin bordes, un solo espacio entre palabras. Igualdad EXACTA
 * sobre eso — nunca por parecido.
 */
export function claveMotivo(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** El primer día (YYYY-MM-DD) que entra en la ventana, contando desde `hoy`. */
export function desdeDeLaVentana(hoy: string, dias = VENTANA_MOTIVOS_DIAS): string {
  const t = Date.parse(`${hoy}T00:00:00Z`);
  return new Date(t - dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Los motivos que se ofrecen como botón, en orden: más usado primero y, a
 * igual uso, el escrito más recientemente. Cada uno con su grafía más reciente.
 */
export function motivosFrecuentes(
  filas: readonly MotivoGuardado[],
  hoy: string,
  opts: { dias?: number; maximo?: number; minUsos?: number } = {},
): string[] {
  const dias = opts.dias ?? VENTANA_MOTIVOS_DIAS;
  const maximo = opts.maximo ?? MAX_MOTIVOS_FRECUENTES;
  const minUsos = opts.minUsos ?? MIN_USOS_MOTIVO;
  const desde = desdeDeLaVentana(hoy, dias);

  const grupos = new Map<string, { usos: number; ultimo: string; grafia: string }>();
  for (const f of filas) {
    const dia = String(f.creadaEn ?? "").slice(0, 10);
    if (!dia || dia < desde) continue;
    const clave = claveMotivo(f.motivo);
    if (!clave) continue;
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, { usos: 1, ultimo: f.creadaEn, grafia: String(f.motivo).trim() });
    } else {
      g.usos += 1;
      if (f.creadaEn > g.ultimo) {
        g.ultimo = f.creadaEn;
        g.grafia = String(f.motivo).trim();
      }
    }
  }

  return [...grupos.values()]
    .filter((g) => g.usos >= minUsos)
    .sort((a, b) => b.usos - a.usos || b.ultimo.localeCompare(a.ultimo))
    .slice(0, maximo)
    .map((g) => g.grafia);
}
