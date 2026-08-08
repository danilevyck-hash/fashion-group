// ============================================================================
// Marketing › Mobiliario — NOTAS DEL PROVEEDOR (módulo PURO)
// ============================================================================
//
// 🔴 REGLA DE NEGOCIO, DICHA POR DANIEL Y NO NEGOCIABLE:
//
//     "son los datos de los costos del proveedor. que no sume ni nada,
//      solo info personal."
//
//   Esto es una LIBRETA, no un inventario. Los precios que se anotan acá
//   son lo que cobra el proveedor (Changalo), y NO participan de NINGÚN
//   cálculo del módulo:
//     * NO entran en `metricas` de /marketing/mobiliario (valor, entregado,
//       disponible, tiendas).
//     * NO entran en el "Resumen por tienda" ni en el Excel.
//     * NO se totalizan entre sí — no hay, y no debe haber, un "total de
//       la nota".
//
//   Por eso este archivo NO exporta ninguna función que sume, promedie o
//   agregue precios, y `marketing-notas-proveedor.test.ts` pone el build
//   ROJO si alguien agrega una. Si mañana alguien quiere "mejorar" la
//   pantalla sumando la columna de precios: NO. Preguntarle a Daniel.
//
// 🔴 SEGUNDA REGLA: el precio es OPCIONAL y un renglón sin precio se
//   muestra como "—", NUNCA como "$0.00".
//   Ojo con `formatearMonto()` de ./normalizar: mapea null/undefined a 0 y
//   devuelve "$0.00". Un costo desconocido mostrado como cero es un dato
//   inventado. `formatearPrecioNota` corta ANTES de llegar ahí.
//   Hoy los 5 renglones traen precio, pero el campo sigue aceptando vacío
//   a propósito: mañana entra un producto cuyo costo todavía no se sabe.
//
// 🔴 TERCERA REGLA: un renglón puede llevar VARIAS fotos.
//   "Barra plana + flauta" son dos productos que el proveedor vende juntos
//   (Daniel: "se venden juntas", "junta barra y flauta") y van en UN renglón
//   con SUS DOS fotos. Por eso `fotoPaths` es una lista y no un campo suelto:
//   partirlo en dos filas que se vean como una sería mentirle a la pantalla.
//
// Sin imports de Supabase: este módulo es puro y se testea sin base.
// El I/O vive en ./notas-proveedor-server.ts.
// ============================================================================

import { formatearMonto, normalizarTexto } from "./normalizar";

/** Un renglón de la nota: fotos + producto + precio (+ una aclaración). */
export interface NotaProveedorRenglon {
  id: string;
  /** Nombre del producto tal como lo escribió Daniel. */
  producto: string;
  /** Costo del proveedor. `null` = todavía no se sabe (se muestra "—"). */
  precio: number | null;
  /**
   * Aclaración corta al lado del precio, cuando el número solo se puede
   * malinterpretar. Caso real: "el par completo" en Conjunto soporte tabla
   * — sin eso, 6.75 se lee como precio por lado.
   */
  nota: string | null;
  /** Rutas dentro del bucket `marketing`. Lista vacía = renglón sin fotos. */
  fotoPaths: string[];
  /** URLs firmadas listas para un <img>, en el mismo orden que fotoPaths. */
  fotoUrls: string[];
  /** Orden manual de la lista (menor primero). */
  orden: number;
}

/** Lo que la pantalla manda para crear o editar un renglón. */
export interface NotaProveedorInput {
  producto: string;
  precio: number | null;
  nota: string | null;
  fotoPaths: string[];
}

export const PRODUCTO_MAX_LARGO = 120;
export const NOTA_MAX_LARGO = 80;
/** Tope de fotos por renglón: hoy el máximo real son 2 (barra + flauta). */
export const MAX_FOTOS_POR_RENGLON = 6;

/** Lo que se muestra cuando no hay precio. No es un cero. */
export const SIN_PRECIO = "—";

/**
 * Texto del precio para la pantalla.
 *
 * `null`/`undefined`/no-finito → "—". Nunca "$0.00".
 * Un 0 EXPLÍCITO sí se muestra como "$0.00": si alguien escribió cero,
 * cero es el dato (muestra sin costo). Lo que no puede pasar es que
 * "no sé" se vea igual que "cero".
 */
export function formatearPrecioNota(precio: number | null | undefined): string {
  if (precio === null || precio === undefined) return SIN_PRECIO;
  if (typeof precio !== "number" || !Number.isFinite(precio)) return SIN_PRECIO;
  return formatearMonto(precio);
}

