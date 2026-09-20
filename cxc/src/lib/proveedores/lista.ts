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
import { derivarProveedor, type ElementoLedger } from "@/lib/proveedores-derivados";
import {
  aplicarAmarre,
  indexarAmarres,
  nombreParaMostrar,
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

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 ACÁ VIVÍA `buildList` — LA LISTA DE PROVEEDORES. Se retiró el 20-sep-2026,
// cuando Daniel dio vuelta la pantalla: la lista son las EMPRESAS y cada una se
// despliega en sus proveedores. La arma `lib/proveedores/por-empresa.ts`
// (`buildPorEmpresa`), que sigue resolviendo la identidad con `aplicarAmarre` y
// con nada más.
//
// Se BORRÓ en vez de quedar rotulada, al revés de lo que se hace con las tablas
// (`mayor_lineas`) y con `lib/proveedores/rotulo.ts`: lo que hacía —condensar
// los OCHO tramos de Switch en TRES, el vocabulario de aging del CXC— es
// exactamente lo que se corrigió, así que dejarla ahí sería dejar a mano la
// función que hay que no volver a usar. Su compañera `lib/proveedores-aging.ts`
// se fue con ella, por lo mismo.
//
// `fetchAllProveedorRows` y `buildFicha` NO se tocaron: son lo que leen la
// pantalla nueva, la ficha del proveedor y los reclamos.
// ─────────────────────────────────────────────────────────────────────────────

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
