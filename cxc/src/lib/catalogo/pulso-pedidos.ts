// ─────────────────────────────────────────────────────────────────────────────
// EL PULSO DE CADA MARCA — cuántos comprobantes van, cuánto suman y hace cuánto
// fue el último (22-sep-2026).
//
// 🩸 POR QUÉ EXISTE. La tarjeta del hub solo contaba productos. **Joybees
// llevaba 29 días sin un comprobante y nada en la pantalla lo decía.** Medido
// contra producción el 22-sep-2026, con los comprobantes VIVOS:
//
//     Tommy    44 · $326.686,00 · hace  3 días
//     Reebok   14 ·  $79.968,00 · hace 13 días
//     Calvin    6 ·  $17.658,00 · hace  8 días
//     Joybees   4 ·   $4.020,00 · hace 29 días
//
// 🔴 LA VENTANA ES LA DE LA LISTA: 90 DÍAS. No es un número nuevo — se importa
// de `comprobantes-ventana.ts`, que es el horizonte que este módulo ya usa para
// «reciente». Medido: hoy los 90 días dan EXACTAMENTE lo mismo que toda la
// historia (el comprobante vivo más viejo es del 4-jul-2026, 80 días), así que
// el corte no esconde nada y el día que esconda algo será porque de verdad pasó
// un trimestre. «Este mes» se descartó midiendo: dejaba a Joybees en CERO —
// justo la marca cuyo silencio hay que ver— y a Calvin en 4 de 6.
//
// 🔴 EL «ÚLTIMO» NO LLEVA VENTANA. Cuántos y cuánto son de los últimos 90 días;
// «hace cuánto fue el último» es el último DE VERDAD. Si una marca pasara medio
// año sin vender, la ventana la dejaría en cero y con la ventana encima se
// perdería el número que más dice.
//
// ⚠️ SON COMPROBANTES, NO SOLO PEDIDOS. Se cuenta todo lo vivo de la tabla de
// la marca —pedido, cotización y borrador—, que es de donde salen los números de
// arriba (Reebok son 13 confirmados + 1 borrador) y es la misma palabra del
// botón que está debajo, desde el 6-sep-2026.
//
// ⚠️ LOS PEDIDOS DEL LINK SIN CONVERTIR NO ENTRAN (hoy 5, todos de Reebok). La
// lista de Comprobantes sí los muestra, pero su total se RECALCULA desde los
// renglones porque el `total` guardado quedó subvaluado en los viejos: sumarlo
// acá pondría plata equivocada en la pantalla. Un carrito que nadie confirmó
// tampoco es pulso de venta.
//
// ⚠️ LOS BORRADOS NO CUENTAN (`deleted`). Ayer se borraron 5 por $32.208.
//
// Módulo PURO: recibe el «hoy» por parámetro, nunca lo pregunta. El «hoy» que
// le llega es SIEMPRE el de Panamá (`hoyPanama`), nunca el del navegador ni el
// del servidor, que corre en UTC.
// ─────────────────────────────────────────────────────────────────────────────

import { DIAS_VENTANA_COMPROBANTES } from "@/lib/catalogo/comprobantes-ventana";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { fmt } from "@/lib/format";

/**
 * Cuántos días mira el pulso. 🔴 ES LA VENTANA DE LA LISTA, importada: un
 * segundo número acá y las dos pantallas empezarían a contar distinto.
 */
export const DIAS_PULSO = DIAS_VENTANA_COMPROBANTES;

/** El pulso de UNA marca. */
export interface PulsoMarca {
  /** Comprobantes vivos de los últimos `DIAS_PULSO` días. */
  comprobantes: number;
  /** Cuánto suman esos comprobantes. */
  monto: number;
  /**
   * Días desde el último comprobante vivo, SIN ventana.
   * `null` = esta marca no tiene ni uno en toda su historia.
   */
  diasDesdeElUltimo: number | null;
}

export type PulsoDelHub = Record<string, PulsoMarca>;

/** Lo mínimo que el respaldo necesita leer de una fila. */
export interface FilaDeComprobante {
  created_at: string;
  total: number | string | null;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Días enteros entre dos fechas YYYY-MM-DD.
 *
 * Se trabaja con FECHAS de Panamá, no con instantes: «hace 29 días» es una
 * cuenta de calendario que la persona puede rehacer mirando la fecha del
 * comprobante. Un `hasta` anterior al `desde` (reloj corrido) da 0, nunca un
 * negativo en pantalla.
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / MS_POR_DIA));
}

/**
 * El pulso a partir de las filas — el camino de respaldo del servidor.
 *
 * `hoy` es YYYY-MM-DD en Panamá. Las fechas de las filas se pasan a la fecha de
 * Panamá con `fechaPanamaDe`, la misma conversión de UTC−5 fijo que usa el SQL
 * (`at time zone 'America/Panama'`).
 */
export function resumirPulso(filas: FilaDeComprobante[], hoy: string): PulsoMarca {
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - DIAS_PULSO * MS_POR_DIA)
    .toISOString()
    .slice(0, 10);

  let comprobantes = 0;
  let monto = 0;
  let ultimo: string | null = null;

  for (const f of filas) {
    if (!f.created_at) continue;
    const fecha = fechaPanamaDe(f.created_at);
    if (!ultimo || fecha > ultimo) ultimo = fecha;
    if (fecha >= desde) {
      comprobantes += 1;
      monto += Number(f.total) || 0;
    }
  }

  return {
    comprobantes,
    monto,
    diasDesdeElUltimo: ultimo ? diasEntre(ultimo, hoy) : null,
  };
}

/**
 * La línea de la tarjeta.
 *
 * 🔴 NUNCA «$0.00» EN GRANDE. Una marca sin comprobantes en la ventana dice qué
 * pasó con palabras, no con un cero — la misma regla de la ficha del cliente.
 * Y una marca que nunca tuvo uno tampoco inventa «hace 0 días».
 */
export function textoPulso(p: PulsoMarca): string {
  if (p.comprobantes === 0) {
    if (p.diasDesdeElUltimo === null) return "Todavía sin comprobantes";
    return `Sin comprobantes en ${DIAS_PULSO} días`;
  }
  const cuantos = `${p.comprobantes} comprobante${p.comprobantes === 1 ? "" : "s"}`;
  const plata = `$${fmt(p.monto)}`;
  const ultimo =
    p.diasDesdeElUltimo === null
      ? null
      : p.diasDesdeElUltimo === 0
        ? "último hoy"
        : `último hace ${p.diasDesdeElUltimo} día${p.diasDesdeElUltimo === 1 ? "" : "s"}`;
  return [cuantos, plata, ultimo].filter(Boolean).join(" · ");
}
