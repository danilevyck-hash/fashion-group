/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de la planilla. La regla vive en `planilla.ts`, que es puro; acá solo
 * se junta el dato.
 *
 * 🩸 IGUAL QUE `config-server.ts`: si la migración todavía no corrió, esto NO
 * revienta. Los montos manuales salen en cero y la pantalla avisa con el nombre
 * del archivo que hay que correr. En este proyecto los DDL los corre Daniel a
 * mano y varios se quedaron pendientes semanas; que la planilla entera se caiga
 * por eso sería cambiar un aviso por un "Asistencia está rota".
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { esTablaFaltante } from "./config";
import { normalizarManuales, type ManualesLinea } from "./planilla";

/** El archivo que Daniel tiene que correr. Se le muestra tal cual al usuario. */
export const MIGRACION_PLANILLA = "20260806220000_asistencia_planilla_manual.sql";
export const TABLA_MANUAL = "asistencia_planilla_manual";

export function avisoMigracionPlanilla(): string {
  return (
    "Los montos que se escriben a mano (ISR, préstamo, terceros, mercancía y otros "
    + "servicios) todavía no se pueden guardar. Pídele a Daniel que corra el archivo "
    + `${MIGRACION_PLANILLA} en Supabase. Mientras tanto la planilla se calcula igual, `
    + "pero lo que escribas se pierde al salir."
  );
}

export interface ManualesLeidos {
  /** código → montos. Vacío si la tabla no existe todavía. */
  porCodigo: Map<string, ManualesLinea>;
  faltaMigracion: boolean;
}

interface FilaManual {
  empleado_codigo: string;
  isr: number | string | null;
  prestamo: number | string | null;
  terceros: number | string | null;
  mercancia: number | string | null;
  otros_servicios: number | string | null;
}

/** Los montos escritos a mano de una quincena. */
export async function leerManuales(quincenaClave: string): Promise<ManualesLeidos> {
  const { data, error } = await supabaseServer
    .from(TABLA_MANUAL)
    .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios")
    .eq("quincena", quincenaClave);

  if (error) {
    if (esTablaFaltante(error, TABLA_MANUAL)) {
      return { porCodigo: new Map(), faltaMigracion: true };
    }
    throw new Error(error.message);
  }

  const porCodigo = new Map<string, ManualesLinea>();
  for (const f of (data ?? []) as FilaManual[]) {
    porCodigo.set(String(f.empleado_codigo), normalizarManuales({
      isr: Number(f.isr ?? 0),
      prestamo: Number(f.prestamo ?? 0),
      terceros: Number(f.terceros ?? 0),
      mercancia: Number(f.mercancia ?? 0),
      otrosServicios: Number(f.otros_servicios ?? 0),
    }));
  }
  return { porCodigo, faltaMigracion: false };
}

/**
 * Guarda (o pisa) los montos manuales de UNA persona en UNA quincena.
 * Devuelve `false` si la tabla todavía no existe, para que la pantalla avise
 * en vez de decir "guardado" sobre algo que no se guardó.
 */
export async function guardarManuales(
  quincenaClave: string,
  codigo: string,
  m: ManualesLinea,
): Promise<boolean> {
  const { error } = await supabaseServer.from(TABLA_MANUAL).upsert(
    {
      quincena: quincenaClave,
      empleado_codigo: codigo,
      isr: m.isr,
      prestamo: m.prestamo,
      terceros: m.terceros,
      mercancia: m.mercancia,
      otros_servicios: m.otrosServicios,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "quincena,empleado_codigo" },
  );

  if (error) {
    if (esTablaFaltante(error, TABLA_MANUAL)) return false;
    throw new Error(error.message);
  }
  return true;
}
