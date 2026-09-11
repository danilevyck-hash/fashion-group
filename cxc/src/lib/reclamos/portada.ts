// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LA PORTADA, CALCULADA (10-sep-2026). Módulo PURO: recibe los
// reclamos, los contactos y el «hoy» de Panamá; devuelve lo que se dibuja.
//
// Tres números arriba: «Por cobrar», «Sin reclamar» (rojo) y «Cobrado <año>».
// Tarjetas por empresa ORDENADAS POR PLATA, cada una con el contacto, «el más
// viejo lleva N días» (desde la FECHA DE FACTURA), la plata por cobrar y el
// chip rojo «sin reclamar N» solo si aplica.
//
// Se retiraron «Alertas +45 días» y el chip «Alerta»: salían en 28 de 29 —
// Daniel: *«un color que sale siempre deja de avisar»*. Y no hay corte de días:
// *«nunca por perdido»*.
//
// 🩸 El contacto decía «Sin contacto» en las 5 empresas que SÍ lo tienen: la
// tarjeta leía `c.nombre` y la columna es `nombre_contacto`. Acá se lee la
// columna real.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_CON_RECLAMOS } from "./empresas-con-reclamos";
import { empresaKeyDeReclamo } from "./empresas";
import { esPendiente, soloPendientes } from "./pendientes";
import { estaReclamado } from "./reclamado";
import { reclamoTaxes } from "./tax";
import { diasDesde } from "./dias";

export interface ItemDePortada { cantidad?: number | null; precio_unitario?: number | null }
export interface SettlementDePortada { monto?: number | null; fecha?: string | null; deleted?: boolean | null }
export interface ReclamoDePortada {
  id: string;
  empresa: string;
  estado?: string | null;
  fecha_factura?: string | null;
  reclamado_en?: string | null;
  monto_reclamado_snapshot?: number | null;
  reclamo_items?: ItemDePortada[] | null;
  reclamo_settlements?: SettlementDePortada[] | null;
}
export interface ContactoDePortada { empresa: string; nombre_contacto?: string | null; nombre?: string | null }

export interface Cifra { monto: number; n: number }
export interface ResumenPortada { porCobrar: Cifra; sinReclamar: Cifra; cobrado: Cifra & { anio: number } }

export interface TarjetaEmpresa {
  empresa: string;
  nombreCorto: string;
  contacto: string | null;
  /** Días desde la factura más vieja por cobrar; null si ninguna trae fecha. */
  masViejoDias: number | null;
  monto: number;
  n: number;
  sinReclamar: number;
  /** true si alguna vez tuvo un reclamo (vivo). */
  tieneHistoria: boolean;
}

export function totalDe(r: ReclamoDePortada): number {
  const sub = (r.reclamo_items ?? []).reduce(
    (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
    0,
  );
  return reclamoTaxes(r.empresa, sub).total;
}

function sumar(rs: readonly ReclamoDePortada[]): Cifra {
  return { monto: rs.reduce((s, r) => s + totalDe(r), 0), n: rs.length };
}

export function resumenPortada(reclamos: readonly ReclamoDePortada[], hoy: string): ResumenPortada {
  const anio = +hoy.slice(0, 4);
  const pend = soloPendientes(reclamos);
  const sinRec = pend.filter((r) => !estaReclamado(r));
  // Cobrado = lo que entró por nota de crédito con fecha de este año, contado
  // por reclamo. Sale de los settlements, no del estado: es plata que llegó.
  let cobradoMonto = 0;
  let cobradoN = 0;
  for (const r of reclamos) {
    if (esPendiente(r)) continue;
    const delAnio = (r.reclamo_settlements ?? []).filter((s) => !s.deleted && (s.fecha ?? "").startsWith(`${anio}-`));
    if (delAnio.length === 0) continue;
    cobradoN += 1;
    cobradoMonto += delAnio.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  }
  return { porCobrar: sumar(pend), sinReclamar: sumar(sinRec), cobrado: { monto: cobradoMonto, n: cobradoN, anio } };
}

export function tarjetasPorEmpresa(
  reclamos: readonly ReclamoDePortada[],
  contactos: readonly ContactoDePortada[],
  hoy: string,
): TarjetaEmpresa[] {
  const tarjetas = EMPRESAS_CON_RECLAMOS.map((empresa) => {
    const propios = reclamos.filter((r) => r.empresa === empresa);
    const pend = soloPendientes(propios);
    const c = contactos.find((x) => x.empresa === empresa);
    const dias = pend.map((r) => diasDesde(r.fecha_factura, hoy)).filter((d): d is number => d !== null);
    const key = empresaKeyDeReclamo(empresa);
    return {
      empresa,
      nombreCorto: key ? nombreCortoEmpresa(key) : empresa,
      contacto: (c?.nombre_contacto || c?.nombre || "").trim() || null,
      masViejoDias: dias.length ? Math.max(...dias) : null,
      monto: pend.reduce((s, r) => s + totalDe(r), 0),
      n: pend.length,
      sinReclamar: pend.filter((r) => !estaReclamado(r)).length,
      tieneHistoria: propios.length > 0,
    };
  });
  // Por plata, de más a menos; empate → el orden del mapa (sort es estable).
  return tarjetas.sort((a, b) => b.monto - a.monto);
}
