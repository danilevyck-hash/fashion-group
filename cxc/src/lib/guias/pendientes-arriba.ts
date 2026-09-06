// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ESPERA ALGO VA ARRIBA, Y SE DICE EN UNA LÍNEA (5-sep-2026).
//
// Medido contra producción el 5-sep-2026: de las **222 guías vivas, 221 están
// «Completada» y UNA está «Pendiente Bodega»** — GT-239, del 1-sep, cinco días
// esperando. Esa una es la única sobre la que hay algo que hacer, y estaba
// enterrada entre 221 iguales.
//
// 🔴 SI NO HAY NINGUNA, LA LÍNEA NO APARECE. Nada de un «0 guías sin despachar»:
// un cero grande se lee como dato roto, y la regla de la casa —la misma del
// resumen de fotos, Daniel: *«solo dime si me faltan fotos, no si no me faltan
// fotos»*— es callar cuando no hay nada que decir.
//
// 🔑 LOS DÍAS SE CUENTAN CON EL MISMO MOTOR DEL AVISO POR TELEGRAM
// (`guiasVencidas`, `pendientes-aviso.ts`): calendario de Panamá, umbral 0 para
// verlas todas. Dos cuentas distintas de «hace cuántos días» terminarían
// diciendo cosas distintas sobre la misma guía.
//
// Módulo PURO: recibe el ahora por parámetro. Nada de `new Date()` adentro.
// ─────────────────────────────────────────────────────────────────────────────

import { guiasVencidas } from "./pendientes-aviso";

export interface GuiaDeLaLista {
  id: string;
  numero: number;
  fecha?: string | null;
  estado?: string | null;
}

/** Lo que la lista pinta arriba, o `null` cuando no hay nada que despachar. */
export interface ResumenPendientes {
  texto: string;
  /** La más vieja: es a donde lleva la línea. */
  guiaId: string;
}

function etiquetaDias(dias: number): string {
  if (dias <= 0) return "hoy";
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/**
 * Las pendientes, de la MÁS VIEJA a la más nueva, y el resto en su orden.
 *
 * ⚠️ Una pendiente sin fecha no se puede ordenar por antigüedad, así que va
 * primero: si algo perdió su fecha, es lo que más hay que mirar.
 */
export function separarPendientes<T extends GuiaDeLaLista>(
  guias: readonly T[],
  esPendiente: (g: T) => boolean,
): { pendientes: T[]; resto: T[] } {
  const pendientes: T[] = [];
  const resto: T[] = [];
  for (const g of guias) (esPendiente(g) ? pendientes : resto).push(g);
  pendientes.sort((a, b) => {
    const fa = String(a.fecha ?? "");
    const fb = String(b.fecha ?? "");
    if (fa === fb) return a.numero - b.numero;
    if (!fa) return -1;
    if (!fb) return 1;
    return fa < fb ? -1 : 1;
  });
  return { pendientes, resto };
}

/**
 * La línea de arriba: «1 guía sin despachar — hace 5 días».
 *
 * Con varias, dice cuántas son y la antigüedad de la MÁS VIEJA, que es la que
 * mide el problema. Sin fecha legible no se inventa una antigüedad: se dice
 * cuántas son y nada más.
 */
export function resumenPendientes<T extends GuiaDeLaLista>(
  pendientes: readonly T[],
  ahora: Date,
): ResumenPendientes | null {
  if (pendientes.length === 0) return null;
  const vencidas = guiasVencidas(pendientes as readonly (T & { fecha: string | null })[], ahora, 0);
  const masVieja = vencidas[0];
  const cuantas = pendientes.length;
  const cabeza = cuantas === 1 ? "1 guía sin despachar" : `${cuantas} guías sin despachar`;
  if (!masVieja) return { texto: cabeza, guiaId: pendientes[0].id };
  const cola = cuantas === 1 ? etiquetaDias(masVieja.dias) : `la más vieja, ${etiquetaDias(masVieja.dias)}`;
  const id = (pendientes.find((g) => g.numero === masVieja.numero) ?? pendientes[0]).id;
  return { texto: `${cabeza} — ${cola}`, guiaId: id };
}
