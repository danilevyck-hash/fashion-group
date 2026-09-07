// ─────────────────────────────────────────────────────────────────────────────
// Lógica del módulo Proveedores (CxP). Lee `switch_proveedor_estadocuenta`
// (**65 filas**, medidas el 6-sep-2026) y agrupa por proveedor entre empresas.
//
// 🔴 QUIÉN ES QUIÉN LO DECIDE `aplicarAmarre`, en `@/lib/proveedores/identidad`,
// y NADIE MÁS. Sin amarre escrito a mano la clave sigue siendo el nombre
// normalizado, exactamente como antes; con amarre, las grafías de un mismo
// proveedor caen en una sola fila. La cédula NUNCA agrupa: de los seis grupos
// de filas que la comparten, tres son empresas distintas (ver `NO_SON_EL_MISMO`).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { condenseAging } from "@/lib/proveedores-aging";
import { derivarProveedor, type ElementoLedger } from "@/lib/proveedores-derivados";
import {
  aplicarAmarre,
  indexarAmarres,
  normProvName,
  type AmarreProveedor,
} from "@/lib/proveedores/identidad";

export { normProvName };
export type { AmarreProveedor };

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
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
  synced_at: string | null;
}

export const AGING_BUCKETS = [
  "0-30", "31-60", "61-90", "91-120", "121-180", "181-270", "271-365", "Mas de 365",
] as const;

// Las columnas comprado_ytd / pagado_ytd / num_facturas / num_pagos siguen
// EXISTIENDO en la tabla pero ya no se leen ni se escriben (ver la migración
// 20260727200000): eran el ledger podado. No volver a agregarlas a este select.
const COLS =
  "empresa_key,proveedor_switch_id,codigo,nombre,identificacion,dv,direccion,contacto,telefono,celular,email,tipo_proveedor,saldo_total,aging,ultimo_pago_monto,ultimo_pago_fecha,ultimo_pago_dias,synced_at,elements";

/**
 * "Último pago" se RECALCULA acá desde `elements`, la misma columna que el sync
 * ya guarda.
 *
 * Por qué no basta con leer la columna guardada: "hace N días" se congelaba en
 * el instante del sync, que corre 1×/día (09:30 UTC). Calculado al leer, siempre
 * es el número de hoy. Es la MISMA función que usa el sync, así que no hay dos
 * verdades posibles.
 */
export async function fetchAllProveedorRows(): Promise<ProveedorRow[]> {
  const { data, error } = await supabaseServer
    .from("switch_proveedor_estadocuenta")
    .select(COLS);
  if (error) throw new Error(`switch_proveedor_estadocuenta: ${error.message}`);
  return (data ?? []).map((r) => {
    const { elements, ...row } = r as ProveedorRow & { elements?: ElementoLedger[] };
    return { ...row, ...derivarProveedor(elements) } as ProveedorRow;
  });
}

export interface ProveedorListItem {
  key: string;            // la clave del proveedor (amarre o nombre normalizado)
  nombre: string;         // display
  saldo_total: number;    // suma (o de la empresa filtrada)
  empresas: string[];     // DE QUÉ EMPRESAS viene, en orden de saldo
  empresas_count: number;
  ultimo_pago_dias: number | null; // el más reciente entre empresas
  // Aging condensado al vocabulario CXC (suma de los buckets reales de Switch).
  aging_current: number;  // 0-90d (por vencer)
  aging_watch: number;    // 91-120d (vencido reciente)
  aging_overdue: number;  // 121d+ (vencido crítico)
}

/**
 * El nombre que se muestra. El amarre manda si trae uno escrito a mano; si no,
 * la grafía más larga de las que llegaron (la regla de siempre), con los
 * espacios repetidos colapsados — Switch manda «CONFECCIONES BOSTON  S.A» con
 * dos espacios y eso no se enseña.
 */
function nombreParaMostrar(rs: readonly ProveedorRow[], escrito: string | null): string {
  if (escrito) return escrito;
  const largo = rs.map((r) => r.nombre).sort((a, b) => b.length - a.length)[0] ?? "";
  return largo.replace(/\s+/g, " ").trim();
}

/** Agrupa las filas por proveedor resuelto. Usada por la lista y por la ficha. */
function agrupar(
  rows: readonly ProveedorRow[],
  amarres: readonly AmarreProveedor[],
): Map<string, { filas: ProveedorRow[]; nombreEscrito: string | null }> {
  const indice = indexarAmarres(amarres);
  const byKey = new Map<string, { filas: ProveedorRow[]; nombreEscrito: string | null }>();
  for (const r of rows) {
    const { clave, nombreMostrado } = aplicarAmarre(r, indice);
    const actual = byKey.get(clave);
    if (actual) {
      actual.filas.push(r);
      actual.nombreEscrito = actual.nombreEscrito ?? nombreMostrado;
    } else {
      byKey.set(clave, { filas: [r], nombreEscrito: nombreMostrado });
    }
  }
  return byKey;
}

