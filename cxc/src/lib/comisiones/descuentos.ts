// ─────────────────────────────────────────────────────────────────────────────
// Descuentos fijos de comisión — la lectura vive en UN solo lugar.
//
// 🩸 POR QUÉ (12-ago-2026). La pantalla "Todas las empresas" pedía los
// descuentos **una vez por empresa** (5 llamadas HTTP, 10 consultas), y cada una
// filtraba por `empresa_key` sobre las MISMAS dos tablas chicas. Medido contra
// el build de producción: una sola apertura de /comisiones disparaba
// `/api/ventas/comisiones` ×5 y `/api/ventas/comisiones/descuentos` ×5 — 10
// peticiones donde alcanzaban 2.
//
// `empresa_key` acá es solo un `.eq()` de filtro: nada obligaba a partirlo en
// cinco. Pedir las 5 empresas de una son **2 consultas fijas**, no 10.
//
// ⚠️ LA REGLA DEL `activo` EFECTIVO NO SE TOCA Y NO SE COPIA: es la de siempre
// —la excepción del mes si existe, y si no el `activo` por defecto— y la aplica
// esta función para los dos consumidores (el endpoint por empresa y el
// consolidado). Dos copias de esta regla serían dos totales de comisión
// posibles para el mismo mes.
//
// 🔴 DESDE EL 6-sep-2026 CADA DESCUENTO TIENE VIGENCIA (`desde` / `hasta`), y
// la regla vive en `vigencia.ts` — un módulo puro, para que la decisión de
// «¿este mes lo lleva?» no se pueda copiar. Un descuento fuera de su vigencia
// NO existe para ese mes: no se le busca la excepción y no viaja a la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { descuentoVigente, mesISO } from "./vigencia";
export { mesISO } from "./vigencia";
// `DEFAULT_VENDEDOR` vive en `vendedor-default.ts` (módulo puro, sin cliente de
// servidor) para que las vistas lo puedan importar; acá se re-exporta porque
// `netearComisiones` lo usa y los lectores viejos lo buscaban aquí.
import { DEFAULT_VENDEDOR } from "./vendedor-default";
export { DEFAULT_VENDEDOR } from "./vendedor-default";

export interface DescuentoEfectivo {
  id: string;
  empresa_key: string;
  concepto: string;
  monto: number;
  /** `activo` EFECTIVO del mes: excepción si existe, si no el del catálogo. */
  activo: boolean;
  vendedor: string;
}

/**
 * Descuentos fijos con su `activo` efectivo del mes, para UNA o VARIAS empresas.
 *
 * Cuesta 2 consultas sin importar cuántas empresas se pidan.
 */
export async function leerDescuentosEfectivos(
  empresas: readonly string[],
  year: number,
  mes: number,
  vendedor = "",
): Promise<DescuentoEfectivo[]> {
  // `*` y no la lista de columnas: `desde`/`hasta` nacen en la DDL
  // 20261007120000 y hasta que corra la lectura tiene que seguir saliendo — con
  // los dos campos ausentes, que es «sin límite» y por lo tanto la conducta de
  // siempre. Nada se apaga en silencio por una migración que todavía no corrió.
  let q = supabaseServer
    .from("comision_descuentos_fijos")
    .select("*")
    .in("empresa_key", empresas as string[])
    .eq("activo", true);
  if (vendedor) q = q.eq("vendedor_nombre", vendedor);
  const { data: fijos, error } = await q.order("concepto", { ascending: true });
  if (error) throw new Error(error.message);

  // 🔴 LA VIGENCIA SE APLICA ANTES QUE NADA: un descuento que todavía no
  // empezó (o que ya terminó) NO existe para ese mes, así que tampoco se le
  // busca la excepción ni viaja a la pantalla. Regla en `vigencia.ts`.
  const vigentes = (fijos ?? []).filter((f) =>
    descuentoVigente(f as { desde?: string | null; hasta?: string | null }, year, mes),
  );

  const ids = vigentes.map((f) => String(f.id));
  const excById = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: exc, error: e2 } = await supabaseServer
      .from("comision_descuento_excepciones")
      .select("descuento_id, activo")
      .in("descuento_id", ids)
      .eq("mes", mesISO(year, mes));
    if (e2) throw new Error(e2.message);
    for (const x of exc ?? []) excById.set(String(x.descuento_id), Boolean(x.activo));
  }

  return vigentes.map((f) => {
    const id = String(f.id);
    // Efectivo: excepción del mes si existe; si no, activo por defecto.
    const activo = excById.has(id) ? excById.get(id)! : true;
    return {
      id,
      empresa_key: String((f as { empresa_key?: string }).empresa_key ?? ""),
      concepto: String(f.concepto),
      monto: Number(f.monto),
      activo,
      vendedor: String((f as { vendedor_nombre?: string }).vendedor_nombre ?? ""),
    };
  });
}

/**
 * Total ACTIVO por vendedor, de UNA empresa. Es lo único que la tabla
 * consolidada necesita para mostrar el neto.
 */
export function totalPorVendedor(
  descuentos: readonly DescuentoEfectivo[],
  empresaKey?: string,
): Record<string, number> {
  const porVendedor: Record<string, number> = {};
  for (const d of descuentos) {
    if (!d.activo || !d.vendedor) continue;
    if (empresaKey && d.empresa_key !== empresaKey) continue;
    porVendedor[d.vendedor] =
      Math.round(((porVendedor[d.vendedor] ?? 0) + d.monto) * 100) / 100;
  }
  return porVendedor;
}

/** Los montos vienen de dos fuentes; sin esto la resta arrastra centavos. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface VendedorComision {
  vendedor: string;
  comision_total?: number | null;
}

/**
 * 🔴 LA RESTA DE LOS DESCUENTOS, UNA SOLA VEZ EN TODO EL SISTEMA.
 *
 * 🩸 POR QUÉ (24-ago-2026). La pestaña "Por empresa" mostraba el SUBTOTAL
 * mientras "Todas las empresas" y el detalle del vendedor sí restaban:
 * **Reinaldo en Fashion Shoes salía $1.573,08 más alto en una pestaña que en la
 * otra** ($2.859,65 contra $1.286,57 en julio-2026), la misma persona y el
 * mismo mes en la misma pantalla — y el Excel de esa vista bajaba el número
 * inflado. Daniel ya lo había reclamado una vez (*"me sale en el web el total,
 * y no me resta el descuento"*) y se arregló en UNA pestaña y no en la otra.
 *
 * Por eso la resta vive ACÁ y la aplican los DOS endpoints antes de responder:
 * las vistas solo dibujan `comision_total`. Una segunda implementación —aunque
 * copie esta línea por línea— es la forma conocida de que los dos totales se
 * vuelvan a separar, que es exactamente el bug que esto vino a cerrar.
 *
 * Devuelve el `comision_total` YA NETO y el `descuento` aplicado, para que la
 * pantalla pueda decir por qué el total no es la suma de sus dos comisiones.
 */
export function netearComisiones<T extends VendedorComision>(
  vendedores: readonly T[],
  porVendedor: Record<string, number>,
): (T & { descuento: number; comision_total: number })[] {
  return (vendedores ?? []).map((v) => {
    const bruto = Number(v.comision_total ?? 0);
    const descuento =
      v.vendedor === DEFAULT_VENDEDOR ? 0 : Number(porVendedor[v.vendedor] ?? 0);
    return {
      ...v,
      descuento,
      comision_total: descuento ? round2(bruto - descuento) : bruto,
    };
  });
}
