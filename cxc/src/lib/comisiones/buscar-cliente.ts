// Comisiones › «Buscar cliente» (3-nov-2026). Puro: sin I/O.
//
// Para cada documento de un cliente dice A QUIÉN le contó y cuánto, o POR QUÉ
// no le contó a nadie. Las reglas son las de la RPC `comision_b2b_detalle`
// (supabase/migrations/20261008120000_comision_b2b_v9_cliente_por_codigo.sql),
// en el mismo orden, leyendo las mismas tablas.
//
// 🔴 EL NÚMERO SE REDONDEA COMO LA RPC: por (empresa, vendedor), la SUMA de la
// base × la tasa, redondeada UNA vez — ventas y cobros por separado, y se suman
// los dos ya redondeados. Redondear fila por fila puede correr un centavo contra
// el detalle del vendedor. La comisión de cada fila es solo para mirar.
// ponytail: copia de las reglas de la RPC en TS (sin migración); si cambia la
// RPC, cambia esto. Lo vigila `comisiones-buscar-cliente.test.ts`.

import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";

/** Interruptor: `false` = Comisiones sin la caja de búsqueda, como antes. */
export const COMISIONES_BUSCAR_CLIENTE = true;

export const MOTIVO_RETENCION = "Retención";

/**
 * Las empresas donde se busca: la elegida (solo si es una de las 6 del grupo)
 * o las 6 con «Todas». `null` = empresa no válida (Boston, ACS o cualquier otra).
 */
export function empresasDeLaBusqueda(empresa: string | null | undefined): string[] | null {
  const e = (empresa ?? "").trim();
  if (!e) return [...EMPRESAS_COMISIONAN];
  return (EMPRESAS_COMISIONAN as readonly string[]).includes(e) ? [e] : null;
}

export interface DocFactura {
  tipo: string;
  cliente: string | null;
  pctUtilidad: number | null;
  subtotal: number;
  vendedor: string;
  excluido: boolean;
  tasa: number;
}

export interface DocRecibo {
  esRetencion: boolean;
  clienteCodigo: string;
  total: number;
  vendedor: string;
  excluido: boolean;
  tasa: number;
}

export interface Resultado {
  /** Base que entra a la comisión (con signo: la nota de crédito resta). 0 si no cuenta. */
  base: number;
  /** Solo para mirar la fila; el total sale de `comisionPorVendedor`. */
  comision: number | null;
  /** Por qué no se paga; `null` = cuenta y se paga. */
  motivo: string | null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;
// Hacia abajo: 19,94 % no cuenta y no puede leerse «20 %».
const pct = (n: number) => `${Math.floor(n)} %`;
const nada = (motivo: string): Resultado => ({ base: 0, comision: null, motivo });

export function resultadoFactura(d: DocFactura): Resultado {
  if (d.tipo !== "Factura" && d.tipo !== "Nota de Crédito") return nada(d.tipo || "Otro comprobante");
  if (["VENTAS", "CONTADO"].includes((d.cliente ?? "").trim().toUpperCase())) return nada("Venta al contado");
  if (d.excluido) return nada("Cliente excluido");
  if (d.tipo === "Factura" && !((d.pctUtilidad ?? 0) > 20)) return nada(`Utilidad ${pct(d.pctUtilidad ?? 0)}`);
  const base = d.tipo === "Nota de Crédito" ? -Math.abs(d.subtotal) : Math.abs(d.subtotal);
  return { base, comision: centavos(base * d.tasa), motivo: sePagaComision(d.vendedor) ? null : "Vendedor no pagable" };
}

export function resultadoRecibo(d: DocRecibo): Resultado {
  if (d.esRetencion) return nada(MOTIVO_RETENCION);
  if (d.clienteCodigo.trim().toUpperCase() === "TCKCTA") return nada("Venta al contado");
  if (d.excluido) return nada("Cliente excluido");
  if (d.tasa === 0) return nada("Tasa de cobro 0 %");
  return { base: d.total, comision: centavos(d.total * d.tasa), motivo: sePagaComision(d.vendedor) ? null : "Vendedor no pagable" };
}

export interface FilaConBase {
  empresa: string;
  vendedor: string;
  base: number;
  tasa: number;
  motivo: string | null;
  comision: number | null;
}

export interface ComisionVendedor {
  empresa: string;
  vendedor: string;
  ventas_base: number;
  cobros_base: number;
  comision: number;
  se_paga: boolean;
}

/**
 * Por (empresa, vendedor), como `comision_b2b_detalle`:
 * ROUND(Σ ventas × tasa_venta, 2) + ROUND(Σ cobros × tasa_cobro, 2).
 * Entra todo lo que tiene base (también el vendedor no pagable, marcado `se_paga: false`).
 */
export function comisionPorVendedor(ventas: readonly FilaConBase[], cobros: readonly FilaConBase[]): ComisionVendedor[] {
  const m = new Map<string, { empresa: string; vendedor: string; v: number; c: number; tv: number; tc: number }>();
  const tomar = (f: FilaConBase, cual: "v" | "c") => {
    if (f.comision == null) return;
    const k = `${f.empresa}|${f.vendedor}`;
    const g = m.get(k) ?? { empresa: f.empresa, vendedor: f.vendedor, v: 0, c: 0, tv: 0, tc: 0 };
    g[cual] += f.base;
    if (cual === "v") g.tv = f.tasa; else g.tc = f.tasa;
    m.set(k, g);
  };
  ventas.forEach((f) => tomar(f, "v"));
  cobros.forEach((f) => tomar(f, "c"));
  return [...m.values()].map((g) => ({
    empresa: g.empresa,
    vendedor: g.vendedor,
    ventas_base: centavos(g.v),
    cobros_base: centavos(g.c),
    comision: centavos(centavos(g.v * g.tv) + centavos(g.c * g.tc)),
    se_paga: sePagaComision(g.vendedor),
  }));
}

/** Lo que se paga del cliente: la suma de lo pagable, ya redondeado por vendedor. */
export function comisionPagable(porVendedor: readonly ComisionVendedor[]): number {
  return centavos(porVendedor.filter((v) => v.se_paga).reduce((s, v) => s + v.comision, 0));
}

/** Las retenciones van juntas en una línea al pie de Cobros; el resto, fila por fila. */
export function separarRetenciones<T extends { motivo: string | null; monto: number }>(cobros: readonly T[]) {
  const retenciones = cobros.filter((f) => f.motivo === MOTIVO_RETENCION);
  return {
    filas: cobros.filter((f) => f.motivo !== MOTIVO_RETENCION),
    retenciones: { cantidad: retenciones.length, monto: centavos(retenciones.reduce((s, f) => s + f.monto, 0)) },
  };
}
