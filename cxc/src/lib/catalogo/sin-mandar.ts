// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS PEDIDOS QUE NO LLEGARON A SWITCH SE NOTAN (6-sep-2026)
//
// La fila SIEMPRE dijo que un pedido no salió («No se ha mandado a Switch»,
// `TEXTO_NO_ENVIADO`), pero lo decía en gris chiquito, con el mismo peso que
// todo lo demás, sin cuántos días llevaba así y sin forma de filtrarlos. O sea:
// el dato estaba y no se veía.
//
// Medido contra producción el 7-sep-2026 — de 56 comprobantes vivos, **7 no han
// salido a Switch, y DOS de ellos están CONFIRMADOS**:
//
//   · PED-004 · Reebok · CITY MALL PASO CANOA · $420,00 · hace 65 días
//   · CKP-020 · Calvin · HJsn ·               $1.284,00 · hace 23 días
//
// Los dos se quedaron trabados por lo mismo: no tienen cliente de Switch
// elegido, así que el botón de mandar les contesta «falta elegir el cliente» y
// ahí quedan. Los otros 5 son BORRADORES (1 Reebok · 3 Tommy · 1 Calvin), y un
// borrador todavía no es un pedido: tiene su propio chip y no entra acá.
//
// 🔴 EL CHIP CUENTA LOS CONFIRMADOS, NO LOS BORRADORES. Si contara los 7, el
// chip diría 7 donde hay 2 cosas que arreglar, y un aviso que exagera se
// aprende a ignorar.
//
// 🔴 Y NO ENTRA EL PEDIDO DEL LINK SIN CONVERTIR (`fuente = "publicos"`): ése
// todavía no existe como pedido de la casa —no tiene ni número propio— y su
// abandono se trata aparte, con la ventana de 30 días (`comprobantes-ventana`).
//
// Módulo PURO: recibe el día de PANAMÁ por parámetro. Contar días con el reloj
// del navegador hace que el mismo pedido diga 64 o 65 según la hora.
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde } from "@/lib/clientes/ficha";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { esBorrador, type NumerosDePedido } from "./numeros-pedido";

/** El rótulo del chip. Dice el estado, no el mecanismo. */
export const CHIP_SIN_MANDAR = "Sin mandar";

/** Lo mínimo que hace falta para saber si una fila está trabada. */
export interface FilaSinMandar extends NumerosDePedido {
  created_at?: string;
}

/**
 * 🔴 ¿Este comprobante se quedó sin llegar a Switch, estando terminado?
 *
 * Las tres condiciones son necesarias y ninguna sobra:
 *   1. vive en la tabla de pedidos de la casa (`orders`) — el del link sin
 *      convertir no es un pedido todavía;
 *   2. NO es borrador — un borrador no se mandó porque no se terminó;
 *   3. no tiene envío ACTIVO en Switch (`estaEnSwitch` mira el envío, nunca el
 *      número: un envío vivo sin número existe y decir que no salió sería lo
 *      contrario de la verdad).
 */
export function esSinMandar(p: FilaSinMandar): boolean {
  if (p.fuente === "publicos") return false;
  if (esBorrador(p)) return false;
  return !(typeof p.enSwitch === "boolean"
    ? p.enSwitch
    : p.switchNumero !== null && p.switchNumero !== undefined);
}

/**
 * «Sin mandar a Switch · hace 65 días» — lo que la fila dice EN ROJO.
 *
 * El «hoy» es el día de Panamá y llega por parámetro. Sin fecha legible se
 * dice la frase sola, sin inventar un número: mostrar «hace NaN días» sería
 * peor que no decir cuánto.
 */
export function textoSinMandar(createdAt: string | null | undefined, hoyPanamaYmd: string): string {
  const base = "Sin mandar a Switch";
  if (!createdAt) return base;
  // Una fecha ilegible NO revienta ni inventa: `fechaPanamaDe` haría
  // `new Date(NaN).toISOString()`, que tira RangeError.
  if (Number.isNaN(new Date(createdAt).getTime())) return base;
  const dia = fechaPanamaDe(createdAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return base;
  const d = diasDesde(dia, hoyPanamaYmd);
  if (!Number.isFinite(d) || d < 0) return base;
  if (d === 0) return `${base} · hoy`;
  if (d === 1) return `${base} · ayer`;
  return `${base} · hace ${d} días`;
}
