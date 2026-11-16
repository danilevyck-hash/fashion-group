// El cronograma PROGRAMADO de verdad = vercel.json ∪ los jobs de pg_cron.
//
// Desde el 16-nov-2026 hay dos relojes que disparan /api/cron/*: Vercel
// (`vercel.json`, tope 100 entradas) y pg_cron dentro de Supabase (la migración
// `*_crons_facturas_a_pg_cron.sql`, jobs `fg-<ruta>-<hhmm>` que llaman a la
// misma ruta por `public.fg_cron_llamar`). Los candados que antes leían solo
// vercel.json leen ESTO: si una entrada se muda de un reloj al otro, el
// registro de código (SWITCH_CRON_ENTRADAS) tiene que seguir conociéndola, y
// ninguna puede estar en los dos a la vez (corrida doble = sesión de Switch
// expulsada).
//
// Lee los archivos del repo tal cual: no hay lista escrita a mano.
import fs from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");

export type OrigenCron = "vercel" | "pg_cron";

export interface CronProgramado {
  /** Ruta completa, con query (`/api/cron/switch-sync?tipo=…&slot=…`). */
  path: string;
  /** Expresión cron en UTC (`"50 11 * * *"`). */
  schedule: string;
  origen: OrigenCron;
  /** Solo pg_cron: el `jobname` de `cron.schedule`. */
  jobname?: string;
}

/** Las entradas de vercel.json, tal cual. */
export const VERCEL_CRONS: CronProgramado[] = (
  JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  }
).crons.map((c) => ({ ...c, origen: "vercel" as const }));

/** Archivos de migración que programan jobs de pg_cron (hoy uno). */
export const MIGRACIONES_PG_CRON = fs
  .readdirSync(path.join(RAIZ, "supabase/migrations"))
  .filter((f) => /^\d{14}_crons_.*\.sql$/.test(f))
  .sort();

/** `select cron.schedule('fg-…', 'm h * * *', $$select public.fg_cron_llamar('/api/cron/…')$$);` */
const RE_JOB =
  /cron\.schedule\(\s*'([^']+)',\s*'([^']+)',\s*\$\$\s*select\s+public\.fg_cron_llamar\('([^']+)'\)\s*\$\$\s*\)/g;

/** Los jobs de pg_cron, leídos de la(s) migración(es). */
export const PG_CRON_JOBS: CronProgramado[] = MIGRACIONES_PG_CRON.flatMap((f) => {
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migrations", f), "utf8");
  return [...sql.matchAll(RE_JOB)].map((m) => ({
    jobname: m[1],
    schedule: m[2],
    path: m[3],
    origen: "pg_cron" as const,
  }));
});

/** Todo lo que corre solo, venga del reloj que venga. */
export const CRONS_PROGRAMADOS: CronProgramado[] = [...VERCEL_CRONS, ...PG_CRON_JOBS];

/** `"50 11 * * *"` → `"1150"`. */
export const hhmmDeSchedule = (schedule: string): string => {
  const [min, hora] = schedule.split(" ");
  return `${hora.padStart(2, "0")}${min.padStart(2, "0")}`;
};
