/**
 * LA AGENDA — una sola lista con cheques y recordatorios juntos, agrupada por
 * CUÁNDO. **Módulo PURO**: sin base, sin React y sin `new Date()` (la fecha de
 * hoy entra por parámetro, que es la regla de la casa).
 *
 * ── QUÉ REEMPLAZA (5-sep-2026) ───────────────────────────────────────────────
 *
 * Hasta hoy el módulo tenía **8 pestañas**: `pendiente · depositado · vencido ·
 * rebotado · vencen_hoy · vencen_manana · vencen_semana · recordatorios`. Las
 * ocho se van y queda UNA lista.
 *
 * 🔑 **La clave del rediseño: «vencido», «vencen hoy», «vencen mañana» y
 * «vencen esta semana» NUNCA fueron estados — son CUÁNDO.** Cuatro pestañas
 * para decir cuatro veces lo mismo que una fecha ya dice. Convertidos en grupos
 * de la lista, la misma información se ve de una sola pasada y sin elegir nada.
 *
 * Los grupos, en orden:
 *
 *   Vencido (rojo, arriba) · Hoy · Esta semana · Después · Se repiten
 *
 * ── LO QUE SE VE Y LO QUE NO ─────────────────────────────────────────────────
 *
 * 🔴 **La lista muestra solo lo ABIERTO**: cheques sin depositar (vencidos
 * incluidos), rebotados, y recordatorios que todavía no se mandaron.
 *
 * 🔴 **Lo depositado NO está en la lista, pero aparece al BUSCARLO** con la
 * lupa (por cliente o por número de cheque). El buscador es la única puerta a
 * lo depositado, y por eso `buscar()` mira TODO — incluido lo que la lista
 * esconde. Un buscador que respetara el filtro de la lista sería un buscador
 * que no encuentra.
 *
 * 🔴 **Un cheque REBOTADO se queda en la lista** hasta que se redeposite o se
 * borre. «Rebotado» dejó de ser pestaña (cero en toda la historia del módulo):
 * es una marca roja en la fila.
 *
 * 🔴 **Ningún total sumado.** Daniel eligió explícitamente que el módulo no
 * muestre ninguna suma: se fueron las tres tarjetas de arriba y no se
 * reemplazaron por nada. Los montos POR FILA se quedan, y el encabezado de
 * grupo dice CUÁNTOS son — nunca cuánto suman. Este módulo no exporta ni una
 * función que sume montos, y hay candado que lo exige.
 *
 * 🔴 **Un recordatorio que se repite se muestra en UNA sola fila**, en el grupo
 * «Se repiten», con su «cada cuánto» y su «hasta» — nunca una fila por
 * ocurrencia. Con «Cada día» sin fecha de fin, una fila por ocurrencia sería
 * una lista infinita.
 */

import type { Recordatorio } from "./recordatorio";
import { proximaOcurrencia, seRepite } from "./recordatorio";
import { getEndOfWeek } from "@/lib/cheques-dates";

// ─── Lo mínimo que la agenda necesita saber de un cheque ─────────────────────
// Se declara acá y NO se importa el tipo de la pantalla: este módulo tiene que
// poder testearse sin montar React.

export interface ChequeAgenda {
  id: string;
  cliente: string;
  empresa: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  estado: string;
  fecha_depositado?: string | null;
  motivo_rebote?: string | null;
}

/**
 * El estado que se VE, que no es el de la base: un `pendiente` con la fecha
 * pasada se ve como `vencido`. Es la misma cuenta que hacía la pantalla vieja,
 * mudada acá para que la lista, el calendario y los candados no la repitan cada
 * uno por su lado.
 */
export function estadoVisible(c: ChequeAgenda, hoy: string): string {
  if (c.estado === "pendiente" && c.fecha_deposito < hoy) return "vencido";
  return c.estado;
}

/** ¿Este cheque sigue ABIERTO? Todo lo que no está depositado. */
export function chequeAbierto(c: ChequeAgenda): boolean {
  return c.estado !== "depositado";
}

// ─── Los grupos ──────────────────────────────────────────────────────────────

export const GRUPOS_AGENDA = ["vencido", "hoy", "esta_semana", "despues", "se_repiten"] as const;
export type GrupoAgenda = (typeof GRUPOS_AGENDA)[number];

/** El rótulo que se lee. Español simple, tuteo, sin jerga. */
export const ETIQUETA_GRUPO: Record<GrupoAgenda, string> = {
  vencido: "Vencido",
  hoy: "Hoy",
  esta_semana: "Esta semana",
  despues: "Después",
  se_repiten: "Se repiten",
};

/** El color del encabezado. Solo «Vencido» va en rojo — el resto es neutro. */
export const COLOR_GRUPO: Record<GrupoAgenda, string> = {
  vencido: "text-red-600",
  hoy: "text-amber-600",
  esta_semana: "text-gray-700",
  despues: "text-gray-700",
  se_repiten: "text-gray-500",
};

export type ItemAgenda =
  | { tipo: "cheque"; id: string; fecha: string; cheque: ChequeAgenda; ve: string }
  | { tipo: "recordatorio"; id: string; fecha: string | null; rec: Recordatorio };

