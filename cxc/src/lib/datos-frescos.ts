// ─────────────────────────────────────────────────────────────────────────────
// "Un dato que mirás está viejo" — la ÚNICA alerta de datos que quiere Daniel.
//
// Regla aprobada el 30-jul-2026: avisar si la **cartera** o las **ventas** llevan
// más de **24 horas** sin actualizarse. Nada más.
//
// 🩸 LOS PAGOS ENTRARON EL 9-sep-2026 — LA PLATA QUE ENTRA NO LA VIGILABA NADIE.
// Daniel, textual: «Siempre que me llega un telegrama me dices que es falsa
// alarma. Quiero que me lleguen de veras.» No es una cuarta regla: es un dato más
// de ésta, con el MISMO umbral de 24 h, el MISMO dedup de 20 h, la MISMA pasada
// de la reconciliación. Cero crons nuevos, cero DDL.
//   • Por qué NO va por la alerta B (silencio de escritura): medido el 9-sep-2026,
//     con las 4 pasadas del día corridas y todo sano, `switch_recibos` llevaba
//     **319 h sin una escritura en active_wear**, 151 en joystep y 123 en
//     active_shoes — el sync escribe por DIFERENCIA, así que una empresa sin
//     cobros nuevos no escribe nada estando perfecta. Backtest de B con 40 h:
//     26 mensajes en 90 días, TODOS falsos.
//   • Por qué SÍ va por la regla 1: no mira la tabla, mira la última CORRIDA
//     EXITOSA del sync. Backtest de 90 días: **6 mensajes, los 6 con una fila en
//     `error` detrás** (13, 16, 20, 21, 23 y 25-jun-2026). Como comparten mensaje
//     y dedup con las ventas, el costo MARGINAL real es **1 mensaje más en 90
//     días**: los otros 5 días el aviso salía igual y los pagos solo agregan una
//     línea. El 16-jun las ventas estaban bien y los cobros parados — ese día
//     nadie dijo nada.
//   • Y el agujero era real: de esas 6 averías la regla 2 avisó UNA sola
//     (active_shoes, 21-jun, dos fallos seguidos). Las otras cinco fueron un
//     tropiezo suelto que nunca llegó a dos, mientras los cobros de active_shoes
//     estuvieron 72 h sin llegar (19 al 22-jun).
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
  empresasConEstadoCuenta,
  empresasConFacturas,
  empresasConRecibos,
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

/** Los TRES datos que Daniel mira y que esta regla vigila. */
export type Dato = "cartera" | "ventas" | "pagos";

/** Cómo se llama cada dato cuando se lo nombra en un mensaje. Es la palabra de
 *  Daniel, no la nuestra: él dice «pagos», no «recibos» ni «cobros». */
