// ─────────────────────────────────────────────────────────────────────────────
// EL BULTO ESCRITO EN EL RENGLÓN DE REEBOK — leerlo y escribirlo sin romper
// nada si la migración todavía no corrió.
//
// Ver la cabecera de `lib/reebok-bulto.ts` (por qué existe). Aquí vive lo que
// toca la base:
//
//   · `bultoEnRenglon(cfg)`: ¿existe `reebok_order_items.bulto_pzas`? Una
//     lectura de una fila; el «sí» se recuerda (la columna no desaparece). Sin
//     la columna —o en cualquier otra marca— es `false`, y cada lector pide
//     sus columnas de siempre: la pantalla queda EXACTAMENTE como hoy.
//   · `sellarBultoReebok(...)`: pone `bulto_pzas` a los renglones que se van a
//     guardar. Lo que ya estaba en el pedido conserva el suyo (también el
//     NULL de un renglón viejo); lo nuevo lleva la regla de hoy. Lo que mande
//     el navegador NO cuenta: el bulto sale de la categoría de la base.
//
// 🔴 FALLA ABIERTA: si la columna no existe, `sellarBultoReebok` QUITA el
// campo y todo se calcula y se guarda con la regla de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { bultoReebokNuevo, bultoValido } from "@/lib/reebok-bulto";

interface CfgMin {
  marca: string;
  itemsRelation: string;
  db: () => Promise<unknown>;
}

interface DbProbe {
  from(t: string): { select(c: string): { limit(n: number): PromiseLike<{ error: unknown }> } };
}

let columnaConfirmada = false;

/** ¿El renglón de esta marca guarda su bulto? Solo Reebok, y solo con la columna. */
export async function bultoEnRenglon(cfg: CfgMin): Promise<boolean> {
  if (cfg.marca !== "reebok") return false;
  if (columnaConfirmada) return true;
  try {
    const db = (await cfg.db()) as DbProbe;
    const { error } = await db.from(cfg.itemsRelation).select("bulto_pzas").limit(1);
    if (!error) columnaConfirmada = true;
    return !error;
  } catch {
    return false;
  }
}

/** Para pruebas: olvidar lo aprendido. */
export function _olvidarColumna(): void {
  columnaConfirmada = false;
}

/** La lista de columnas del renglón, con `bulto_pzas` cuando existe. */
export function colsConBulto(cols: string, conBulto: boolean): string {
  return conBulto ? `${cols}, bulto_pzas` : cols;
}

/** Al producto del catálogo le pone el bulto con el que se va a PEDIR hoy, si
 *  la columna existe. Sin ella, el producto queda como viene (regla vieja). */
export function productoConBulto<T extends { category?: string | null }>(p: T, vivo: boolean): T {
  return vivo ? { ...p, bulto_pzas: bultoReebokNuevo(p.category) } : p;
}

/**
 * PURA. Pone `bulto_pzas` a cada renglón que se va a guardar.
 *
 * - `vivo = false` (Reebok sin la columna): se quita el campo y todo queda
 *   como hoy. `vivo` es `bultoEnRenglon(cfg)`; el interruptor de la ropa vive
 *   dentro de `bultoReebokNuevo` (apagado, lo nuevo se escribe con la regla
 *   vieja y lo ya escrito se conserva igual).
 * - Renglón que YA estaba en el pedido (`previos` lo tiene): conserva el suyo,
 *   NULL incluido — un pedido viejo editado sigue en su bulto de siempre.
 * - Renglón nuevo: la regla de hoy sobre la categoría de la BASE.
 */
export function sellarBultoReebok<T extends { product_id?: string | null; bulto_pzas?: number | null }>(
  items: readonly T[],
  opts: {
    vivo: boolean;
    categoria: (productId: string) => string | null | undefined;
    previos?: ReadonlyMap<string, number | null>;
  },
): (T & { bulto_pzas?: number | null })[] {
  return items.map((i) => {
    const { bulto_pzas: _ignorado, ...resto } = i;
    void _ignorado;
    if (!opts.vivo) return resto as T;
    const pid = String(i.product_id ?? "");
    if (opts.previos?.has(pid)) {
      return { ...resto, bulto_pzas: bultoValido(opts.previos.get(pid)) } as T;
    }
    return { ...resto, bulto_pzas: bultoReebokNuevo(opts.categoria(pid)) } as T;
  });
}

/**
 * PURA. Renglones que YA traen su bulto decidido (un pedido del link que se
 * convierte: el bulto se escribió cuando el cliente lo armó). Cada uno
 * conserva el suyo, NULL incluido; sin la columna, el campo se quita.
 */
export function conservarBultoReebok<T extends { product_id?: string | null; bulto_pzas?: number | null }>(
  items: readonly T[],
  vivo: boolean,
): (T & { bulto_pzas?: number | null })[] {
  const previos = new Map(items.map((i) => [String(i.product_id ?? ""), i.bulto_pzas ?? null]));
  return sellarBultoReebok(items, { vivo, categoria: () => null, previos });
}
