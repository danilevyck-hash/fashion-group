// ─────────────────────────────────────────────────────────────────────────────
// «FACTURADOS» — las facturas del grupo que todavía no entraron a ninguna guía.
// (módulo PURO: sin React, sin fetch, sin reloj) — MOCKUP 26-nov-2026.
//
// 🔴 `guia_items.empresa` es TEXTO LIBRE y viene sucio (medido 26-nov-2026:
// «Fashion Shoes », «Fahion Wear», «VISTANA / FASHION WEAR», «Vistana»,
// «Karl Laguerfeld», «Multifashion Holding»…). Se traduce a `empresa_key` con
// una lista escrita a mano; lo que no se reconoce —o nombra dos empresas— se
// toma como CUALQUIERA de las candidatas: ante la duda la factura se da por
// guiada (es mejor no mostrar una de más que acusar una que ya salió).
// La comparación sigue siendo `claveDeFactura` (últimos 4 dígitos) dentro de
// la misma empresa, como el aviso «ya salió en otra guía».
// ─────────────────────────────────────────────────────────────────────────────

import { claveDeFactura } from "@/lib/guias/numero-factura";
import { numerosDeFacturas } from "@/lib/guias/atajos-facturas";

/**
 * 🔴 Interruptor (Daniel aprobó el 26-nov-2026): la barra de Pedidos como
 * pipeline con un quinto paso, «Facturados». `false` = los cuatro chips de antes.
 */
export const PEDIDOS_PIPELINE_2026_11 = true;

/** Cuántos días atrás se buscan facturas sin guía. */
export const DIAS_FACTURADOS = 30;

export const EMPRESAS_DEL_GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"] as const;

const POR_TEXTO: Record<string, readonly string[]> = {
  "fashion wear": ["fashion_wear"],
  "fahion wear": ["fashion_wear"],
  "fashion shoes": ["fashion_shoes"],
  "vistana": ["vistana"],
  "vistana international": ["vistana"],
  "vistana internacional": ["vistana"],
  "active shoes": ["active_shoes"],
  "active shoes (ropa)": ["active_shoes"],
  "active wear": ["active_wear"],
  "joystep": ["joystep"],
  "joysbees": ["joystep"],
  "vistana / fashion wear": ["vistana", "fashion_wear"],
  "confecciones boston": ["boston"],
};

/** Las empresas que PUEDE nombrar el texto de un renglón. Sin reconocer = las seis. */
export function empresasDelRenglon(texto: string | null | undefined): readonly string[] {
  const t = (texto ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return POR_TEXTO[t] ?? EMPRESAS_DEL_GRUPO;
}

export interface RenglonDeGuiaViva {
  empresa: string | null;
  facturas: string | null;
}

/** Índice `empresa_key|clave` de todo lo que ya está en una guía viva. */
export function indiceEnGuia(renglones: readonly RenglonDeGuiaViva[]): Set<string> {
  const s = new Set<string>();
  for (const r of renglones) {
    const ks = empresasDelRenglon(r.empresa);
    for (const n of numerosDeFacturas(r.facturas)) for (const k of ks) s.add(`${k}|${n}`);
  }
  return s;
}

/**
 * Clientes que NO van en «Facturados», por CÓDIGO (nunca por nombre).
 * D-108 Multi Fashion Holding — Daniel, 26-nov-2026: «Multi Fashion Holding no».
 */
export const CLIENTES_FUERA_DE_FACTURADOS: readonly string[] = ["D-108"];

export function entraEnFacturados(clienteCodigo: string | null | undefined): boolean {
  const c = (clienteCodigo ?? "").trim().toUpperCase();
  return c !== "TCKCTA" && !CLIENTES_FUERA_DE_FACTURADOS.includes(c);
}

/** ¿Esta factura ya entró a una guía viva? Sin clave no se afirma nada (no está). */
export function estaEnGuia(indice: ReadonlySet<string>, empresaKey: string, secuencial: string): boolean {
  const c = claveDeFactura(secuencial);
  return c !== "" && indice.has(`${empresaKey}|${c}`);
}

/**
 * Cobro suelto (flete, ajuste): su pedido YA se leyó de Switch y vino vacío → nunca va en una guía.
 * Sin lectura (`pedido_leido_en` nulo) no se sabe: se queda en la lista.
 */
export function esCobroSuelto(f: { pedido_referencia: string | null; pedido_leido_en: string | null }): boolean {
  return (f.pedido_referencia ?? "").trim() === "" && f.pedido_leido_en != null;
}
