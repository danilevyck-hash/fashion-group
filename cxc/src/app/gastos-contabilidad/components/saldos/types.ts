// Formas y helpers de los saldos de banco.
//
// Este archivo es la CASA de los helpers de saldo bancario (empresa, fecha,
// monto). Se mudó DOS veces con su pantalla y nunca se copió: vivía en
// `app/gastos-empresa/components/types.ts` (cuando los saldos eran una sección
// de "Gastos de Empresa"), pasó a `app/saldos-banco/components/` los dos días
// que fue módulo suelto, y desde el 13-ago-2026 vive acá — los saldos son la 2ª
// PESTAÑA de "Gastos". Nunca hubo dos copias.
//
// ⚠️ La API NO se mudó: sigue siendo `/api/saldos-banco`. Mover una ruta viva
// solo para que el nombre haga juego sería churn sin comprar nada.

import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";
import type { CargaSaldo } from "@/lib/saldos-banco/historial";

/** Base de la API del módulo. */
export const API_BASE = "/api/saldos-banco";

export interface BancoSaldo {
  empresa_key: string;
  saldo: number;
  fecha_dato: string; // YYYY-MM-DD
}

/** Lo que devuelve GET /api/saldos-banco: el último saldo de cada empresa y el
 *  historial completo de cargas, por empresa, de la más nueva a la más vieja. */
export interface RespuestaSaldos {
  bancos: BancoSaldo[];
  historial?: Record<string, CargaSaldo[]>;
}

export type { CargaSaldo };

// ── Empresas ─────────────────────────────────────────────────────────────────

export { ALL_EMPRESA_KEYS };

export function empresaNombre(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

// ── Fechas ───────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-07-15" → "15 jul" */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1] ?? ""}`;
}

/** "2026-07-15" → "15 jul 2026". El historial CRUZA años (hoy va de ene a ago
 *  2026, pero crece ~12 filas por empresa por año), y una lista de fechas sin
 *  año es una lista donde "31 ene" aparece dos veces sin poder distinguirlas. */
export function fechaConAnio(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${fechaCorta(iso)} ${m[1]}`;
}

export function diasDesde(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return 0;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Montos ───────────────────────────────────────────────────────────────────

export function money(n: number): string {
  return `$${fmt(n)}`;
}

/** Deja solo dígitos y un punto decimal (y "-" inicial si se permite negativo). */
export function limpiarMonto(v: string, permitirNegativo = false): string {
  let s = v.replace(permitirNegativo ? /[^\d.-]/g : /[^\d.]/g, "");
  if (permitirNegativo) s = s.charAt(0) + s.slice(1).replace(/-/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s;
}

/** "" → null (no cargado). "0" es un valor válido. */
export function parseMonto(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function montoInputValue(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}
