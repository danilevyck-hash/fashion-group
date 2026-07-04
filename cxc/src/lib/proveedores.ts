// ─────────────────────────────────────────────────────────────────────────────
// Lógica del módulo Proveedores (CxP). Lee switch_proveedor_estadocuenta (42 filas
// hoy) y agrupa por proveedor across-empresas. La identidad cross-empresa es el
// NOMBRE NORMALIZADO (cada empresa asigna su propio proveedor_switch_id/codigo).
//
// Caveat de identidad (igual que comisiones): nombres que difieren por palabra
// (ej. "LATIN FITNESS GROUP" vs "...GROUP INC.") NO se funden — solo se normaliza
// case/puntuación/espacios. Es el default razonable de Fase 2.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { condenseAging } from "@/lib/proveedores-aging";

export interface ProveedorRow {
  empresa_key: string;
  proveedor_switch_id: number;
  codigo: string | null;
  nombre: string;
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipo_proveedor: string | null;
  saldo_total: number;
  aging: { title: string; saldo: number }[];
  comprado_ytd: number;
  pagado_ytd: number;
  num_facturas: number;
  num_pagos: number;
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
  synced_at: string | null;
}

export const AGING_BUCKETS = [
  "0-30", "31-60", "61-90", "91-120", "121-180", "181-270", "271-365", "Mas de 365",
] as const;

/** UPPER + quita [.,] + colapsa espacios. Clave de identidad cross-empresa. */
export function normProvName(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

const COLS =
  "empresa_key,proveedor_switch_id,codigo,nombre,identificacion,dv,direccion,contacto,telefono,celular,email,tipo_proveedor,saldo_total,aging,comprado_ytd,pagado_ytd,num_facturas,num_pagos,ultimo_pago_monto,ultimo_pago_fecha,ultimo_pago_dias,synced_at";

export async function fetchAllProveedorRows(): Promise<ProveedorRow[]> {
  const { data, error } = await supabaseServer
    .from("switch_proveedor_estadocuenta")
    .select(COLS);
  if (error) throw new Error(`switch_proveedor_estadocuenta: ${error.message}`);
  return (data ?? []) as ProveedorRow[];
}

export interface ProveedorListItem {
  key: string;            // nombre normalizado (clave de la ficha)
  nombre: string;         // display (el más largo entre las variantes)
  saldo_total: number;    // suma (o de la empresa filtrada)
  comprado_ytd: number;
  empresas_count: number;
  ultimo_pago_dias: number | null; // el más reciente entre empresas
  // Aging condensado al vocabulario CXC (suma de los buckets reales de Switch).
  aging_current: number;  // 0-90d (por vencer)
  aging_watch: number;    // 91-120d (vencido reciente)
  aging_overdue: number;  // 121d+ (vencido crítico)
}

/** Lista agrupada por proveedor. empresa=filtra a esa empresa; q=busca por nombre. */
export function buildList(
  rows: ProveedorRow[],
  opts: { empresa?: string | null; q?: string | null },
): { proveedores: ProveedorListItem[]; total: number; grupo_saldo: number } {
  const filtered = opts.empresa ? rows.filter((r) => r.empresa_key === opts.empresa) : rows;

  const byKey = new Map<string, ProveedorRow[]>();
  for (const r of filtered) {
    const k = normProvName(r.nombre);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }

  let items: ProveedorListItem[] = [...byKey.entries()].map(([key, rs]) => {
    const nombre = rs.map((r) => r.nombre).sort((a, b) => b.length - a.length)[0];
    const dias = rs.map((r) => r.ultimo_pago_dias).filter((d): d is number => d != null);
    const aging = condenseAging(rs.flatMap((r) => r.aging ?? []));
    return {
      key,
      nombre,
      saldo_total: round2(rs.reduce((s, r) => s + Number(r.saldo_total), 0)),
      comprado_ytd: round2(rs.reduce((s, r) => s + Number(r.comprado_ytd), 0)),
      empresas_count: new Set(rs.map((r) => r.empresa_key)).size,
      ultimo_pago_dias: dias.length ? Math.min(...dias) : null,
      aging_current: aging.current,
      aging_watch: aging.watch,
      aging_overdue: aging.overdue,
    };
  });

  const q = normProvName(opts.q);
  if (q) items = items.filter((i) => normProvName(i.nombre).includes(q));

  items.sort((a, b) => b.saldo_total - a.saldo_total);
  const grupo_saldo = round2(items.reduce((s, i) => s + i.saldo_total, 0));
  return { proveedores: items, total: items.length, grupo_saldo };
}

export interface ProveedorEmpresaTotals {
  empresa: string;
  comprado_ytd: number;
  pagado_ytd: number;
  por_pagar: number;       // saldo_total (negativo = saldo a favor)
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
}

export interface ProveedorFicha {
  key: string;
  nombre: string;
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipo_proveedor: string | null;
  empresas: ProveedorEmpresaTotals[];
  total_grupo: {
    comprado_ytd: number;
    pagado_ytd: number;
    por_pagar: number;
    aging: { title: string; saldo: number }[];
  };
  synced_at: string | null;
}

/** Ficha de un proveedor (agregado across-empresas) por su clave normalizada. */
export function buildFicha(rows: ProveedorRow[], key: string): ProveedorFicha | null {
  const rs = rows.filter((r) => normProvName(r.nombre) === key);
  if (rs.length === 0) return null;

  // Fiscal: la fila más completa (con más campos no-nulos).
  const score = (r: ProveedorRow) =>
    [r.identificacion, r.dv, r.direccion, r.contacto, r.telefono, r.celular, r.email].filter(Boolean).length;
  const base = [...rs].sort((a, b) => score(b) - score(a))[0];
  const nombre = rs.map((r) => r.nombre).sort((a, b) => b.length - a.length)[0];

  const empresas: ProveedorEmpresaTotals[] = rs
    .map((r) => ({
      empresa: r.empresa_key,
      comprado_ytd: round2(Number(r.comprado_ytd)),
      pagado_ytd: round2(Number(r.pagado_ytd)),
      por_pagar: round2(Number(r.saldo_total)),
      ultimo_pago_monto: r.ultimo_pago_monto != null ? round2(Number(r.ultimo_pago_monto)) : null,
      ultimo_pago_fecha: r.ultimo_pago_fecha,
      ultimo_pago_dias: r.ultimo_pago_dias,
    }))
    .sort((a, b) => b.por_pagar - a.por_pagar);

  // Aging del grupo: suma bucket-a-bucket en orden fijo.
  const bucketSum = new Map<string, number>();
  for (const r of rs) {
    for (const b of r.aging ?? []) {
      bucketSum.set(b.title, (bucketSum.get(b.title) ?? 0) + Number(b.saldo));
    }
  }
  const aging = AGING_BUCKETS.map((title) => ({ title, saldo: round2(bucketSum.get(title) ?? 0) }));

  return {
    key,
    nombre,
    identificacion: base.identificacion,
    dv: base.dv,
    direccion: base.direccion,
    contacto: base.contacto,
    telefono: base.telefono,
    celular: base.celular,
    email: base.email,
    tipo_proveedor: base.tipo_proveedor,
    empresas,
    total_grupo: {
      comprado_ytd: round2(empresas.reduce((s, e) => s + e.comprado_ytd, 0)),
      pagado_ytd: round2(empresas.reduce((s, e) => s + e.pagado_ytd, 0)),
      por_pagar: round2(empresas.reduce((s, e) => s + e.por_pagar, 0)),
      aging,
    },
    synced_at: rs.map((r) => r.synced_at).filter(Boolean).sort().reverse()[0] ?? null,
  };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
