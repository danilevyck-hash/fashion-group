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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS FERIADOS NACIONALES SALEN SOLOS, PARA CUALQUIER AÑO (19-nov-2026).
//
// Daniel: *«los días feriados los debes cargar ya para siempre, no? porque solo
// dos años»*. Código de Trabajo art. 46 + Ley 291 de 2022 (20-dic). Los móviles
// salen de la Pascua: martes de Carnaval (−47) y Viernes Santo (−2).
// `asistencia_feriados` queda para lo EXTRA (días libres, decretos) y una fila
// de la tabla MANDA sobre lo calculado (`juntarFeriados`).
//
// ⚠️ NO está el lunes que el art. 47 habilita cuando el feriado cae en domingo,
// ni el 1-jul de la toma de posesión: los decide Daniel, y hoy van a la tabla.
// ─────────────────────────────────────────────────────────────────────────────

const FIJOS: ReadonlyArray<readonly [string, string]> = [
  ["01-01", "Año Nuevo"],
  ["01-09", "Día de los Mártires"],
  ["05-01", "Día del Trabajador"],
  ["11-03", "Separación de Colombia"],
  ["11-05", "Día de Colón"],
  ["11-10", "Primer Grito de Independencia"],
  ["11-28", "Independencia de España"],
  ["12-08", "Día de la Madre"],
  ["12-20", "Día de Duelo Nacional"],
  ["12-25", "Navidad"],
];

/** Domingo de Pascua (algoritmo gregoriano anónimo), en ms UTC. */
function pascua(anio: number): number {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(anio, Math.floor(n / 31) - 1, (n % 31) + 1);
}

const DIA_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Los feriados nacionales de un año, en orden. */
export function feriadosNacionales(anio: number): FilaFeriado[] {
  const p = pascua(anio);
  return [
    ...FIJOS.map(([md, nombre]) => ({ fecha: `${anio}-${md}`, nombre, tipo: "feriado" })),
    { fecha: iso(p - 47 * DIA_MS), nombre: "Carnaval", tipo: "feriado" },
    { fecha: iso(p - 2 * DIA_MS), nombre: "Viernes Santo", tipo: "feriado" },
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/** Lo calculado de `desde` a `hasta` + la tabla; la fila de la tabla manda en su fecha. */
export function juntarFeriados(
  desde: string,
  hasta: string,
  filas: readonly FilaFeriado[],
): { feriados: Map<string, string>; diasLibres: Map<string, string> } {
  const enTabla = new Set(filas.map((f) => String(f.fecha).slice(0, 10)));
  const calculados: FilaFeriado[] = [];
  for (let anio = Number(desde.slice(0, 4)); anio <= Number(hasta.slice(0, 4)); anio++) {
    for (const f of feriadosNacionales(anio)) {
      if (f.fecha >= desde && f.fecha <= hasta && !enTabla.has(f.fecha)) calculados.push(f);
    }
  }
  return separarFeriados([...calculados, ...filas]);
}
