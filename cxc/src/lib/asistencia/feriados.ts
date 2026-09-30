/* ─────────────────────────────────────────────────────────────────────────────
 * FERIADOS DE DOS TIPOS (30-sep-2026). Módulo PURO: lo leen la pantalla, la
 * ruta y el motor.
 *
 * Daniel y la contable, 30-sep-2026: las fiestas judías estaban cargadas como
 * feriado y el sistema las pagaba sin deuda. La regla de Daniel: *«es día libre
 * pero los colaboradores deben»* las horas.
 *
 *                     Feriado · se paga       Día libre · debe las horas
 *   no trabajó        se paga                 se paga + debe 8 h × rata
 *   trabajó           todo al recargo 1.50    cobra normal, no debe (regla 8)
 *   Multifashion      igual que las demás     se paga, NUNCA debe
 *
 * La deuda es la MISMA del «Día libre de la empresa» (`dia-libre-empresa.ts`):
 * solo la pagan las horas extra y nunca sale del sueldo.
 * ────────────────────────────────────────────────────────────────────────── */

export const TIPOS_FERIADO = ["feriado", "dia_libre"] as const;
export type TipoFeriado = (typeof TIPOS_FERIADO)[number];

/** Cualquier cosa rara cae a «feriado»: lo de siempre, nunca una deuda inventada. */
export function tipoFeriado(v: unknown): TipoFeriado {
  return v === "dia_libre" ? "dia_libre" : "feriado";
}

export const ROTULO_TIPO: Record<TipoFeriado, string> = {
  feriado: "Feriado · se paga",
  dia_libre: "Día libre · el colaborador debe las horas",
};

export interface FilaFeriado { fecha: string; nombre: string; tipo?: string | null }

/**
 * Parte la tabla en las dos listas que usa el motor. Sin la columna `tipo`
 * (migración sin aplicar) todo es feriado: exactamente lo de antes.
 */
export function separarFeriados(filas: readonly FilaFeriado[]): {
  feriados: Map<string, string>;
  diasLibres: Map<string, string>;
} {
  const feriados = new Map<string, string>();
  const diasLibres = new Map<string, string>();
  for (const f of filas) {
    (tipoFeriado(f.tipo) === "dia_libre" ? diasLibres : feriados).set(String(f.fecha), String(f.nombre));
  }
  return { feriados, diasLibres };
}

export const MIGRACION_FERIADOS_TIPO = "20261222120000_asistencia_feriados_tipo.sql";

/** ¿El error es «todavía no existe la columna `tipo` de feriados»? Tiene que nombrarla. */
export function esColumnaTipoFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string | null; message?: string | null; details?: string | null };
  const texto = `${e.message ?? ""} ${e.details ?? ""}`;
  if (!/\btipo\b/.test(texto) || !texto.includes("asistencia_feriados")) return false;
  const code = String(e.code ?? "");
  return code === "42703" || code === "PGRST204" || /does not exist|no existe|could not find|schema cache/i.test(texto);
}