export interface GrupoDeAgenda {
  key: GrupoAgenda;
  label: string;
  color: string;
  items: ItemAgenda[];
}

/**
 * En qué grupo cae una fecha suelta.
 *
 * «Esta semana» es hasta el DOMINGO de la semana calendario (`getEndOfWeek`),
 * el mismo corte que ya usaban los cheques — no «los próximos 7 días»: dos
 * definiciones de semana en la misma pantalla se separan solas.
 */
export function grupoDeFecha(fecha: string, hoy: string): GrupoAgenda {
  if (fecha < hoy) return "vencido";
  if (fecha === hoy) return "hoy";
  if (fecha <= getEndOfWeek(hoy)) return "esta_semana";
  return "despues";
}

/**
 * La lista completa, ya agrupada. Devuelve SOLO los grupos con algo adentro —
 * un encabezado vacío es una pregunta sin respuesta.
 *
 * Dentro de cada grupo el orden es por fecha y, empatados, el cheque antes que
 * el recordatorio: la plata primero. Los que no tienen fecha (un recordatorio de
 * una sola vez que ya pasó y nadie borró) van al final de «Vencido».
 */
export function agruparAgenda(
  cheques: ChequeAgenda[],
  recordatorios: Recordatorio[],
  hoy: string,
): GrupoDeAgenda[] {
  const porGrupo = new Map<GrupoAgenda, ItemAgenda[]>();
  const meter = (g: GrupoAgenda, item: ItemAgenda) => {
    const arr = porGrupo.get(g);
    if (arr) arr.push(item);
    else porGrupo.set(g, [item]);
  };

  for (const c of cheques) {
    if (!chequeAbierto(c)) continue; // depositado: solo se llega por el buscador
    meter(grupoDeFecha(c.fecha_deposito, hoy), {
      tipo: "cheque",
      id: c.id,
      fecha: c.fecha_deposito,
      cheque: c,
      ve: estadoVisible(c, hoy),
    });
  }

  for (const rec of recordatorios) {
    // 🔴 UNA sola fila por recordatorio que se repite, en su propio grupo.
    if (seRepite(rec)) {
      // Uno que ya se pasó de su «hasta» no vuelve a sonar: sale de la lista.
      if (proximaOcurrencia(rec, hoy) === null) continue;
      meter("se_repiten", { tipo: "recordatorio", id: rec.id, fecha: null, rec });
      continue;
    }
    // De una sola vez: los que ya se mandaron NO se listan (Daniel: no se
    // marcan como hechos, se mandan y ya). El del día de hoy sigue a la vista.
    if (rec.fecha < hoy) continue;
    meter(grupoDeFecha(rec.fecha, hoy), {
      tipo: "recordatorio",
      id: rec.id,
      fecha: rec.fecha,
      rec,
    });
  }

  const peso = (i: ItemAgenda) => (i.tipo === "cheque" ? 0 : 1);
  return GRUPOS_AGENDA.filter((k) => (porGrupo.get(k)?.length ?? 0) > 0).map((key) => ({
    key,
    label: ETIQUETA_GRUPO[key],
    color: COLOR_GRUPO[key],
    items: (porGrupo.get(key) as ItemAgenda[]).slice().sort((a, b) => {
      const fa = a.fecha ?? "9999-12-31";
      const fb = b.fecha ?? "9999-12-31";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return peso(a) - peso(b);
    }),
  }));
}

// ─── El buscador: la ÚNICA puerta a lo depositado ────────────────────────────

/** Normaliza para comparar: sin mayúsculas, sin espacios de sobra. */
function llave(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Busca por CLIENTE o por NÚMERO DE CHEQUE, y mira TODO — incluido lo
 * depositado, que la lista esconde. Es lo que hace que un cheque ya cobrado se
 * pueda volver a encontrar sin resucitar la pestaña «Depositados».
 *
 * Los recordatorios entran por su TEXTO y por su cliente: quien busca «alquiler»
 * espera encontrar el recordatorio del alquiler.
 */
export function buscarEnAgenda(
  cheques: ChequeAgenda[],
  recordatorios: Recordatorio[],
  termino: string,
  hoy: string,
): ItemAgenda[] {
  const q = llave(termino);
  if (!q) return [];

  const salida: ItemAgenda[] = [];
  for (const c of cheques) {
    if (llave(c.cliente).includes(q) || llave(c.numero_cheque).includes(q)) {
      salida.push({
        tipo: "cheque",
        id: c.id,
        fecha: c.fecha_deposito,
        cheque: c,
        ve: estadoVisible(c, hoy),
      });
    }
  }
  for (const rec of recordatorios) {
    if (llave(rec.texto).includes(q) || llave(rec.cliente).includes(q)) {
      salida.push({ tipo: "recordatorio", id: rec.id, fecha: rec.fecha, rec });
    }
  }
  // Lo más reciente primero: al buscar un cheque viejo se busca uno concreto,
  // pero al buscar un cliente se quiere ver lo último que pasó con él.
  return salida.sort((a, b) => ((a.fecha ?? "") > (b.fecha ?? "") ? -1 : 1));
}
