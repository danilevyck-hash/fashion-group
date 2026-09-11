// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LOS RENGLONES SALEN DE LA FACTURA (10-sep-2026). Módulo PURO.
//
// Daniel aprobó el mockup «Reclamar un renglón de cien»: el lector saca las
// líneas del PDF, Andrea BUSCA por estilo o descripción, marca la que reclama
// y llena lo mismo que hoy. Sin teclear estilo ni precio: salen de la factura.
//
// Daniel, textual (11-sep-2026): *«debe de ser la cantidad y poner la talla
// como ahora, así como sale en el PDF, no quiero enredo aquí cambiándome algo
// que ya existe y funciona bien»*. Entonces:
//   · Del PDF salen y NO se editan: Estilo (la referencia de siempre),
//     Descripción, Cantidad de la factura, Precio.
//   · Andrea llena por renglón, como hoy: Cant. reclamada · Talla (texto: S,
//     OS, M, 32, «todas») · Motivo (lista). El género sigue como está.
//
// Rótulos EXACTOS de la lista (Daniel: *«palabras de novatos confunden»*):
//   Estilo · Descripción · Cantidad · Precio · Talla · Cant. reclamada · Motivo
//
// 🔴 LA TALLA, MEDIDA EN LOS PDF REALES (8 distintos en el bucket + la factura
// de referencia que mandó Daniel, `__tests__/fixtures/factura-american-designer-
// fashion-3000015536.pdf`, 10-sep-2026):
//   · American Fashion Wear / American Designer Fashion (7 de 9): NO traen
//     talla por línea — la cantidad es el prepack del estilo. Talla vacía y
//     editable, como hoy.
//   · Latin Fitness Group (2 de 9): SÍ, con desglose por talla en la misma
//     línea («8.5 [2], 9 [2], 11 [1]…»). El lector la desglosa: cada talla es
//     un renglón, con la talla ya puesta y editable.
// ─────────────────────────────────────────────────────────────────────────────

import type { RItem } from "@/app/reclamos/components/types";

export interface LineaFactura {
  referencia: string;
  descripcion: string;
  /** Vacía cuando la factura no la trae (aswgr). */
  talla: string;
  cantidad: number;
  precio: number;
}

export const ROTULOS_LINEAS = ["Estilo", "Descripción", "Cantidad", "Precio", "Talla", "Cant. reclamada", "Motivo"] as const;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}
function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convierte lo que devolvió el lector en líneas limpias. Una línea sin
 * referencia se descarta; sin cantidad legible queda en 0 (se ve, no se
 * inventa). Se aceptan números con coma decimal («16,00»), como los imprime
 * el proveedor.
 */
export function normalizarLineas(raw: unknown): LineaFactura[] {
  if (!Array.isArray(raw)) return [];
  const salida: LineaFactura[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    if (!l || typeof l !== "object") continue;
    const referencia = texto(l.referencia);
    if (!referencia) continue;
    salida.push({
      referencia,
      descripcion: texto(l.descripcion),
      talla: texto(l.talla),
      cantidad: Math.max(0, Math.round(numero(l.cantidad))),
      precio: Math.max(0, numero(l.precio)),
    });
  }
  return salida;
}

function llano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtra por estilo (referencia) y descripción. Con búsqueda vacía, todas. */
export function buscarLineas(lineas: readonly LineaFactura[], q: string): LineaFactura[] {
  const n = llano(q.trim());
  if (!n) return [...lineas];
  return lineas.filter((l) => [l.referencia, l.descripcion].some((c) => llano(c).includes(n)));
}

/** Un ítem del reclamo armado desde una línea de la factura. */
export function itemDesdeLinea(l: LineaFactura, cantidadReclamada?: number, motivo = ""): RItem {
  const cantidad = cantidadReclamada ?? l.cantidad;
  return {
    referencia: l.referencia,
    descripcion: l.descripcion,
    talla: l.talla,
    cantidad,
    precio_unitario: l.precio,
    subtotal: cantidad * l.precio,
    motivo,
    genero: "",
    nro_factura: "",
    nro_orden_compra: "",
  };
}

/** «Repetir el anterior»: una fila nueva con talla, género, precio y motivo del anterior. */
export function filaRepetida(anterior: RItem): RItem {
  return {
    referencia: "",
    descripcion: "",
    talla: anterior.talla,
    cantidad: 1,
    precio_unitario: anterior.precio_unitario,
    subtotal: anterior.precio_unitario,
    motivo: anterior.motivo,
    genero: anterior.genero,
    nro_factura: "",
    nro_orden_compra: "",
  };
}

/** El pie: «N renglones · N piezas · $». */
export function resumenRenglones(items: readonly Pick<RItem, "cantidad" | "precio_unitario">[]): { renglones: number; piezas: number; subtotal: number } {
  return items.reduce(
    (acc, i) => {
      const c = Number(i.cantidad) || 0;
      return { renglones: acc.renglones + 1, piezas: acc.piezas + c, subtotal: acc.subtotal + c * (Number(i.precio_unitario) || 0) };
    },
    { renglones: 0, piezas: 0, subtotal: 0 },
  );
}

/**
 * Lo que se GUARDA como renglones del reclamo. Con líneas leídas del PDF, los
 * renglones son los que Andrea marcó en la lista (`seleccion`, por índice de
 * línea) más los que tecleó a mano que tengan algo escrito; sin líneas, los
 * tecleados tal cual (el camino de siempre, que la validación revisa entero).
 */
export function itemsAGuardar(seleccion: Record<number, RItem>, manuales: readonly RItem[], hayLineas: boolean): RItem[] {
  if (!hayLineas) return [...manuales];
  const marcados = Object.keys(seleccion).map(Number).sort((a, b) => a - b).map((k) => seleccion[k]);
  const escritos = manuales.filter((i) => i.referencia.trim() || i.descripcion.trim());
  return [...marcados, ...escritos];
}
