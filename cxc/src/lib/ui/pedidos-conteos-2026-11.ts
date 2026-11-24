// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos — conteos en las pestañas y la línea de resumen (Daniel,
// 24-nov-2026; reemplaza las 4 tarjetas del mismo día, que se retiraron).
//   · Para TODOS: cada pestaña dice cuántos pedidos tiene (el 0 en gris), y la
//     línea «16 pendientes · 8,594 unidades» va al lado del filtro de empresa;
//     debajo, chico, «el más viejo, …» y «Actualizado».
//   · SOLO `daniel` ve la plata (subtotal sin ITBMS): en la línea, ANTES de las
//     unidades, y en cada pedido junto a la cápsula de unidades. 🔴 Lo decide el
//     SERVIDOR (`montoDelPedido` en `api/guias/pedidos`): a nadie más le viaja.
// `false` = la pantalla de antes (pestañas sin número, línea arriba).
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde, fechaDeAntiguedad, haceDiasCorto, type PedidoBodega } from "@/lib/guias/pedidos-bodega";
import { ESTADOS_FLUJO_SIMPLE, type EstadoFlujoSimple } from "@/lib/guias/pedidos-flujo-simple";
import { textoUnidades } from "@/lib/guias/pedidos-bultos";

export const PEDIDOS_CONTEOS_2026_11 = true;

/** Usuarios (`fg_users.name`, de la cookie FIRMADA) a quienes el servidor les manda los montos. */
export const USUARIOS_VEN_MONTOS: readonly string[] = ["daniel"];

export function veMontosDePedidos(userName: string | null | undefined): boolean {
  return USUARIOS_VEN_MONTOS.includes((userName ?? "").trim().toLowerCase());
}

/**
 * 🔴 EL ÚNICO lugar por donde sale plata de `api/guias/pedidos`: `{ monto }`
 * para `daniel`, `{}` (sin el campo) para cualquier otro.
 */
export function montoDelPedido(userName: string | null | undefined, subtotal: unknown): { monto?: number | null } {
  if (!veMontosDePedidos(userName)) return {};
  const n = subtotal == null ? NaN : Number(subtotal);
  return { monto: Number.isFinite(n) ? n : null };
}

/** Cuántos pedidos hay en cada pestaña (sobre lo que ya filtró la empresa). */
export function conteosPorEstado(rows: readonly Pick<PedidoBodega, "estado">[]): Record<EstadoFlujoSimple, number> {
  const c = Object.fromEntries(ESTADOS_FLUJO_SIMPLE.map((e) => [e, 0])) as Record<EstadoFlujoSimple, number>;
  for (const r of rows) if (r.estado in c) c[r.estado as EstadoFlujoSimple] += 1;
  return c;
}

/** «$146,509» — sin centavos, como el mockup aprobado. */
export function textoMonto(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

type Fila = Pick<PedidoBodega, "estado" | "fecha" | "piezas" | "monto" | "en_preparacion_en" | "preparado_en">;

/**
 * «16 pendientes · $146,509 · 8,594 unidades»: primero la plata (solo si
 * viajó, o sea solo `daniel`), después las unidades (las que se conocen).
 */
export function lineaDeResumen(rows: readonly Fila[], estado: string, nombre: { singular: string; plural: string }): string {
  const del = rows.filter((r) => r.estado === estado);
  if (del.length === 0) return `Sin pedidos ${nombre.plural}`;
  const partes = [`${del.length} ${del.length === 1 ? nombre.singular : nombre.plural}`];
  const montos = del.filter((r) => typeof r.monto === "number");
  if (montos.length > 0) partes.push(textoMonto(montos.reduce((s, r) => s + (r.monto as number), 0)));
  const piezas = del.filter((r) => typeof r.piezas === "number");
  if (piezas.length > 0) partes.push(textoUnidades(piezas.reduce((s, r) => s + (r.piezas as number), 0)));
  return partes.join(" · ");
}

/** «el más viejo, ayer» — la MISMA antigüedad de la fila (`fechaDeAntiguedad`). */
export function lineaMasViejo(rows: readonly Fila[], estado: string, hoy: string): string | null {
  const del = rows.filter((r) => r.estado === estado);
  if (del.length === 0) return null;
  const masViejo = del.map(fechaDeAntiguedad).reduce((m, f) => (diasDesde(f, hoy) > diasDesde(m, hoy) ? f : m));
  return `el más viejo, ${haceDiasCorto(masViejo, hoy)}`;
}
