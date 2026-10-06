// Ventas › Clientes con «Rango de fechas» (Daniel, 5-oct-2026).
//
// La MISMA cuenta que `clientes_anio` (migración 20260909120000), con fechas en
// vez de un año: venta firmada de `switch_facturas` (las NC restan), la
// identidad es el CÓDIGO (`switch_clientes` → `clientes_master`), el mostrador
// `TCKCTA` pasa y los nombres de casa se apartan. El comparativo son los MISMOS
// días del año pasado (29-feb → 28-feb). Sin migración: lecturas paginadas,
// como la consulta por fechas de Comisiones. Solo las 6 del grupo.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import { mismosDiasAnioPasado, sumarDias } from "@/lib/comisiones/vendedores-rango";

/** Las filas con la forma de `clientes_anio`, para el mismo armado de pantalla. */
export interface FilaClienteRango {
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_codigo: string | null;
  empresa: string | null;
  compras_ytd: number;
  compras_anio_anterior: number;
  delta_vs_2025: number | null;
  ultima_compra: string | null;
  whatsapp: string | null;
  empresas_count: number;
  empresas_breakdown: { empresa: string; monto: number }[] | null;
}

export interface FacturaCliente {
  empresa_key: string;
  cliente_switch_id: number | string | null;
  cliente_nombre: string | null;
  tipo_comprobante: string;
  subtotal_descuento: number | string | null;
  fecha: string;
}

export interface MaestroCliente {
  id: string;
  codigo: string;
  nombre: string | null;
  celular: string | null;
  telefono: string | null;
}

const NOMBRES_FUERA = new Set([
  "CONFECCIONES BOSTON", "MULTI FASHION HOLDING", "MULTIFASHION", "BOSTON",
  "CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)",
]);

