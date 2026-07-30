// ─────────────────────────────────────────────────────────────────────────────
// "Un dato que mirás está viejo" — la ÚNICA alerta de datos que quiere Daniel.
//
// Regla aprobada el 30-jul-2026: avisar si la **cartera** o las **ventas** llevan
// más de **24 horas** sin actualizarse. Nada más.
//
// 🩸 POR QUÉ REEMPLAZA AL WATCHDOG DE HEARTBEATS. El vigía viejo alertaba por
// CRON: "⏰ Watchdog crons — N sin success reciente: switch-sync:all-0630". Eso
// mide el mecanismo, no el resultado, y se equivoca en las DOS direcciones:
//   • FALSO POSITIVO: `all-0630` no dejaba heartbeat pero las ventas de
//     american_classic de ese mismo run entraban perfecto (06:31:23). Daniel
//     recibió el mismo aviso el 27, 28 y 29 de julio por datos que estaban al día.
//   • FALSO NEGATIVO: si un sync corre, deja heartbeat y no trae nada, el
//     heartbeat queda fresco y el dato viejo pasa inadvertido.
// Preguntar por el DATO ("¿la cartera que mira Daniel está vieja?") acierta en
// las dos. Y cumple la regla del canal SISTEMA: es real, no se arregla solo, y
// alguien tiene que actuar.
//
// QUÉ NO ENTRA ACÁ. Un cron caído cuyo trabajo igual se hizo NO es un problema de
// Daniel: se ve en el cuerpo de /api/health-crons y en `switch_sync_log`, sin
// molestar a nadie. Un sync que falla dos veces seguidas ya lo reporta
// `alertSwitchCronErrors` (regla 2, PR #345) — acá no se duplica.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import {
  empresasConCxc,
  empresasConFacturas,
  EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON,
} from "@/lib/switch-api/empresas";

/**
 * Umbral de "dato viejo". Daniel eligió **24 h** (mi propuesta eran 12).
 *
 * Es más estricto que las 26 h del indicador SyncStatus de la app, a propósito y
 * con motivo: esas 26 h se dimensionaron cuando los syncs corrían 1×/día en el
 * plan Hobby. Hoy las ventas se sincronizan 8×/día y la cartera 6-7×/día, así que
 * 24 h sin un solo success no es jitter: es una parada. Entre 24 h y 26 h hay una
 * ventana en la que la alerta suena y la app todavía dice "al día" — es
 * deliberado: preferimos que el aviso llegue antes que la pantalla se ponga
 * amarilla, no después.
 */
export const HORAS_DATO_VIEJO = 24;

/** Cada cuánto, como máximo, se repite este aviso. Un dato viejo sigue viejo
 *  mañana; repetirlo cada pasada de la reconciliación (3×/día) lo convertiría en
 *  el ruido que esta regla vino a eliminar. Una vez al día alcanza para que no se
 *  olvide y no alcanza para que se ignore. */
export const HORAS_ENTRE_AVISOS = 20;

/** `tipo` con el que se registra en `cron_email_errors` (llave del dedup). */
export const TIPO_DATO_VIEJO = "dato_viejo";

/** Los dos datos que Daniel mira y que esta regla vigila. */
export type Dato = "cartera" | "ventas";

/** Cómo se llama cada dato cuando se lo nombra en un mensaje. */
const NOMBRE: Record<Dato, string> = {
  cartera: "la cartera (lo que te deben)",
  ventas: "las ventas",
};

/**
 * Qué se mide para cada dato, y por qué esa fuente:
 *
 * • **cartera → `switch_estadocuenta.synced_at`.** Esa tabla es un SNAPSHOT: cada
 *   upsert sella `synced_at = runStamp`, así que el máximo por empresa es
 *   literalmente "cuándo se refrescó su cartera". Es la misma fuente que usa
 *   `/api/sync-status` para el indicador de la app, así que la alerta y la
 *   pantalla no pueden contradecirse.
 *
 * • **ventas → `switch_sync_log` (`sync_type='facturas'`, `status='success'`).**
 *   Acá NO sirve `switch_facturas.synced_at`: el sync omite ese campo en el
 *   payload a propósito para preservar el valor del primer insert, o sea que
 *   significa "cuándo apareció esta factura", no "cuándo corrió el sync". Un día
 *   sin ventas nuevas dejaría el máximo congelado y daría una alerta falsa.
 */
export interface EstadoDato {
  dato: Dato;
  empresa: string;
  ultimaIso: string | null;
  horas: number | null;
}

