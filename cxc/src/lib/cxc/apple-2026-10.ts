// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUENTAS POR COBRAR «COMO LO HARÍA APPLE» (4-oct-2026, propuesta).
//
// Daniel aprobó empezar los rediseños módulo por módulo con cinco reglas: lo
// importante primero, un toque para el detalle, frescura a la vista, el mismo
// selector de período y lo que requiere atención arriba. En CxC eso es:
//   · Celular: bajo el total, «+90 días $X · Actualizado 4:00 pm ↻», y la lista
//     abre con «Clientes +90 días» (los 5 con más saldo a +90 días) y debajo
//     «Otros clientes» (el resto, por saldo, como hoy). Nadie sale dos veces.
//   · Computadora: arriba el total grande con «+90 días $X» y «Actualizado hace
//     5 min · Actualizar»; la tabla y su orden («más viejo sin pagar») no cambian.
//
// 🔴 «+90 días», NUNCA «vencido»: `dias` es EDAD del documento, no mora
// (nombres-erp.md; postmortem boston-cxc). Es la MISMA cuenta y el MISMO nombre
// de la tarjeta «Clientes +90 días» de Vista general: 91-120 + 121 y más.
// 🔑 El período no aplica: la cartera es una foto de hoy, no un rango.
//
// Interruptor `CXC_APPLE_2026_10`: `false` = todo como hoy. NACE APAGADO; se
// prende solo con el «sí» de Daniel. Candado `cxc-apple-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncNowOpcion } from "@/components/shared/SyncNowButton";
import { CXC_GRUPO_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const CXC_APPLE_2026_10 = false;

/** Cuántos clientes van en «Clientes +90 días». */
export const CUANTOS_EN_ATENCION = 5;

interface ConTramos {
  total: number;
  watch: number;
  overdue: number;
}

/** Saldo a +90 días: 91-120 + 121 y más (la misma suma de Vista general). */
export function saldoMas90(c: ConTramos): number {
  return (c.watch ?? 0) + (c.overdue ?? 0);
}

/**
 * Parte la lista en dos sin repetir a nadie: arriba los `n` con más saldo a +90
 * días (solo los que deben), abajo el resto EN EL ORDEN QUE YA TRAÍA.
 */
export function partirPorAtencion<T extends ConTramos>(lista: readonly T[], n = CUANTOS_EN_ATENCION): { atencion: T[]; resto: T[] } {
  const atencion = lista
    .filter((c) => c.total > 0 && saldoMas90(c) > 0)
    .sort((a, b) => saldoMas90(b) - saldoMas90(a))
    .slice(0, n);
  const arriba = new Set(atencion);
  return { atencion, resto: lista.filter((c) => !arriba.has(c)) };
}

/**
 * Lo que actualiza la línea de frescura: la empresa que se mira, o las 6 del
 * grupo una tras otra (Switch admite una a la vez). Hoy, con «Todas», el botón
 * está apagado y pide elegir una empresa.
 */
export function opcionesActualizarCxc(companyFilter: string): SyncNowOpcion[] {
  if (companyFilter !== "all") return [{ modulo: "estadocuenta", empresa: companyFilter }];
  return CXC_GRUPO_EMPRESA_KEYS.map((k) => ({ modulo: "estadocuenta", empresa: k, label: EMPRESA_KEY_TO_NAME[k] ?? k }));
}
