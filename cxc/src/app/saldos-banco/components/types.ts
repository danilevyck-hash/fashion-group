// Formas y helpers de "Saldos de Banco".
//
// Este archivo es la CASA de los helpers de saldo bancario (empresa, fecha,
// monto). Vivían dentro de `app/gastos-empresa/components/types.ts` porque los
// saldos eran una sección de esa pantalla; al mudarse a su propio módulo se
// mudaron con ella. `gastos-empresa` los RE-EXPORTA desde acá mientras exista
// — una sola definición, nunca dos que puedan divergir.

import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";

/** Base de la API del módulo. */
export const API_BASE = "/api/saldos-banco";

export interface BancoSaldo {
  empresa_key: string;
  saldo: number;
  fecha_dato: string; // YYYY-MM-DD
}

/** Lo que devuelve GET /api/saldos-banco: el último saldo de cada empresa. */
export interface RespuestaSaldos {
  bancos: BancoSaldo[];
}

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