/** Empresas que cuentan para cada dato. */
export function empresasDe(dato: Dato): string[] {
  if (dato === "ventas") return empresasConFacturas();
  // Cartera = la del GRUPO (6 B2B). Se excluye a propósito a las empresas cuya
  // cartera va aparte y hoy no se sincroniza por cron (confecciones_boston):
  // alertar todos los días por algo que ya sabemos que está roto y que tiene
  // tarea propia es exactamente la alerta-que-suena-para-siempre que venimos
  // sacando. Cuando su sync se arregle, entra sola por `empresasConCxc()` o
  // saliendo de EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON.
  return empresasConCxc().filter((e) => !EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON.includes(e));
}

/**
 * Decide qué datos están viejos. PURA (sin I/O) para poder testear las dos
 * direcciones: que un dato fresco NO alerte y que uno viejo SÍ.
 */
export function clasificarDatosViejos(
  estados: readonly EstadoDato[],
  horasUmbral: number = HORAS_DATO_VIEJO,
): EstadoDato[] {
  return estados.filter((e) => e.horas === null || e.horas > horasUmbral);
}

/**
 * Mensaje para Daniel: qué está viejo, desde cuándo y qué significa. Sin nombres
 * internos de cron ni de tabla — eso ya no le sirve de nada.
 */
export function mensajeDatosViejos(viejos: readonly EstadoDato[]): string {
  const porDato = new Map<Dato, EstadoDato[]>();
  for (const v of viejos) {
    const l = porDato.get(v.dato) ?? [];
    l.push(v);
    porDato.set(v.dato, l);
  }

  const lineas: string[] = [];
  lineas.push(
    porDato.size === 1
      ? `Hay un dato de la app que está viejo.`
      : `Hay datos de la app que están viejos.`,
  );
  lineas.push("");

  for (const [dato, items] of porDato) {
    // El peor caso manda: si una empresa lleva 40 h y otra 26, lo que importa es
    // el 40 — y se nombran las empresas para que se sepa dónde mirar.
    const peor = items.reduce(
      (a, b) => ((b.horas ?? Infinity) > (a.horas ?? Infinity) ? b : a),
      items[0],
    );
    const cuanto =
      peor.horas === null
        ? "nunca se actualizó"
        : `lleva ${Math.floor(peor.horas)} horas sin actualizarse`;
    lineas.push(`• ${NOMBRE[dato]}: ${cuanto}.`);
    lineas.push(`  Empresas: ${items.map((i) => i.empresa).join(", ")}`);
  }

  lineas.push("");
  lineas.push(
    "Qué significa: lo que ves en pantalla para esas empresas no es lo de hoy. " +
      "Los números viejos siguen siendo correctos hasta la fecha que dicen; lo que falta es lo nuevo.",
  );
  lineas.push("Qué hacer: cxc/docs/runbook-base-lenta.md");
  return lineas.join("\n");
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Máximo `synced_at` de la cartera de una empresa. */
async function ultimaCartera(empresa: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select("synced_at")
    .eq("empresa_key", empresa)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cartera ${empresa}: ${error.message}`);
  return data?.synced_at ?? null;
}

/** Último sync de facturas exitoso de una empresa. Se ordena por `started_at`
 *  para usar el índice `idx_ssl_empresa_type_started`. */
async function ultimaVenta(empresa: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at, finished_at")
    .eq("empresa_key", empresa)
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ventas ${empresa}: ${error.message}`);
  return data?.finished_at ?? data?.started_at ?? null;
}

/** Mide los dos datos para todas sus empresas. Consultas PUNTUALES (una por
 *  empresa y dato, con `limit(1)` sobre índice) — nada de barridos: la base ya se
 *  cayó una vez por saturación. */
export async function medirFrescura(now: number = Date.now()): Promise<EstadoDato[]> {
  const out: EstadoDato[] = [];
  for (const dato of ["cartera", "ventas"] as const) {
    for (const empresa of empresasDe(dato)) {
      const ultimaIso = dato === "cartera" ? await ultimaCartera(empresa) : await ultimaVenta(empresa);
      const t = ultimaIso ? new Date(ultimaIso).getTime() : NaN;
      out.push({
        dato,
        empresa,
        ultimaIso,
        horas: Number.isFinite(t) ? (now - t) / 3600000 : null,
      });
    }
  }
  return out;
}

/**
 * ¿Ya se avisó en las últimas `HORAS_ENTRE_AVISOS`? **Fail-OPEN**: si no se puede
 * leer el registro, se avisa igual. Perder el aviso de un dato viejo cuesta más
 * que repetirlo — es el mismo criterio que ya usan `cheques-alert` y `db-salud`.
 */
export async function yaAvisoReciente(now: number = Date.now()): Promise<boolean> {
  try {
    const desde = new Date(now - HORAS_ENTRE_AVISOS * 3600000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", TIPO_DATO_VIEJO)
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