const NOMBRE: Record<Dato, string> = {
  cartera: "la cartera (lo que te deben)",
  ventas: "las ventas",
  pagos: "los pagos (la plata que te entra)",
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
 *
 * • **pagos → `switch_sync_log` (`sync_type='recibos'`, `status='success'`).**
 *   🔴 Y por el MISMO motivo que las ventas, pero peor: `switch_recibos` se
 *   escribe por DIFERENCIA (`diffRecibos` borra e inserta solo lo que cambió),
 *   así que su `synced_at` no dice "cuándo corrió el sync" sino "cuándo cambió
 *   un cobro". Medido el 9-sep-2026 con todo sano: active_wear 319 h sin una
 *   escritura, joystep 151 h, active_shoes 123 h. Preguntarle a la tabla sería
 *   el falso positivo eterno; preguntarle a la corrida acierta.
 */
export interface EstadoDato {
  dato: Dato;
  empresa: string;
  ultimaIso: string | null;
  horas: number | null;
}

/**
 * Empresas que cuentan para cada dato.
 *
 * ─── CARTERA = TODA cartera que Daniel MIRA, no solo la del grupo ────────────
 *
 * `empresasConEstadoCuenta()` = las 6 del grupo + `confecciones_boston`, o sea
 * las empresas cuyos saldos traemos a `switch_estadocuenta`. Cada una tiene una
 * pantalla donde alguien les cree: las 6 en el panel del CXC, Boston en su
 * pestaña. Si el dato de cualquiera de ellas se congela, la pantalla miente — y
 * ésa es exactamente la pregunta que esta regla vino a contestar.
 *
 * 🩸 **Boston estaba excluida y el motivo se venció** (24-ago-2026). El filtro
 * era `EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`, y el motivo escrito era "su cartera
 * hoy no se sincroniza por cron". Eso fue verdad **cuatro días**: el 30-jul-2026
 * nació `/api/cron/boston-cartera`, que la trae del reporte web todos los días a
 * las 08:10 UTC. La lista, en cambio, **nunca dejó de ser correcta para lo suyo**
 * — dice "el estadocuenta POR API no corre por cron para esta empresa" y sigue
 * gobernando el bloque `all-0630` y los pares de la reconciliación. Usarla acá
 * era leerla como si dijera otra cosa, y el precio se cobró entero: del 20 al 24
 * de agosto la cartera de Boston estuvo congelada (Switch cambió el motor de sus
 * reportes el 19-ago 12:37 y la ruta que usábamos dejó de existir) y **la regla 1
 * no sonó ni una vez**. Cinco días de silencio.
 *
 * No es una alerta nueva ni una cuarta regla: es la regla 1 de siempre, con el
 * mismo umbral de 24 h y el mismo dedup, mirando también la cartera que ya
 * mostrábamos en pantalla. La lista se DERIVA de `EMPRESA_SYNC_CAPABILITIES`, así
 * que una empresa que mañana empiece a traer saldos nace vigilada.
 *
 * ⚠️ **Esto NO mezcla a Boston con el grupo.** La medición es POR EMPRESA
 * (`.eq("empresa_key", …)`, una consulta por empresa) y el mensaje NOMBRA a cada
 * una: no hay un total, ni una suma, ni una fila de Boston contestando una
 * pregunta del grupo. Lo único que comparten es la frase "la cartera está vieja",
 * que no es plata.
 *
 * ─── PAGOS = LAS 8 QUE TRAEN COBROS ──────────────────────────────────────────
 *
 * `empresasConRecibos()` = las 6 del grupo + Multifashion + Boston, DERIVADA de
 * `EMPRESA_SYNC_CAPABILITIES`: una empresa que mañana empiece a traer cobros nace
 * vigilada sin que nadie se acuerde de agregarla. Los cobros de Boston y los de
 * Multifashion también son plata que entra, y que su sync se pare es un problema
 * aunque su cartera no se sume con la del grupo.
 *
 * ⚠️ **Esto tampoco mezcla a Boston con el grupo**, por lo mismo de arriba: se
 * mide empresa por empresa y el mensaje las NOMBRA. No hay un total ni una suma.
 */
export function empresasDe(dato: Dato): string[] {
  if (dato === "ventas") return empresasConFacturas();
  if (dato === "pagos") return empresasConRecibos();
  return empresasConEstadoCuenta();
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

/**
 * Última corrida EXITOSA de un sync para una empresa. Se ordena por `started_at`
 * para usar el índice `idx_ssl_empresa_type_started`.
 *
 * 🔑 **Ésta es la pregunta que hace que los pagos se puedan vigilar.** Mirar la
 * TABLA (`switch_recibos.synced_at`) no sirve: el sync escribe por DIFERENCIA,
 * así que una empresa sin cobros nuevos pasa días sin una sola escritura estando
 * perfectamente sana. Mirar la CORRIDA contesta lo que de verdad importa —
 * ¿seguimos pudiendo traer los pagos?— y no se mueve con el ritmo del negocio.
 *
 * `etiqueta` es cómo se nombra el dato si la lectura falla; nunca sale a
 * Telegram, es para el log.
 */
async function ultimoSyncExitoso(
  empresa: string,
  syncType: string,
  etiqueta: string,
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at, finished_at")
    .eq("empresa_key", empresa)
    .eq("sync_type", syncType)
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`${etiqueta} ${empresa}: ${error.message}`);
  return data?.finished_at ?? data?.started_at ?? null;
}

/** Mide los TRES datos para todas sus empresas. Consultas PUNTUALES (una por
 *  empresa y dato, con `limit(1)` sobre índice) — nada de barridos: la base ya se
 *  cayó una vez por saturación. Los pagos suman 8 consultas más por pasada, del
 *  mismo tamaño que las que ya se hacían. */
export async function medirFrescura(now: number = Date.now()): Promise<EstadoDato[]> {
  const out: EstadoDato[] = [];
  for (const dato of ["cartera", "ventas", "pagos"] as const) {
    for (const empresa of empresasDe(dato)) {
      const ultimaIso =
        dato === "cartera"
          ? await ultimaCartera(empresa)
          : dato === "ventas"
            ? await ultimoSyncExitoso(empresa, "facturas", "ventas")
            : await ultimoSyncExitoso(empresa, "recibos", "pagos");
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
