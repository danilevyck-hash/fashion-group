// ============================================================================
// LAS TIENDAS DE MARKETING PARA LA BÚSQUEDA GLOBAL (⌘K) — lado servidor.
//
// 🔴 Se leen las tiendas que TIENEN gasto, con su nombre del directorio por
// CÓDIGO (`clientes_master.codigo`), nunca por nombre. El cajón «General»
// (los gastos sin tienda: impulsadoras, muebles de Boston) también aparece
// cuando se escribe su nombre.
//
// 🔴 El filtro por lo escrito lo hace `marketing.ts › buscarTiendas` (por
// palabra, medido). Acá solo se lee y se suma lo que SE REPORTA.
//
// 🔴 Falla ABIERTA: sin las columnas del rediseño, o ante cualquier tropiezo
// de lectura, devuelve lista vacía — la búsqueda global no se cae por esto.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { esColumnaAusente } from "@/lib/marketing/columnas-opcionales";
import { seReportaDe, TIENDA_GENERAL } from "@/lib/marketing/gasto";
import { buscarTiendas, type TiendaDeMarketing } from "./marketing";

type Fila = Record<string, unknown>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buscarTiendasDeMarketing(
  consulta: string,
  max = 5,
): Promise<TiendaDeMarketing[]> {
  const q = String(consulta ?? "").trim();
  if (q.length < 2) return [];
  try {
    const [facturasRes, entregasRes] = await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select("total, tienda_codigo, se_reporta")
        .is("anulado_en", null),
      supabaseServer
        .from("mk_entregas_muebles")
        .select("total, tienda_codigo, se_reporta"),
    ]);
    if (facturasRes.error || entregasRes.error) {
      const err = facturasRes.error ?? entregasRes.error;
      if (err && esColumnaAusente(err)) return [];
      throw new Error(err?.message ?? "Error leyendo Marketing");
    }

    const porCodigo = new Map<string, { codigo: string | null; gastos: number; monto: number }>();
    const acumular = (fila: Fila) => {
      const crudo = String(fila.tienda_codigo ?? "").trim().toUpperCase();
      const clave = crudo.length > 0 ? crudo : "";
      const actual = porCodigo.get(clave) ?? {
        codigo: crudo.length > 0 ? crudo : null,
        gastos: 0,
        monto: 0,
      };
      actual.gastos += 1;
      if (seReportaDe(fila.se_reporta)) {
        const n = Number(fila.total);
        if (Number.isFinite(n)) actual.monto += n;
      }
      porCodigo.set(clave, actual);
    };
    for (const f of (facturasRes.data ?? []) as Fila[]) acumular(f);
    for (const e of (entregasRes.data ?? []) as Fila[]) acumular(e);

    const codigos = [...porCodigo.values()]
      .map((v) => v.codigo)
      .filter((c): c is string => typeof c === "string");
    const nombrePorCodigo = new Map<string, string>();
    if (codigos.length > 0) {
      const { data } = await supabaseServer
        .from("clientes_master")
        .select("codigo, nombre")
        .in("codigo", codigos);
      for (const c of (data ?? []) as Fila[]) {
        const nombre = String(c.nombre ?? "").trim();
        if (nombre.length > 0) nombrePorCodigo.set(String(c.codigo), nombre);
      }
    }

    const tiendas: TiendaDeMarketing[] = [...porCodigo.values()].map((v) => ({
      codigo: v.codigo,
      nombre: v.codigo ? (nombrePorCodigo.get(v.codigo) ?? v.codigo) : TIENDA_GENERAL,
      gastos: v.gastos,
      monto: round2(v.monto),
    }));
    return buscarTiendas(q, tiendas, max);
  } catch (err) {
    console.error(
      "[search/marketing] no se pudieron leer las tiendas:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
