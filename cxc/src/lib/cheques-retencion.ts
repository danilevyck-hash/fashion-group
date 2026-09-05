/**
 * RETENCIÓN DE CHEQUES DEPOSITADOS — **módulo PURO** (sin base, sin reloj: la
 * fecha de hoy entra por parámetro).
 *
 * ── LA REGLA (5-sep-2026) ────────────────────────────────────────────────────
 *
 * 🔴 **A los 365 días, un cheque depositado se va solo.** Un cheque cobrado hace
 * más de un año no es información viva: es historia que ya está en el banco y en
 * la contabilidad. Con la lista nueva —una sola, sin pestañas— lo depositado ya
 * solo aparece al BUSCARLO; a partir del año, ni eso.
 *
 * 🔴 **Se va con SOFT DELETE (`deleted = true`), nunca con un DELETE.** Es la
 * regla de la casa y acá pesa doble: si algún día hay que probar que un cheque
 * se cobró, la fila tiene que seguir estando. Lo que se pierde es la vista, no
 * el dato — y el respaldo diario se lo lleva igual (`cheques` está adentro).
 *
 * ── DE QUÉ FECHA SE CUENTAN LOS 365 ──────────────────────────────────────────
 *
 * De **cuándo se depositó** (`fecha_depositado`), no de cuándo vencía: un cheque
 * puede depositarse tarde, y contar desde el vencimiento lo haría desaparecer
 * antes de tiempo. Sin `fecha_depositado` —hay filas viejas que no lo tienen— se
 * cae a `fecha_deposito`, que es lo más cercano que existe; nunca se asume «hoy»,
 * que dejaría vivo para siempre a un cheque sin esa fecha.
 *
 * ── DÓNDE CORRE, Y POR QUÉ NO ES UN CRON NUEVO ───────────────────────────────
 *
 * Dentro de **`cheques-alert`** (9:00 a.m. Panamá), que ya es el cron del
 * módulo, ya toca la tabla `cheques` y a partir de hoy ya escribe en ella
 * (`aviso_vencido_en`). Un cron nuevo habría sido una entrada más en
 * `vercel.json` —hoy son 82 de un tope de 100— y otra biyección que mantener,
 * para hacer un `UPDATE` de una vez al día sobre 19 filas.
 *
 * ⚠️ Consecuencia escrita: `cheques-alert` **no corre sábado ni domingo**, así
 * que la limpieza tampoco. Con un umbral de 365 días, correr de lunes a viernes
 * es exactamente igual de bueno.
 */

import { sumarDias } from "@/lib/cheques-aviso-ventana";

/** Un año. Se nombra una sola vez para que la consulta, el aviso y el candado
 *  no puedan discrepar. */
export const RETENCION_DEPOSITADOS_DIAS = 365;

/**
 * La fecha límite: todo cheque depositado en esta fecha o ANTES se retira.
 * Contada hacia atrás desde hoy, en fecha de Panamá.
 */
export function corteRetencion(hoy: string): string {
  return sumarDias(hoy, -RETENCION_DEPOSITADOS_DIAS);
}

export interface ChequeRetencion {
  id: string;
  estado: string;
  deleted?: boolean | null;
  fecha_deposito: string;
  fecha_depositado?: string | null;
}

/** La fecha desde la que se cuenta. Ver el encabezado. */
export function fechaDeCorteDe(c: ChequeRetencion): string {
  return c.fecha_depositado || c.fecha_deposito;
}

/**
 * Cuáles se retiran hoy. Devuelve los IDs, no las filas: es lo único que la
 * escritura necesita, y una lista de ids no se puede confundir con «guardá esto».
 *
 * 🔴 **SOLO los depositados.** Un cheque pendiente, vencido o rebotado se queda
 * para siempre: es plata que todavía no entró.
 */
export function chequesARetirar(cheques: ChequeRetencion[], hoy: string): string[] {
  const corte = corteRetencion(hoy);
  return cheques
    .filter((c) => !c.deleted && c.estado === "depositado" && fechaDeCorteDe(c) <= corte)
    .map((c) => c.id);
}
