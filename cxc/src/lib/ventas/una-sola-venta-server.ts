// ─────────────────────────────────────────────────────────────────────────────
// UNA SOLA VENTA — las lecturas del SERVIDOR (23-sep-2026).
//
// Lo puro vive en `una-sola-venta.ts`; acá están las consultas que Productos y
// Utilidad necesitan para cuadrar contra el Resumen:
//   · la venta del Resumen para una empresa en una ventana de meses, leída con
//     la MISMA función que el Resumen (`leerDashboardSummary`), nunca con una
//     suma propia sobre `switch_facturas`;
//   · las notas de débito de la ventana (el reporte por artículo no las trae);
//   · el contado del año (el reporte de utilidad no lo trae) — el RESPALDO de
//     Utilidad mientras la migración de la v3 no corra;
//   · desde cuándo hay datos en una tabla, para decirlo en vez de romperse.
//
// 🔴 TODO FALLA ABIERTO: una lectura caída deja la pantalla como estaba antes
// (el total del listado, sin cuadre), y se anota en el log. Nunca un cero
// inventado ni una pantalla en blanco.
//
// ⚠️ `db-max-rows` = 1000 corta EN SILENCIO: lo que pueda pasarlo va por
// `leerTodoPaginado`. Las notas de débito de un año son ~200 en las 8 empresas
// y el contado ~550 en las 6: chico, pero se pagina igual.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerDashboardSummary } from "@/lib/ventas/dashboard-summary";
import {
  aniosDeVentana,
  armarCuadreProductos,
  sumarResumenEnVentana,
  ventanaUtcDePanama,
  TIPOS_SIN_REPORTE_DE_UTILIDAD,
  type ContadoDeCliente,
  type CuadreProductos,
} from "@/lib/ventas/una-sola-venta";
import { TIPO_VENTA_NOTA_DEBITO } from "@/lib/ventas/tipos-comprobante";

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

/**
 * La venta del Resumen para UNA empresa entre `desde` y `hasta` (fechas de
 * Panamá; la ventana arranca el 1 de un mes). Lanza si la RPC falla.
 */
export async function ventaResumenEnVentana(empresa: string, desde: string, hasta: string): Promise<number> {
  let total = 0;
  for (const anio of aniosDeVentana(desde, hasta)) {
    const res = await leerDashboardSummary(anio);
    if (res.error) throw new Error(`ventas_dashboard_summary(${anio}): ${res.error.message}`);
    total += sumarResumenEnVentana(res.data ?? [], empresa, anio, desde, hasta);
  }
  return total;
}

/** La venta del Resumen de un AÑO para varias empresas, sumada. Lanza si falla. */
export async function ventaResumenDelAnio(empresas: readonly string[], anio: number): Promise<number> {
  const res = await leerDashboardSummary(anio);
  if (res.error) throw new Error(`ventas_dashboard_summary(${anio}): ${res.error.message}`);
  let total = 0;
  for (const f of res.data ?? []) if (empresas.includes(f.empresa)) total += num(f.total_subtotal);
  return total;
}

interface FilaNd { id: string; subtotal_descuento: number | string | null }
interface FilaNdCosto { id: string; costo: number | string | null }

/**
 * Las notas de débito de la ventana: la venta sale de `switch_facturas` (la
 * fuente única de ventas) y el costo de `switch_factura_utilidad` (la ÚNICA
 * fuente con costo de ND — la misma regla que el Resumen, 3-sep-2026).
 */
