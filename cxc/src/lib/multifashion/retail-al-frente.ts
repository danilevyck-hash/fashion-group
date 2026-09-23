// ─────────────────────────────────────────────────────────────────────────────
// RETAIL AL FRENTE, MAYOREO ABAJO — el interruptor del rediseño de Multifashion
// (23-sep-2026). Módulo PURO.
//
// Daniel, textual: *«Quiero que se compare sin contar el mayoreo. Y abajo
// chiquitito me pones tanto por el mayoreo para yo saber cuánta plata entró a
// la tienda. Pero el número que en verdad me interesa es el real de ventas
// retail.»*
//
// La regla, en tres líneas:
//   1. El número grande es RETAIL (sin `is_wholesale`): año, mes, día, mes a
//      mes, meta, bono, Telegram. Como siempre.
//   2. TODO porcentaje se compara retail contra retail. 🩸 Hasta hoy cuatro RPC
//      leían enero–abril de 2025 de `ventas_raw`, donde el mayoreo NO está
//      marcado: el año decía «+8 %» (es +15,8 %) y abril «▼ 29 %» (es +10,5 %).
//      Las versiones nuevas leen SOLO `_multifashion_sf_vw` (migración
//      `20261217140000`, pendiente; el código cae a las viejas si no existe).
//   3. Debajo del número grande, chiquito, cuánto entró por mayoreo — SOLO
//      cuando en ese período hubo (`lineaMayoreo`). En Productos no se marca
//      nada (Daniel: «no importa»).
//
// ⚠️ Con el interruptor en `false` las cuatro pestañas y las RPC vuelven a ser
// las de antes: las rutas piden las versiones viejas y la pantalla dibuja lo de
// siempre. Nada de lo que se GUARDA cambia en ningún caso.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney } from "@/lib/ventas/format";
import { fmtVariacionPct } from "@/lib/variacion";

/** El interruptor. `false` = las 4 pantallas y las RPC de antes. */
export const RETAIL_AL_FRENTE = true;

export interface MayoreoDelPeriodo {
  /** SUM(subtotal) de `is_wholesale = true` en el período (las NC restan). */
  monto: number;
  /** Cuántos documentos de mayoreo hubo (facturas y notas de crédito). */
  facturas: number;
  /** El número grande de ese mismo período (retail). */
  retail: number;
}

const hayMayoreo = (m: MayoreoDelPeriodo | null | undefined): m is MayoreoDelPeriodo => {
  if (!m) return false;
  const monto = Number(m.monto);
  return Number.isFinite(monto) && Math.abs(monto) >= 0.005;
};

const docs = (n: number) => {
  const k = Math.max(0, Math.trunc(Number(n) || 0));
  return k === 1 ? "1 factura" : `${k} facturas`;
};

/**
 * La línea chiquita: «+ $24,807.00 de mayoreo (1 factura) · entró $72,182.17».
 *
 * 🔴 Solo cuando el mayoreo del período es distinto de CERO. Con $0 devuelve
 * `null` y no se dibuja nada — ni un «$0 de mayoreo», ni un renglón vacío.
 * Marzo 2026 tiene una factura de Joystep y su nota de crédito (neto $0) y por
 * eso NO lleva línea: lo que se dice es cuánta plata entró, y no entró nada.
 */
export function lineaMayoreo(m: MayoreoDelPeriodo | null | undefined): string | null {
  if (!hayMayoreo(m)) return null;
  const monto = Number(m.monto);
  const signo = monto < 0 ? "− " : "+ ";
  const entro = Number(m.retail) + monto;
  return `${signo}${fmtMoney(Math.abs(monto))} de mayoreo (${docs(m.facturas)}) · entró ${fmtMoney(entro)}`;
}

/**
 * La misma línea para el Telegram diario, en texto plano y corta:
 * «+ $28,366 de mayoreo (5 facturas) · entró $418,487». Misma regla del cero.
 */
export function lineaMayoreoTelegram(m: MayoreoDelPeriodo | null | undefined): string | null {
  if (!hayMayoreo(m)) return null;
  const monto = Number(m.monto);
  const entero = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
  return `${monto < 0 ? "− " : "+ "}${entero(Math.abs(monto))} de mayoreo (${docs(m.facturas)}) · entró ${entero(Number(m.retail) + monto)}`;
}

/**
 * 🔴 UN SOLO REDONDEO para todo porcentaje del Resumen: un decimal, con flecha.
 * «▲ +25.0%» · «▼ −8.7%» · «= 0.0%» · «n/a» sin base comparable.
 *
 * 🩸 La tarjeta decía «+30 %» y la tabla de abajo «+29,5 %» para el MISMO
 * número: dos redondeos distintos del mismo dato se leen como dos datos. La
 * flecha se decide sobre el % YA redondeado, nunca «▲ +0.0%».
 */
export function fmtDeltaRetail(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return fmtVariacionPct(null);
  const txt = fmtVariacionPct(delta, true, 1);
  const redondeado = Number(txt.replace("%", ""));
  if (redondeado === 0) return "= 0.0%";
  return redondeado > 0 ? `▲ ${txt}` : `▼ ${txt.replace("-", "−")}`;
}

/** El tono del porcentaje: verde sube, rojo baja, gris si no hay o es cero. */
export function tonoDeltaRetail(delta: number | null | undefined): "sube" | "baja" | "neutro" {
  const t = fmtDeltaRetail(delta);
  if (t.startsWith("▲")) return "sube";
  if (t.startsWith("▼")) return "baja";
  return "neutro";
}

/** ¿El mes (anio, mes) ya cerró respecto del corte de Panamá? */
export function mesCerrado(anio: number, mes: number, corte: { anio: number; mes: number }): boolean {
  return anio < corte.anio || (anio === corte.anio && mes < corte.mes);
}

/**
 * 🔴 CLIENTES FUERA DEL RANKING DE CLIENTES, POR CÓDIGO — nunca por nombre.
 * 324 = LA FRONTERA DUTY FREE (Switch la lista como código «34»; en
 * `switch_facturas.cliente_switch_id` es 324). Su plata es mayoreo y se dice en
 * la línea chiquita del Resumen. Medido el 23-sep-2026: sus 12 documentos de
 * la historia llevan ese código y ninguno es retail.
 */
export const CODIGOS_FUERA_DEL_RANKING: readonly number[] = [324];

export function fueraDelRanking(codigo: number | null | undefined): boolean {
  return codigo != null && CODIGOS_FUERA_DEL_RANKING.includes(Number(codigo));
}

/** Lo que queda en cada pestaña (mockup aprobado, 23-sep-2026): 35 → 20. */
export const ELEMENTOS_POR_PESTANA = {
  resumen: 6,
  vendedoras: 4,
  productos: 5,
  clientes: 5,
} as const;
