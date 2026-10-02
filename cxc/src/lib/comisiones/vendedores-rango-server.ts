// Lecturas del rango de Vendedores (ver `vendedores-rango.ts`). Sin migración:
// la comisión del grupo sale de las RPC que ya existen y las ventas, de
// lecturas paginadas (`leerTodoPaginado`) de `switch_facturas` y de la vista de
// Multifashion.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerComision } from "./rpc";
import { EMPRESAS_COMISIONAN } from "./empresas";
import { aplicarAlias, claveAlias, type AliasVendedor } from "./alias";
import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import {
  comisionDeDetalle,
  piezasPorMes,
  sumarDias,
  vendedorasDeFilas,
  type DetalleComision,
  type FilaMultifashion,
  type FilaRango,
} from "./vendedores-rango";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Inicio del día en Panamá (UTC−5 fijo): `switch_facturas.fecha` es timestamptz. */
const inicioPanama = (iso: string) => `${iso}T00:00:00-05:00`;

function sumarEn(m: Map<string, FilaRango>, empresa: string, vendedor: string, ventas: number, comision: number) {
  const k = `${empresa}|${claveAlias(vendedor)}`;
  const x = m.get(k) ?? { empresa_key: empresa, vendedor, ventas: 0, comision: 0 };
  x.ventas = round2(x.ventas + ventas);
  x.comision = round2(x.comision + comision);
  m.set(k, x);
}

/** Comisión del grupo por (empresa, vendedor): mes entero → RPC; mes partido → su detalle recortado. */
async function comisionGrupo(desde: string, hasta: string, m: Map<string, FilaRango>) {
  const piezas = piezasPorMes(desde, hasta);
  await Promise.all(
    EMPRESAS_COMISIONAN.flatMap((empresa) =>
      piezas.map(async (p) => {
        const { data, error } = await leerComision(empresa, p.year, p.mes);
        if (error || !data) throw new Error(`comisión ${empresa} ${p.year}-${p.mes}: ${error?.message ?? "sin datos"}`);
        const conMovimiento = data.vendedores.filter((v) => Number(v.base) !== 0 || Number(v.base_cobro) !== 0);
        if (p.entero) {
          for (const v of data.vendedores) sumarEn(m, empresa, v.vendedor, 0, Number(v.comision_total));
          return;
        }
        await Promise.all(
          conMovimiento.map(async (v) => {
            const det = await supabaseServer.rpc("comision_b2b_detalle", {
              p_empresa_key: empresa, p_year: p.year, p_mes: p.mes, p_vendedor: v.vendedor,
            });
            if (det.error) throw new Error(`detalle ${empresa} ${v.vendedor}: ${det.error.message}`);
            const d = det.data as DetalleComision;
            sumarEn(m, empresa, v.vendedor, 0, comisionDeDetalle(
              { tasa_venta: d.tasa_venta, tasa_cobro: d.tasa_cobro, ventas: d.ventas ?? [], cobros: d.cobros ?? [] },
              p.desde, p.hasta,
            ));
          }),
        );
      }),
    ),
  );
}

/** Ventas del grupo por (empresa, vendedor): lo facturado, las notas de crédito restan. */
async function ventasGrupo(desde: string, hasta: string, m: Map<string, FilaRango>) {
  const [alias, facturas] = await Promise.all([
    supabaseServer.from("comision_vendedor_alias").select("nombre_switch, vendedor_canonico"),
    leerTodoPaginado<{ empresa_key: string; vendedor_nombre: string | null; tipo_comprobante: string; subtotal_descuento: number }>(
      "switch_facturas (vendedores por rango)",
      (pedirCount, a, b) =>
        supabaseServer
          .from("switch_facturas")
          .select("empresa_key, vendedor_nombre, tipo_comprobante, subtotal_descuento", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", EMPRESAS_COMISIONAN as unknown as string[])
          .gte("fecha", inicioPanama(desde))
          .lt("fecha", inicioPanama(sumarDias(hasta, 1)))
          .order("id", { ascending: true })
          .range(a, b),
    ),
  ]);
  if (alias.error) throw new Error(`alias de vendedor: ${alias.error.message}`);
  const lista = (alias.data ?? []) as AliasVendedor[];
  for (const f of facturas) {
    const vendedor = aplicarAlias(f.vendedor_nombre, lista);
    if (!vendedor) continue;
    sumarEn(m, f.empresa_key, vendedor, signoVenta(f.tipo_comprobante) * Number(f.subtotal_descuento ?? 0), 0);
  }
}

export async function leerRangoGrupo(desde: string, hasta: string): Promise<FilaRango[]> {
  const m = new Map<string, FilaRango>();
  await Promise.all([comisionGrupo(desde, hasta, m), ventasGrupo(desde, hasta, m)]);
  return [...m.values()];
}

export async function leerRangoMultifashion(desde: string, hasta: string): Promise<FilaRango[]> {
  const filas = await leerTodoPaginado<FilaMultifashion>(
    "_multifashion_sf_vw (vendedoras por rango)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("_multifashion_sf_vw")
        .select("vendedor, vendedor_canonico, subtotal, subtotal_comision", pedirCount ? { count: "exact" } : {})
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("n_sistema", { ascending: true })
        .range(a, b),
  );
  return vendedorasDeFilas(filas);
}