/** Valor para el input de precio: vacío cuando no hay precio. */
export function precioParaInput(precio: number | null | undefined): string {
  if (precio === null || precio === undefined) return "";
  if (typeof precio !== "number" || !Number.isFinite(precio)) return "";
  return String(precio);
}

export type PrecioParseado =
  | { ok: true; precio: number | null }
  | { ok: false; error: string };

/**
 * Lee lo que se escribió en el campo de precio.
 *
 * Vacío (o solo espacios) → `null`, que es un valor VÁLIDO: dejarlo en
 * blanco es la forma de decir "todavía no sé cuánto cuesta". Acepta coma
 * decimal ("10,50") y el signo de dólar, porque así lo escribe la gente.
 */
export function parsearPrecioNota(
  raw: string | null | undefined,
): PrecioParseado {
  const texto = normalizarTexto(raw ?? "");
  if (texto === "") return { ok: true, precio: null };

  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "").replace(/,/g, ".");
  if (limpio === "") return { ok: true, precio: null };
  if (!/^\d*\.?\d*$/.test(limpio) || limpio === ".") {
    return { ok: false, error: "El precio solo puede tener números." };
  }

  const n = Number(limpio);
  if (!Number.isFinite(n)) {
    return { ok: false, error: "El precio solo puede tener números." };
  }
  if (n < 0) {
    return { ok: false, error: "El precio no puede ser negativo." };
  }
  // Dos decimales: es plata, no una medida.
  return { ok: true, precio: Math.round(n * 100) / 100 };
}

export type ProductoValidado =
  | { ok: true; producto: string }
  | { ok: false; error: string };

/** El nombre del producto es lo único obligatorio del renglón. */
export function validarProductoNota(
  raw: string | null | undefined,
): ProductoValidado {
  const producto = normalizarTexto(raw ?? "");
  if (producto === "") {
    return { ok: false, error: "Escribe el nombre del producto." };
  }
  if (producto.length > PRODUCTO_MAX_LARGO) {
    return {
      ok: false,
      error: `El nombre no puede pasar de ${PRODUCTO_MAX_LARGO} letras.`,
    };
  }
  return { ok: true, producto };
}

/**
 * Limpia la lista de fotos: saca vacíos y repetidos, conserva el orden en
 * que se subieron y corta en el tope. Duplicar una foto no rompe nada pero
 * la muestra dos veces, que es un error visible.
 */
export function normalizarFotoPaths(
  raw: ReadonlyArray<string | null | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const path = normalizarTexto(typeof p === "string" ? p : "");
    if (path === "" || vistos.has(path)) continue;
    vistos.add(path);
    out.push(path);
    if (out.length >= MAX_FOTOS_POR_RENGLON) break;
  }
  return out;
}

export type NotaValidada =
  | { ok: true; valor: NotaProveedorInput }
  | { ok: false; error: string };

/** Valida el renglón completo antes de guardarlo. */
export function validarNotaProveedor(entrada: {
  producto?: string | null;
  precio?: string | null;
  nota?: string | null;
  fotoPaths?: ReadonlyArray<string | null | undefined> | null;
}): NotaValidada {
  const prod = validarProductoNota(entrada.producto);
  if (!prod.ok) return { ok: false, error: prod.error };

  const precio = parsearPrecioNota(entrada.precio);
  if (!precio.ok) return { ok: false, error: precio.error };

  const nota = normalizarTexto(entrada.nota ?? "");
  if (nota.length > NOTA_MAX_LARGO) {
    return {
      ok: false,
      error: `La aclaración no puede pasar de ${NOTA_MAX_LARGO} letras.`,
    };
  }

  return {
    ok: true,
    valor: {
      producto: prod.producto,
      precio: precio.precio,
      nota: nota === "" ? null : nota,
      fotoPaths: normalizarFotoPaths(entrada.fotoPaths),
    },
  };
}

/**
 * Orden de la lista: por `orden` y, empatados, por `id` — para que el orden
 * sea TOTAL y no cambie entre cargas.
 */
export function ordenarNotas(
  notas: ReadonlyArray<NotaProveedorRenglon>,
): NotaProveedorRenglon[] {
  return [...notas].sort((a, b) => {
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Orden del renglón nuevo: al final de la lista. */
export function siguienteOrden(
  notas: ReadonlyArray<NotaProveedorRenglon>,
): number {
  let max = -1;
  for (const n of notas) if (n.orden > max) max = n.orden;
  return max + 1;
}
