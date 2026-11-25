// Despachos › «Muestras» — el aviso push al vendedor cuando bodega las pide
// (25-nov-2026, Daniel: «a los que ven muestras vendedores, actívales la
// notificación para que les llegue cuando bodega las pide»). Puro.
//
// 🔴 A QUIÉN: la MISMA regla que decide quién ve la lista (`vendedorDeMuestra`):
// Vistana → edwin; las otras 5 → rey. Admin ve la lista pero NO recibe aviso.
// 🔴 CUÁNDO: solo al PEDIR (uno por pedido, aunque sean varias referencias).
// «No llegó» no avisa.

import { MUESTRAS_2026_11, vendedorDeMuestra } from "./muestras";

/** 🔴 PRENDIDO (25-nov-2026). `false` = sin aviso y sin «Activa los avisos». */
export const MUESTRAS_AVISO_EN_CODIGO = true;
export const MUESTRAS_AVISO_PUSH_2026_11: boolean = MUESTRAS_2026_11 && MUESTRAS_AVISO_EN_CODIGO;

export const TITULO_AVISO_MUESTRAS = "Muestras pedidas";
export const URL_AVISO_MUESTRAS = "/despachos?vista=muestras";

export interface AvisoDeMuestras {
  usuario: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** «Bodega pidió 3 muestras · Pedido 16-1234 · Cliente X». */
export function textoAvisoMuestras(n: number, secuencial?: string | null, cliente?: string | null): string {
  const partes = [n === 1 ? "Bodega pidió 1 muestra" : `Bodega pidió ${n} muestras`];
  if (secuencial?.trim()) partes.push(`Pedido ${secuencial.trim()}`);
  if (cliente?.trim()) partes.push(cliente.trim());
  return partes.join(" · ");
}

export function avisoDeMuestras(a: {
  empresa_key: string;
  pedido_switch_id: number;
  n: number;
  secuencial?: string | null;
  cliente?: string | null;
}): AvisoDeMuestras | null {
  if (!MUESTRAS_AVISO_PUSH_2026_11 || a.n < 1) return null;
  return {
    usuario: vendedorDeMuestra(a.empresa_key),
    title: TITULO_AVISO_MUESTRAS,
    body: textoAvisoMuestras(a.n, a.secuencial, a.cliente),
    url: URL_AVISO_MUESTRAS,
    // Uno por pedido: si bodega pide más del mismo pedido, reemplaza al anterior.
    tag: `muestras-${a.empresa_key}-${a.pedido_switch_id}`,
  };
}

/** ¿Se le ofrece «Activa los avisos» en Muestras? Solo al vendedor que las manda. */
export function ofreceAvisoDeMuestras(role: string | null | undefined): boolean {
  return MUESTRAS_AVISO_PUSH_2026_11 && role === "vendedor";
}
