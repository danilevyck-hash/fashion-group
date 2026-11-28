// Vista general «HOY» — las lecturas (27-nov-2026). Cada número sale de la
// MISMA función que la pantalla de origen:
//   · Ventas y margen: `fetchVentasResumen` (Ventas › Resumen, sin la venta de
//     hoy en el margen y el año pasado a los mismos días de Panamá).
//   · Cobros: `switch_recibos` con el filtro del Telegram de cobros (sin
//     retenciones, sin recibos en cero, sin los códigos de `CLIENTES_FUERA`).
//   · Pedidos: `switch_pedidos` + `pedidos_bodega_estado`, como Despachos › Pedidos.
//   · Por cobrar: la MV de CxC (grupo) y `_aging_boston` (Boston).
//   · Por pagar: `buildPorEmpresa` de Proveedores, con sus amarres.
//   · Inventario: `leerInventarioValorizado` (sin los artículos que Switch ya no manda).
// Cada bloque falla ABIERTO: lo que no se lee viaja `null` y la tarjeta dice
// «No se pudo medir», nunca $0.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ALL_EMPRESA_KEYS, B2B_EMPRESA_KEYS, VENTAS_ID_TO_EMPRESA_KEY } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { fetchVentasResumen } from "@/lib/ventas/queries";
import { cobroCuenta } from "@/lib/cxc/cobros-del-dia";
import { fetchAllProveedorRows } from "@/lib/proveedores/lista";
import { leerAmarresProveedor } from "@/lib/proveedores/amarre-lectura";
import { buildPorEmpresa } from "@/lib/proveedores/por-empresa";
import { leerInventarioValorizado } from "@/lib/inventario/leer";
import { estadoFlujoSimpleLeido } from "@/lib/guias/pedidos-flujo-simple";
import { diasDesde } from "@/lib/guias/pedidos-bodega";
import {
  BOSTON,
  DIAS_PEDIDO_ATRASADO,
  MULTIFASHION,
  loManeja,
  type Cartera,
  type ConteoPedidos,
  type EmpresaHoy,
  type Inventario,
  type SeriesVentas,
  type VistaGeneralHoyData,
} from "./hoy";

type PorEmpresa<T> = Map<string, T> | null;