export async function notasDebitoEnVentana(
  empresa: string,
  desde: string,
  hasta: string,
): Promise<{ monto: number; n: number; costo: number }> {
  const { ini, fin } = ventanaUtcDePanama(desde, hasta);
  const filas = await leerTodoPaginado<FilaNd>("switch_facturas (notas de débito)", (pedirCount, a, b) =>
    supabaseServer
      .from("switch_facturas")
      .select("id, subtotal_descuento", pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", empresa)
      .eq("tipo_comprobante", TIPO_VENTA_NOTA_DEBITO)
      .gte("fecha", ini)
      .lt("fecha", fin)
      .order("id", { ascending: true })
      .range(a, b));
  const costos = await leerTodoPaginado<FilaNdCosto>("switch_factura_utilidad (notas de débito)", (pedirCount, a, b) =>
    supabaseServer
      .from("switch_factura_utilidad")
      .select("id, costo", pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", empresa)
      .eq("tipo_comprobante", TIPO_VENTA_NOTA_DEBITO)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(a, b));
  return {
    monto: filas.reduce((s, f) => s + num(f.subtotal_descuento), 0),
    n: filas.length,
    costo: costos.reduce((s, f) => s + num(f.costo), 0),
  };
}

/**
 * El cuadre de Productos contra el Resumen. `null` si algo falla: la pantalla
 * queda con el total del listado, como antes, y se anota.
 */
export async function cuadreProductos(args: {
  empresa: string;
  desde: string;
  hasta: string;
  listado: number;
}): Promise<CuadreProductos | null> {
  try {
    const [ventaResumen, notasDebito] = await Promise.all([
      ventaResumenEnVentana(args.empresa, args.desde, args.hasta),
      notasDebitoEnVentana(args.empresa, args.desde, args.hasta),
    ]);
    return armarCuadreProductos({ ventaResumen, listado: args.listado, notasDebito });
  } catch (e) {
    console.error("[ventas/una-sola-venta] cuadre de productos falló (se sigue sin cuadre):", e instanceof Error ? e.message : e);
    return null;
  }
}

interface FilaContado {
  id: string;
  empresa_key: string;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  subtotal_descuento: number | string | null;
}

/**
 * El contado del año (los tipos que el reporte de utilidad no lista), por
 * cliente, desde `switch_facturas`. Año de PANAMÁ. Lanza si falla.
 */
export async function contadoDelAnio(empresas: readonly string[], anio: number): Promise<ContadoDeCliente[]> {
  const { ini, fin } = ventanaUtcDePanama(`${anio}-01-01`, `${anio}-12-31`);
  const filas = await leerTodoPaginado<FilaContado>("switch_facturas (contado)", (pedirCount, a, b) =>
    supabaseServer
      .from("switch_facturas")
      .select("id, empresa_key, cliente_switch_id, cliente_nombre, subtotal_descuento", pedirCount ? { count: "exact" } : {})
      .in("empresa_key", [...empresas])
      .in("tipo_comprobante", [...TIPOS_SIN_REPORTE_DE_UTILIDAD])
      .gte("fecha", ini)
      .lt("fecha", fin)
      .order("id", { ascending: true })
      .range(a, b));
  return filas.map((f) => ({
    empresaKey: f.empresa_key,
    clienteSwitchId: f.cliente_switch_id,
    cliente: f.cliente_nombre,
    monto: num(f.subtotal_descuento),
  }));
}

/**
 * Desde cuándo hay filas en una tabla (opcionalmente de una empresa): la fecha
 * más vieja, `AAAA-MM-DD`. `null` si no hay filas o si la lectura falla —
 * ante la duda, no se afirma un «desde».
 */
export async function primeraFecha(
  tabla: "switch_articulo_diario" | "switch_factura_utilidad",
  empresa?: string,
): Promise<string | null> {
  try {
    const base = supabaseServer.from(tabla).select("fecha");
    const { data, error } = await (empresa ? base.eq("empresa_key", empresa) : base)
      .order("fecha", { ascending: true })
      .limit(1);
    if (error) {
      console.error(`[ventas/una-sola-venta] primera fecha de ${tabla}: ${error.message}`);
      return null;
    }
    const f = (data as Array<{ fecha: string | null }> | null)?.[0]?.fecha ?? null;
    return typeof f === "string" && f.length >= 10 ? f.slice(0, 10) : null;
  } catch (e) {
    console.error(`[ventas/una-sola-venta] primera fecha de ${tabla}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** El código de cada cliente de Switch, por (empresa, id): para marcar el
 *  mostrador cuando la RPC no lo trae. Falla abierta a un mapa vacío. */
export async function codigosDeClientes(
  empresas: readonly string[],
  ids: readonly number[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const filas = await leerTodoPaginado<{ id: string; empresa_key: string; cliente_switch_id: number; codigo: string | null }>(
      "switch_clientes (códigos)",
      (pedirCount, a, b) =>
        supabaseServer
          .from("switch_clientes")
          .select("id, empresa_key, cliente_switch_id, codigo", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", [...empresas])
          .in("cliente_switch_id", [...ids])
          .order("id", { ascending: true })
          .range(a, b),
    );
    for (const f of filas) if (f.codigo) out.set(`${f.empresa_key}|${f.cliente_switch_id}`, f.codigo);
  } catch (e) {
    console.error("[ventas/una-sola-venta] códigos de clientes:", e instanceof Error ? e.message : e);
  }
  return out;
}