/** Lista agrupada por proveedor. empresa=filtra a esa empresa; q=busca por nombre. */
export function buildList(
  rows: ProveedorRow[],
  opts: { empresa?: string | null; q?: string | null; amarres?: readonly AmarreProveedor[] },
): { proveedores: ProveedorListItem[]; total: number; grupo_saldo: number } {
  const filtered = opts.empresa ? rows.filter((r) => r.empresa_key === opts.empresa) : rows;

  let items: ProveedorListItem[] = [...agrupar(filtered, opts.amarres ?? []).entries()].map(
    ([key, { filas: rs, nombreEscrito }]) => {
      const dias = rs.map((r) => r.ultimo_pago_dias).filter((d): d is number => d != null);
      const aging = condenseAging(rs.flatMap((r) => r.aging ?? []));
      // De qué empresas viene, la de más saldo primero: es lo que contesta
      // «¿y las otras dónde están?» sin abrir la ficha.
      const porEmpresa = new Map<string, number>();
      for (const r of rs) {
        porEmpresa.set(r.empresa_key, (porEmpresa.get(r.empresa_key) ?? 0) + Number(r.saldo_total));
      }
      const empresas = [...porEmpresa.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([e]) => e);
      return {
        key,
        nombre: nombreParaMostrar(rs, nombreEscrito),
        saldo_total: round2(rs.reduce((s, r) => s + Number(r.saldo_total), 0)),
        empresas,
        empresas_count: empresas.length,
        ultimo_pago_dias: dias.length ? Math.min(...dias) : null,
        aging_current: aging.current,
        aging_watch: aging.watch,
        aging_overdue: aging.overdue,
      };
    },
  );

  const q = normProvName(opts.q);
  // 🔴 El buscador mira TODAS las grafías que cayeron en la fila, no solo la
  // que se muestra: buscar «boston» tiene que encontrar la fila aunque se
  // enseñe con otra escritura.
  if (q) {
    const grafias = agrupar(filtered, opts.amarres ?? []);
    items = items.filter((i) => {
      if (normProvName(i.nombre).includes(q)) return true;
      const g = grafias.get(i.key);
      return (g?.filas ?? []).some((r) => normProvName(r.nombre).includes(q));
    });
  }

  items.sort((a, b) => b.saldo_total - a.saldo_total);
  const grupo_saldo = round2(items.reduce((s, i) => s + i.saldo_total, 0));
  return { proveedores: items, total: items.length, grupo_saldo };
}

export interface ProveedorEmpresaTotals {
  empresa: string;
  por_pagar: number;       // saldo_total (negativo = saldo a favor)
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
}

export interface ProveedorFicha {
  key: string;
  nombre: string;
  /** Las grafías con las que llega desde Switch, cuando son más de una. */
  grafias: string[];
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
    por_pagar: number;
    aging: { title: string; saldo: number }[];
  };
  synced_at: string | null;
}

/** Las filas de UN proveedor resuelto. La ficha y los reclamos leen de acá. */
export function filasDelProveedor(
  rows: readonly ProveedorRow[],
  key: string,
  amarres: readonly AmarreProveedor[] = [],
): ProveedorRow[] {
  const indice = indexarAmarres(amarres);
  return rows.filter((r) => aplicarAmarre(r, indice).clave === key);
}

/** Ficha de un proveedor (agregado entre empresas) por su clave. */
export function buildFicha(
  rows: ProveedorRow[],
  key: string,
  amarres: readonly AmarreProveedor[] = [],
): ProveedorFicha | null {
  const indice = indexarAmarres(amarres);
  const rs = rows.filter((r) => aplicarAmarre(r, indice).clave === key);
  if (rs.length === 0) return null;
  const nombreEscrito =
    rs.map((r) => aplicarAmarre(r, indice).nombreMostrado).find((n) => n) ?? null;

  // Fiscal: la fila más completa (con más campos no-nulos).
  const score = (r: ProveedorRow) =>
    [r.identificacion, r.dv, r.direccion, r.contacto, r.telefono, r.celular, r.email].filter(Boolean).length;
  const base = [...rs].sort((a, b) => score(b) - score(a))[0];
  const nombre = nombreParaMostrar(rs, nombreEscrito);

  // Las otras maneras en que Switch escribe a este proveedor. Solo se dicen si
  // son más de una y alguna difiere de la que se muestra.
  const grafias = [...new Set(rs.map((r) => r.nombre.replace(/\s+/g, " ").trim()))]
    .filter((g) => g !== nombre)
    .sort();

  const empresas: ProveedorEmpresaTotals[] = rs
    .map((r) => ({
      empresa: r.empresa_key,
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
    grafias,
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
      por_pagar: round2(empresas.reduce((s, e) => s + e.por_pagar, 0)),
      aging,
    },
    synced_at: rs.map((r) => r.synced_at).filter(Boolean).sort().reverse()[0] ?? null,
  };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
