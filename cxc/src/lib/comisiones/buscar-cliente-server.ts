// Comisiones › «Buscar cliente»: la lectura (SOLO LEE). Las reglas, en `buscar-cliente.ts`.
// Recibe el cliente de Supabase para que la verificación contra producción
// (`scripts/_verif-comisiones-buscar-cliente.ts`) corra exactamente esto.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  comisionPagable,
  comisionPorVendedor,
  resultadoFactura,
  resultadoRecibo,
  type ComisionVendedor,
  type Resultado,
} from "@/lib/comisiones/buscar-cliente";

export interface FilaBusqueda extends Resultado {
  fecha: string;
  empresa: string;
  comprobante?: string;
  tipo?: string;
  vendedor: string;
  monto: number;
  tasa: number;
}

export interface ClienteBusqueda {
  codigo: string;
  nombre: string;
  facturas: FilaBusqueda[];
  cobros: FilaBusqueda[];
  por_vendedor: ComisionVendedor[];
  comision_pagable: number;
}

/** Máximo de clientes distintos por búsqueda. */
const MAX_CLIENTES = 5;

export async function buscarClienteEnComisiones(
  sb: SupabaseClient,
  p: { q: string; inicio: string; fin: string; empresas: readonly string[] },
): Promise<ClienteBusqueda[]> {
  const empresas = [...p.empresas];
  // 1. Quién es el cliente: por CÓDIGO exacto o por nombre (contiene). La identidad es el código.
  const patron = p.q.replace(/[%_,()*]/g, " ").trim();
  if (patron.length < 2) return [];
  const { data: cli, error: e1 } = await sb
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id, codigo, nombre")
    .in("empresa_key", empresas)
    .or(`codigo.ilike.${patron},nombre.ilike.%${patron}%`)
    .limit(500);
  if (e1) throw e1;
  const porCodigo = new Map<string, { codigo: string; nombre: string; ids: { empresa: string; id: number }[] }>();
  for (const c of cli ?? []) {
    const k = String(c.codigo ?? "").trim().toUpperCase();
    if (!k) continue;
    const g = porCodigo.get(k) ?? { codigo: k, nombre: String(c.nombre ?? k), ids: [] as { empresa: string; id: number }[] };
    g.ids.push({ empresa: c.empresa_key, id: c.cliente_switch_id });
    porCodigo.set(k, g);
  }
  const grupos = [...porCodigo.values()].slice(0, MAX_CLIENTES);
  if (!grupos.length) return [];

  // 2. Lo que no depende del cliente: exclusiones activas y tasas.
  const [{ data: excl, error: e2 }, { data: tasas, error: e3 }] = await Promise.all([
    sb.from("comision_exclusion").select("empresa_key, cliente_codigo, vendedor, excluye_venta, excluye_cobro").eq("activa", true),
    sb.from("comision_vendedor_tasa").select("vendedor_nombre, tasa_venta, tasa_cobro"),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;
  const canon = new Map<string, string>();
  const canonico = async (n: string | null): Promise<string> => {
    const k = (n ?? "").trim();
    if (!canon.has(k)) {
      const { data, error } = await sb.rpc("comision_vendedor_canonico", { p_nombre: k });
      if (error) throw error;
      canon.set(k, String(data ?? k));
    }
    return canon.get(k)!;
  };
  const tasa = (v: string, campo: "tasa_venta" | "tasa_cobro") => {
    const t = (tasas ?? []).find((x) => x.vendedor_nombre === v);
    return t ? Number(t[campo]) : 0.005;
  };
  const excluido = (empresa: string, codigo: string, vendedor: string, campo: "excluye_venta" | "excluye_cobro") =>
    (excl ?? []).some((e) => e.empresa_key === empresa && String(e.cliente_codigo).trim().toUpperCase() === codigo && e[campo] &&
      (e.vendedor === "*" || e.vendedor === vendedor.toUpperCase()));

  const clientes: ClienteBusqueda[] = [];
  for (const g of grupos) {
    const facturas: FilaBusqueda[] = [];
    const cobros: FilaBusqueda[] = [];
    for (const empresa of empresas) {
      const ids = g.ids.filter((x) => x.empresa === empresa).map((x) => x.id);
      if (!ids.length) continue;
      const [{ data: fu, error: e4 }, { data: rc, error: e5 }] = await Promise.all([
        sb.from("switch_factura_utilidad")
          .select("fecha, secuencial, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad")
          .eq("empresa_key", empresa).in("cliente_switch_id", ids).gte("fecha", p.inicio).lte("fecha", p.fin)
          .order("fecha").order("secuencial").limit(1000),
        sb.from("switch_recibos")
          .select("fecha, cliente_codigo, vendedor_registro, total, es_retencion")
          .eq("empresa_key", empresa).ilike("cliente_codigo", g.codigo).gte("fecha", p.inicio).lte("fecha", p.fin)
          .order("fecha").limit(1000),
      ]);
      if (e4) throw e4;
      if (e5) throw e5;
      // Vendedor de la FACTURA (switch_facturas, el más reciente por secuencial), como la RPC.
      const sec = (fu ?? []).map((f) => f.secuencial);
      const { data: sf, error: e6 } = sec.length
        ? await sb.from("switch_facturas").select("secuencial, vendedor_nombre, fecha").eq("empresa_key", empresa).in("secuencial", sec)
        : { data: [], error: null };
      if (e6) throw e6;
      const vendFactura = new Map<string, string>();
      for (const s of [...(sf ?? [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) vendFactura.set(s.secuencial, s.vendedor_nombre);
      for (const f of fu ?? []) {
        const vendedor = await canonico(vendFactura.get(f.secuencial) ?? f.vendedor);
        const t = tasa(vendedor, "tasa_venta");
        const r = resultadoFactura({
          tipo: f.tipo_comprobante, cliente: f.cliente, pctUtilidad: f.pct_utilidad == null ? null : Number(f.pct_utilidad),
          subtotal: Number(f.subtotal_con_descuento), vendedor, excluido: excluido(empresa, g.codigo, vendedor, "excluye_venta"), tasa: t,
        });
        facturas.push({ fecha: f.fecha, empresa, comprobante: f.secuencial, tipo: f.tipo_comprobante, vendedor, monto: Number(f.subtotal_con_descuento), tasa: t, ...r });
      }
      for (const x of rc ?? []) {
        const vendedor = await canonico(x.vendedor_registro);
        const t = tasa(vendedor, "tasa_cobro");
        const r = resultadoRecibo({
          esRetencion: !!x.es_retencion, clienteCodigo: String(x.cliente_codigo ?? ""), total: Number(x.total), vendedor,
          excluido: excluido(empresa, g.codigo, vendedor, "excluye_cobro"), tasa: t,
        });
        cobros.push({ fecha: x.fecha, empresa, vendedor, monto: Number(x.total), tasa: t, ...r });
      }
    }
    const orden = (a: { fecha: string }, b: { fecha: string }) => String(a.fecha).localeCompare(String(b.fecha));
    const porVendedor = comisionPorVendedor(facturas, cobros);
    clientes.push({
      codigo: g.codigo, nombre: g.nombre,
      facturas: facturas.sort(orden), cobros: cobros.sort(orden),
      por_vendedor: porVendedor, comision_pagable: comisionPagable(porVendedor),
    });
  }
  return clientes;
}
