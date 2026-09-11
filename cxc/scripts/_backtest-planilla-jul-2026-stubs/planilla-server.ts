// STUB SOLO PARA EL BACKTESTING (no se commitea). Reemplaza `@/lib/asistencia/planilla-server`.
// Si BACKTEST_MANUALES apunta a un JSON {clave: {codigo: {...}}}, los montos manuales salen
// de ahí (los del Excel de la contable); si no, se delega al módulo REAL (solo lectura).
import fs from "node:fs";
import * as real from "../../src/lib/asistencia/planilla-server";
import { normalizarManuales, type ManualesLinea } from "../../src/lib/asistencia/planilla";
export const MIGRACION_PLANILLA = real.MIGRACION_PLANILLA;
export const TABLA_MANUAL = real.TABLA_MANUAL;
export const avisoMigracionPlanilla = real.avisoMigracionPlanilla;
export async function leerManuales(clave: string) {
  const p = process.env.BACKTEST_MANUALES;
  if (!p) return real.leerManuales(clave);
  const todo = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, Record<string, Partial<ManualesLinea>>>;
  const porCodigo = new Map<string, ManualesLinea>();
  for (const [cod, m] of Object.entries(todo[clave] ?? {})) porCodigo.set(cod, normalizarManuales(m));
  return { porCodigo, faltaMigracion: false };
}
export async function guardarManuales(): Promise<boolean> {
  throw new Error("BACKTEST: prohibido escribir");
}
