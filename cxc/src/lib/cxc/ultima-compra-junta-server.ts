// Lecturas de la «última compra» junta (`ULTIMA_COMPRA_JUNTA_2026_11`): la
// historia de facturas y notas de crédito de unos clientes, para el CXC (solo
// los que su último día dio cero o negativo) y para la ficha del cliente.
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  TIPOS_DE_LA_COMPRA,
  ultimaCompraPositiva,
  juntarDelDiaMasReciente,
  type CompraJunta,
  type DocumentoLeido,
} from "@/lib/cxc/ultima-compra-junta";

interface FilaLeida {
  empresa_key: string;
  cliente_switch_id: number;
  fecha: string;
  tipo_comprobante: string;
  secuencial: string;
  total: number;
}

/** Toda la historia (facturas y NC) de esos clientes en esa empresa. */
export async function documentosDeClientes(empresa: string, ids: number[]): Promise<DocumentoLeido[]> {
  if (ids.length === 0) return [];
  const filas = await leerTodoPaginado<FilaLeida>("switch_facturas (última compra junta)", (pedirCount, from, to) =>
    supabaseServer
      .from("switch_facturas")
      .select("empresa_key,cliente_switch_id,fecha,tipo_comprobante,secuencial,total", pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", empresa)
      .in("cliente_switch_id", ids)
      .in("tipo_comprobante", [...TIPOS_DE_LA_COMPRA])
      .order("id", { ascending: true })
      .range(from, to),
  );
  return filas.map((f) => ({ ...f, tipo: f.tipo_comprobante }));
}

/** La última compra positiva de cada cliente de esa empresa, por `cliente_switch_id`. */
export async function ultimasComprasPositivas(empresa: string, ids: number[]): Promise<Map<number, CompraJunta>> {
  const docs = await documentosDeClientes(empresa, ids);
  const porCliente = new Map<number, DocumentoLeido[]>();
  for (const d of docs) {
    const l = porCliente.get(d.cliente_switch_id) ?? [];
    l.push(d);
    porCliente.set(d.cliente_switch_id, l);
  }
  const out = new Map<number, CompraJunta>();
  for (const [id, l] of porCliente) {
    const c = ultimaCompraPositiva(l);
    if (c) out.set(id, c);
  }
  return out;
}

/**
 * La última compra del GRUPO para la ficha: el día más reciente entre las 6
 * empresas; si ese día compró en varias, se suman (es lo que compró ese día).
 */
export async function ultimaCompraDelCodigo(codigo: string): Promise<CompraJunta | null> {
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo)
    .in("empresa_key", [...B2B_EMPRESA_KEYS]);
  if (error) throw new Error(`switch_clientes (ficha, última compra): ${error.message}`);
  const porEmpresa = new Map<string, number[]>();
  for (const p of data ?? []) {
    if (typeof p.cliente_switch_id !== "number") continue;
    porEmpresa.set(p.empresa_key, [...(porEmpresa.get(p.empresa_key) ?? []), p.cliente_switch_id]);
  }
  const compras: CompraJunta[] = [];
  for (const [empresa, ids] of porEmpresa) {
    for (const c of (await ultimasComprasPositivas(empresa, ids)).values()) compras.push(c);
  }
  return juntarDelDiaMasReciente(compras);
}
