import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";

// ── API contract (base /api/gastos-empresa) ──────────────────────────────────

export const API_BASE = "/api/gastos-empresa";

/** Fila especial del checklist: gastos compartidos del grupo. */
export const GRUPO_KEY = "grupo";

export type Id = string | number;

export interface Categoria {
  id: Id;
  nombre: string;
  orden: number;
  es_fijo: boolean;
  activo: boolean;
}

export interface Gasto {
  id: Id;
  empresa_key: string;
  categoria_id: Id;
  monto: number;
  notas?: string | null;
}

export interface BancoSaldo {
  empresa_key: string;
  saldo: number;
  fecha_dato: string; // YYYY-MM-DD
}

export interface Resumen {
  mes: string;
  categorias: Categoria[];
  gastos: Gasto[];
  bancos: BancoSaldo[];
  prevMes: string;
  prevMesTieneDatos: boolean;
}

export function sameId(a: Id, b: Id): boolean {
  return String(a) === String(b);
}

// ── Empresas ─────────────────────────────────────────────────────────────────

export { ALL_EMPRESA_KEYS };

export function empresaNombre(key: string): string {
  if (key === GRUPO_KEY) return "Grupo";
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

// ── Meses (YYYY-MM) ──────────────────────────────────────────────────────────

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function mesValido(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function sumarMeses(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** "2026-07" → "Julio 2026" */
export function mesLabel(ym: string): string {
  if (!mesValido(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

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