/** El mismo `c_norm` del SQL: mayúsculas, sin puntos ni comas, espacios simples. */
export function nombreNormalizado(nombre: string | null | undefined): string {
  const n = String(nombre ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  return n || "(Sin nombre)";
}

/** `switch_facturas.fecha` es timestamptz; el día es el de Panamá (UTC−5 fijo). */
const diaPanama = (ts: string) => new Date(Date.parse(ts) - 5 * 3_600_000).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * PURO: arma las filas como `clientes_anio`. `actual` y `previo` son las
 * facturas de cada rango; `codigoDe` es el puente (empresa|id de Switch → código).
 */
export function armarFilasRango(args: {
  actual: readonly FacturaCliente[];
  previo: readonly FacturaCliente[];
  codigoDe: ReadonlyMap<string, string>;
  maestro: ReadonlyMap<string, MaestroCliente>;
  empresa: string | null;
}): FilaClienteRango[] {
  const todas = !args.empresa || args.empresa === "todas";
  interface Par { empresa: string; codigo: string | null; norm: string; actual: number; previo: number; ultima: string | null; ultimaPrevio: string | null }
  const pares = new Map<string, Par>();
  const sumar = (f: FacturaCliente, enActual: boolean) => {
    if (f.cliente_nombre == null) return;
    if (!todas && f.empresa_key !== args.empresa) return;
    const codigo = args.codigoDe.get(`${f.empresa_key}|${f.cliente_switch_id}`) ?? null;
    const norm = nombreNormalizado(f.cliente_nombre);
    if (codigo !== "TCKCTA" && NOMBRES_FUERA.has(norm)) return;
    const k = `${codigo ?? `~${norm}`}|${f.empresa_key}`;
    const p = pares.get(k) ?? { empresa: f.empresa_key, codigo: null, norm, actual: 0, previo: 0, ultima: null, ultimaPrevio: null };
    if (codigo && (!p.codigo || codigo > p.codigo)) p.codigo = codigo;
    if (norm < p.norm) p.norm = norm;
    const monto = signoVenta(f.tipo_comprobante) * Number(f.subtotal_descuento ?? 0);
    const dia = diaPanama(f.fecha);
    if (enActual) {
      p.actual += monto;
      if (!p.ultima || dia > p.ultima) p.ultima = dia;
    } else {
      p.previo += monto;
      if (!p.ultimaPrevio || dia > p.ultimaPrevio) p.ultimaPrevio = dia;
    }
    pares.set(k, p);
  };
  for (const f of args.actual) sumar(f, true);
  for (const f of args.previo) sumar(f, false);

  // Como la vista del año en curso: quien compró en el rango O en los mismos días
  // del año pasado (el que no volvió sale con $0 y va a «sin compras en el rango»).
  const porEmpresa = [...pares.values()].map((p): FilaClienteRango => {
    const m = p.codigo ? args.maestro.get(p.codigo) : undefined;
    const actual = r2(p.actual), previo = r2(p.previo);
    return {
      cliente_id: m?.id ?? null,
      cliente_nombre: m?.nombre ?? p.norm,
      cliente_codigo: m?.codigo ?? p.codigo ?? "—",
      empresa: p.empresa,
      compras_ytd: actual,
      compras_anio_anterior: previo,
      delta_vs_2025: previo > 0 ? (actual - previo) / previo : null,
      ultima_compra: p.ultima ?? p.ultimaPrevio,
      whatsapp: (m?.celular || m?.telefono) || null,
      empresas_count: 1,
      empresas_breakdown: null,
    };
  });

  const filas = todas ? unaFilaPorCliente(porEmpresa) : porEmpresa;
  return filas.sort((a, b) => (b.ultima_compra ?? "").localeCompare(a.ultima_compra ?? ""));
}

/**
 * PURO: «Todas» = la suma de cada empresa por separado. Una fila por
 * (cliente_id, nombre), en la empresa que más le vendió, con compras, año
 * anterior, Δ, última compra y desglose de TODAS sus empresas. Lo usan el rango
 * y los años CERRADOS: 🩸 la RPC `clientes_anio(año, NULL)` filtraba la empresa
 * principal en el WHERE, ANTES de sus SUM() OVER, y cada cliente salía solo con
 * la venta de su principal (5-oct-2026).
 */
export function unaFilaPorCliente(porEmpresa: readonly FilaClienteRango[]): FilaClienteRango[] {
  const grupos = new Map<string, FilaClienteRango[]>();
  for (const f of porEmpresa) {
    const k = `${f.cliente_id ?? ""}|${f.cliente_nombre}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.values()].map((g): FilaClienteRango => {
    const orden = [...g].sort((a, b) => b.compras_ytd - a.compras_ytd);
    const actual = r2(g.reduce((s, f) => s + f.compras_ytd, 0));
    const previo = r2(g.reduce((s, f) => s + f.compras_anio_anterior, 0));
    return {
      ...orden[0],
      compras_ytd: actual,
      compras_anio_anterior: previo,
      delta_vs_2025: previo > 0 ? (actual - previo) / previo : null,
      ultima_compra: g.reduce<string | null>((u, f) => (f.ultima_compra && (!u || f.ultima_compra > u) ? f.ultima_compra : u), null),
      empresas_count: g.length,
      empresas_breakdown: orden.map(f => ({ empresa: f.empresa ?? "", monto: f.compras_ytd })),
    };
  });
}

const inicioPanama = (iso: string) => `${iso}T00:00:00-05:00`;

function leerFacturas(desde: string, hasta: string): Promise<FacturaCliente[]> {
  return leerTodoPaginado<FacturaCliente>(
    "switch_facturas (clientes por rango)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("switch_facturas")
        .select("empresa_key, cliente_switch_id, cliente_nombre, tipo_comprobante, subtotal_descuento, fecha", pedirCount ? { count: "exact" } : {})
        .in("empresa_key", B2B_EMPRESA_KEYS as unknown as string[])
        .not("cliente_nombre", "is", null)
        .gte("fecha", inicioPanama(desde))
        .lt("fecha", inicioPanama(sumarDias(hasta, 1)))
        .order("id", { ascending: true })
        .range(a, b),
  );
}

/** SERVIDOR: las filas de Ventas › Clientes entre dos fechas y el período contra el que compara. */
export async function filasClientesRango(desde: string, hasta: string, empresa: string | null): Promise<{
  filas: FilaClienteRango[];
  anterior: { desde: string; hasta: string };
}> {
  const anterior = mismosDiasAnioPasado(desde, hasta);
  const [actual, previo, puentes] = await Promise.all([
    leerFacturas(desde, hasta),
    leerFacturas(anterior.desde, anterior.hasta),
    leerTodoPaginado<{ empresa_key: string; cliente_switch_id: number | string; codigo: string | null }>(
      "switch_clientes (clientes por rango)",
      (pedirCount, a, b) =>
        supabaseServer
          .from("switch_clientes")
          .select("empresa_key, cliente_switch_id, codigo", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", B2B_EMPRESA_KEYS as unknown as string[])
          .order("empresa_key", { ascending: true })
          .order("cliente_switch_id", { ascending: true })
          .range(a, b),
    ),
  ]);
  const codigoDe = new Map<string, string>();
  for (const p of puentes) if (p.codigo) codigoDe.set(`${p.empresa_key}|${p.cliente_switch_id}`, p.codigo);

  const codigos = [...new Set([...actual, ...previo].map(f => codigoDe.get(`${f.empresa_key}|${f.cliente_switch_id}`)).filter((c): c is string => !!c))];
  const maestro = new Map<string, MaestroCliente>();
  for (let i = 0; i < codigos.length; i += 300) {
    const { data, error } = await supabaseServer
      .from("clientes_master")
      .select("id, codigo, nombre, celular, telefono")
      .eq("deleted", false)
      .in("codigo", codigos.slice(i, i + 300));
    if (error) throw new Error(`clientes_master (clientes por rango): ${error.message}`);
    for (const m of (data ?? []) as MaestroCliente[]) maestro.set(m.codigo, m);
  }
  return { filas: armarFilasRango({ actual, previo, codigoDe, maestro, empresa }), anterior };
}
