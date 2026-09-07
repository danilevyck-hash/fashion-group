// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LISTA ABRE EN EL MES QUE TIENE PEDIDOS, Y EL ENCABEZADO SE ESCRIBE BIEN
// (6-sep-2026)
//
// 🩸 JOYBEES ABRÍA CON LA PANTALLA VACÍA. El mes que se abría solo era el del
// CALENDARIO (`k === mesActual`), no el que tuviera comprobantes. Medido el
// 7-sep-2026: Joybees tiene 4 pedidos vivos y el más nuevo es del **24-ago**;
// en septiembre la pantalla mostraba **tres encabezados de mes y cero filas**, y
// había que adivinar que se tocaban. Ahora se abre el mes MÁS RECIENTE CON
// COMPROBANTES, que en una lista ordenada por fecha desc es siempre el primero.
//
// 🩸 Y EL ENCABEZADO DECÍA «Julio De 2026». La `D` mayúscula venía de la clase
// `capitalize` de CSS, que capitaliza CADA palabra —y en español el mes va en
// minúscula y el «de» también—. Se capitaliza SOLO la primera letra, y se hace
// en el texto, no en el estilo.
//
// Módulo PURO: recibe las fechas, nunca lee el reloj.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila mínima: lo único que la agrupación por mes necesita. */
export interface FilaConMes {
  created_at: string;
}

/** La llave del grupo: `2026-07`. Fecha local, igual que la que se muestra. */
export function mesKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin-fecha";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Solo la PRIMERA letra en mayúscula: «Julio de 2026», nunca «Julio De 2026». */
export function conMayusculaInicial(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** El encabezado del grupo: «Julio de 2026». */
export function mesLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return conMayusculaInicial(
    d.toLocaleDateString("es-PA", { month: "long", year: "numeric" }),
  );
}

/** Un grupo de la lista, ya armado. */
export interface GrupoMes<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Agrupa por mes conservando el orden en que llegan las filas (el feed viene
 * por fecha desc, así que los grupos salen del más nuevo al más viejo).
 */
export function agruparPorMes<T extends FilaConMes>(filas: readonly T[]): GrupoMes<T>[] {
  const grupos: GrupoMes<T>[] = [];
  for (const p of filas) {
    const k = mesKey(p.created_at);
    const last = grupos[grupos.length - 1];
    if (last && last.key === k) last.items.push(p);
    else grupos.push({ key: k, label: mesLabel(p.created_at), items: [p] });
  }
  return grupos;
}

/**
 * 🔴 El mes que abre por defecto: el MÁS RECIENTE CON COMPROBANTES.
 *
 * No es «el mes de hoy»: en una marca que no vendió este mes, «el mes de hoy»
 * no es ningún grupo y la pantalla abre vacía (el caso Joybees). `null` cuando
 * no hay ni un grupo — ahí la pantalla ya muestra su vacío.
 */
export function mesQueAbre<T>(grupos: readonly GrupoMes<T>[]): string | null {
  return grupos.length > 0 ? grupos[0].key : null;
}
