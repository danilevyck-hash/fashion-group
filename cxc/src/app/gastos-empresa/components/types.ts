// Los helpers de SALDO BANCARIO (empresa, fecha, monto) se mudaron con el
// módulo: viven en `app/saldos-banco/components/types.ts` y se re-exportan
// desde acá. UNA sola definición — dos copias divergen y nadie se entera.
export {
  ALL_EMPRESA_KEYS,
  diasDesde,
  fechaCorta,
  hoyISO,
  limpiarMonto,
  money,
  montoInputValue,
  parseMonto,
  type BancoSaldo,
} from "@/app/saldos-banco/components/types";

import {
  empresaNombre as empresaNombreBase,
  type BancoSaldo,
} from "@/app/saldos-banco/components/types";

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

/** Igual que el de Saldos de Banco, más la fila especial "Grupo" del checklist
 *  (gastos compartidos), que solo existe en esta pantalla. */
export function empresaNombre(key: string): string {
  if (key === GRUPO_KEY) return "Grupo";
  return empresaNombreBase(key);
}

// ── Meses (YYYY-MM) ──────────────────────────────────────────────────────────

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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