async function seguro<T>(etiqueta: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.error(`[vista-general/hoy] ${etiqueta}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

async function leerVentas(anio: number) {
  const r = await fetchVentasResumen({ year: anio });
  const out = new Map<string, SeriesVentas>();
  for (const e of r.empresas) {
    const key = VENTAS_ID_TO_EMPRESA_KEY[e.empresa.id];
    if (!key) continue;
    const ventasMargen = e.ventasParaMargen ?? e.ventas2026;
    out.set(key, {
      serie: e.ventas2026,
      seriePrev: e.ventas2025,
      utilidad: e.utilidad2026,
      ventasMargen,
      utilidadPrev: e.utilidad2025,
      // venta (la del margen) − utilidad = costo, mes por mes.
      costo: ventasMargen.map((v, i) => (v == null || e.utilidad2026[i] == null ? null : v - (e.utilidad2026[i] as number))),
    });
  }
  return { porEmpresa: out, fechaCorte: r.fecha_corte, actualizado: r.data_actualizada_at };
}

/**
 * Los recibos que cuentan como cobro (la regla del Telegram de cobros): sin
 * retenciones, sin recibos en cero, sin los códigos de `CLIENTES_FUERA`.
 * `empresas` = solo esas (la tarjeta mes a mes); sin ella, todas.
 */
export async function leerRecibosQueCuentan(
  desde: string,
  hasta: string,
  empresas?: readonly string[],
): Promise<{ empresa_key: string; fecha: string; total: number }[]> {
  const filas = await leerTodoPaginado<{ empresa_key: string; cliente_codigo: string; fecha: string; total: number | string }>(
    "switch_recibos (cobros)",
    (c, d, h) => {
      let q = supabaseServer
        .from("switch_recibos")
        .select("empresa_key, cliente_codigo, fecha, total", c ? { count: "exact" } : {})
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .eq("es_retencion", false)
        .neq("total", 0)
        .not("cliente_codigo", "is", null);
      if (empresas) q = q.in("empresa_key", [...empresas]);
      return q.order("id", { ascending: true }).range(d, h);
    },
  );
  return filas
    .filter((f) => cobroCuenta({ empresa: f.empresa_key, codigo: f.cliente_codigo, cliente: "", monto: 0 }))
    .map((f) => ({ empresa_key: f.empresa_key, fecha: String(f.fecha), total: n(f.total) }));
}

/** Cobros del mes por empresa: la regla del Telegram de cobros. */
export async function leerCobrosDelMes(desde: string, hasta: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const f of await leerRecibosQueCuentan(desde, hasta)) out.set(f.empresa_key, (out.get(f.empresa_key) ?? 0) + f.total);
  return out;
}

/** Pedidos por despachar, como los cuenta Despachos › Pedidos (admin ve las 6). */
export async function leerPedidos(hoy: string): Promise<Map<string, ConteoPedidos>> {
  const [ped, est] = await Promise.all([
    leerTodoPaginado<{ empresa_key: string; pedido_switch_id: number; fecha: string }>("switch_pedidos", (c, d, h) =>
      supabaseServer
        .from("switch_pedidos")
        .select("empresa_key, pedido_switch_id, fecha", c ? { count: "exact" } : {})
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .order("empresa_key", { ascending: true })
        .order("pedido_switch_id", { ascending: true })
        .range(d, h),
    ),
    leerTodoPaginado<{ empresa_key: string; pedido_switch_id: number; estado: string | null }>("pedidos_bodega_estado", (c, d, h) =>
      supabaseServer
        .from("pedidos_bodega_estado")
        .select("empresa_key, pedido_switch_id, estado", c ? { count: "exact" } : {})
        .order("empresa_key", { ascending: true })
        .order("pedido_switch_id", { ascending: true })
        .range(d, h),
    ),
  ]);
  const estado = new Map(est.map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e.estado]));
  const out = new Map<string, ConteoPedidos>(B2B_EMPRESA_KEYS.map((k) => [k, { pendiente: 0, en_preparacion: 0, preparado: 0, atrasados: 0 }]));
  for (const p of ped) {
    const c = out.get(p.empresa_key);
    if (!c) continue;
    const e = estadoFlujoSimpleLeido(estado.get(`${p.empresa_key}:${p.pedido_switch_id}`));
    if (e === "recibido") continue;
    c[e] += 1;
    if (diasDesde(p.fecha, hoy) > DIAS_PEDIDO_ATRASADO) c.atrasados += 1;
  }
  return out;
}

type FilaAging = Record<"total" | "d121_180" | "d181_270" | "d271_365" | "mas_365", number | string | null> & { company_key?: string };

const mas120 = (r: FilaAging) => n(r.d121_180) + n(r.d181_270) + n(r.d271_365) + n(r.mas_365);

/**
 * Por cobrar del grupo + Boston. El grupo sale de lo MISMO que lee Cuentas por
 * cobrar (`/api/cxc/aging`): la MV, y la vista en vivo solo si la MV falla.
 * Boston, de su vista aparte (`/api/cxc/boston`). Nunca se mezclan.
 */
export async function leerCxc(): Promise<Map<string, Cartera>> {
  const cols = "total,d121_180,d181_270,d271_365,mas_365";
  const leerGrupo = (tabla: string) =>
    leerTodoPaginado<FilaAging>(tabla, (c, d, h) =>
      supabaseServer
        .from(tabla)
        .select(`company_key,${cols}`, c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(d, h),
    );
  const [grupo, boston] = await Promise.all([
    leerGrupo("switch_estadocuenta_aging_mv").catch(() => leerGrupo("switch_estadocuenta_aging")),
    leerTodoPaginado<FilaAging>("switch_estadocuenta_aging_boston", (c, d, h) =>
      supabaseServer
        .from("switch_estadocuenta_aging_boston")
        .select(cols, c ? { count: "exact" } : {})
        .order("codigo", { ascending: true })
        .range(d, h),
    ),
  ]);
  const out = new Map<string, Cartera>();
  const sumar = (k: string, r: FilaAging) => {
    const a = out.get(k) ?? { total: 0, mas120: 0 };
    out.set(k, { total: a.total + n(r.total), mas120: a.mas120 + mas120(r) });
  };
  for (const r of grupo) if (r.company_key) sumar(r.company_key, r);
  for (const r of boston) sumar(BOSTON, r);
  for (const k of ALL_EMPRESA_KEYS) if (loManeja(k, "cxc") && !out.has(k)) out.set(k, { total: 0, mas120: 0 });
  return out;
}

/** Por pagar: la MISMA cartera de Proveedores (sus amarres y sus tramos). */
export async function leerCxp(): Promise<Map<string, Cartera>> {
  const [rows, amarres] = await Promise.all([fetchAllProveedorRows(), leerAmarresProveedor()]);
  const cartera = buildPorEmpresa(rows, amarres);
  return new Map(
    cartera.empresas.map((e) => [e.empresa_key, { total: e.saldo.por_pagar, mas120: e.tramos.t121_365 + e.tramos.tMas365 }]),
  );
}

async function leerInventario(ahoraMs: number): Promise<Map<string, Inventario>> {
  const inv = await leerInventarioValorizado(ahoraMs, [...B2B_EMPRESA_KEYS, MULTIFASHION]);
  return new Map(inv.porEmpresa.map((e) => [e.key, { costo: e.costo, unidades: e.unidades }]));
}

export async function leerVistaGeneralHoy(ahora: Date = new Date()): Promise<VistaGeneralHoyData> {
  const hoy = hoyPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const [ventas, cobros, pedidos, cxc, cxp, inventario] = await Promise.all([
    seguro("ventas", () => leerVentas(anio)),
    seguro("cobros", () => leerCobrosDelMes(`${hoy.slice(0, 7)}-01`, hoy)),
    seguro("pedidos", () => leerPedidos(hoy)),
    seguro("cxc", leerCxc),
    seguro("cxp", leerCxp),
    seguro("inventario", () => leerInventario(ahora.getTime())),
  ]);

  const poner = <T,>(e: EmpresaHoy, k: string, d: "cobros" | "pedidos" | "cxc" | "cxp" | "inventario", m: PorEmpresa<T>, cero: T) => {
    if (!loManeja(k, d)) return;
    (e as unknown as Record<string, unknown>)[d] = m === null ? null : (m.get(k) ?? cero);
  };
  const empresas: Record<string, EmpresaHoy> = {};
  for (const k of ALL_EMPRESA_KEYS) {
    const e: EmpresaHoy = { ventas: ventas?.porEmpresa.get(k) ?? null };
    poner(e, k, "cobros", cobros, 0);
    poner(e, k, "pedidos", pedidos, { pendiente: 0, en_preparacion: 0, preparado: 0, atrasados: 0 });
    poner<Cartera>(e, k, "cxc", cxc, { total: 0, mas120: 0 });
    poner<Cartera>(e, k, "cxp", cxp, { total: 0, mas120: 0 });
    // Inventario: una empresa del sync sin filas es un hueco, no un cero.
    if (loManeja(k, "inventario")) e.inventario = inventario?.get(k) ?? null;
    empresas[k] = e;
  }

  return {
    generadoEn: ahora.toISOString(),
    actualizado: ventas?.actualizado ?? ahora.toISOString(),
    anio,
    mes,
    fechaCorte: ventas?.fechaCorte ?? null,
    empresas,
  };
}
