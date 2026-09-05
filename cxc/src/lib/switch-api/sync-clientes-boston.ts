// ═══════════════════════════════════════════════════════════════════════════
//   EL DIRECTORIO DE CLIENTES DE CONFECCIONES BOSTON.
//
//   🩸 Estuvo congelado 37 días y nadie lo notó, porque ninguna alerta lo cubría.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LO QUE PASÓ (medido el 5-sep-2026) ──────────────────────────────────────
// Las 4.915 filas de `switch_clientes` de Boston tenían `synced_at` idéntico:
// **2026-07-30 06:31:07**, todas. Ningún cron las escribía. El único escritor
// del directorio vivía DENTRO del sync de estado de cuenta por API, y ese
// camino para Boston está vetado desde el 30-jul: son 4.912 llamadas HTTP, una
// por cliente, 54 min medidos contra un techo de función de 800 s
// (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`). Cuando su cartera se mudó al reporte
// web (`boston-cartera`), la cartera quedó al día y el directorio se quedó atrás
// sin que nada lo dijera.
//
// ── POR QUÉ SEMANAL ─────────────────────────────────────────────────────────
// Daniel: *«semanal»*. El dato se mueve poco —un cliente nuevo por semana en el
// peor caso— y cada corrida abre una sesión de Switch de esa empresa. No hace
// falta más.
//
// ── LO QUE ESTE SYNC NO HACE, Y ES LO MÁS IMPORTANTE ────────────────────────
// 🔴 **Escribe SOLO `switch_clientes` con `empresa_key = 'confecciones_boston'`.**
// No toca `clientes_master` ni por asomo. Daniel, textual: *«los clientes de
// Boston no quiero que toquen los de Fashion Group… no quiero volver a pasar por
// el mismo error»*. El error tiene fecha: Boston estuvo cinco semanas dentro de
// `clientes_master` —4.910 filas— y el ranking de Ventas publicó **$2,55
// millones de venta que no existió**, porque esa tabla no tiene `empresa_key`
// (una fila por CÓDIGO) y el cruce por nombre multiplicaba facturas.
// `sync-clientes-master.ts` sigue pidiendo por INCLUSIÓN de las 6 del grupo y
// así se queda.
//
// ── LAS GUARDAS ─────────────────────────────────────────────────────────────
// El upsert nunca borra: lo único que puede hacer daño es la MARCA DE AUSENTES
// (`activo = false`), que es la que decide qué clientes dejaron de existir. Dos
// condiciones antes de tocarla, y las dos tienen que darse:
//   1. **La lista vino completa** (`traerListaDeClientes`): Switch capea las
//      páginas en silencio y una paginación a medias marcaría vivos como
//      ausentes.
//   2. **La lista no encogió** por debajo de `PISO_DIRECTORIO` de lo que ya
//      conocemos. Es la misma guarda del reporte de cartera: una respuesta corta
//      cuadra perfectamente consigo misma y se ve sana.
// Si alguna falla, se escribe lo que llegó y **no se marca a nadie**. Una lista
// vacía no escribe ni marca: la corrida termina en `error`.

import { supabaseServer } from "@/lib/supabase-server";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { createSwitchClient } from "./client";
import {
  escribirDirectorioDeClientes,
  traerListaDeClientes,
  type ListaDeClientes,
} from "./clientes-directorio";
import {
  createSwitchSyncLog,
  finishSwitchSyncLog,
  type SwitchSyncTriggeredBy,
} from "./sync-log";

/** La única empresa que usa este camino, y no se lee de ninguna URL. */
export const EMPRESA_CLIENTES_APARTE: EmpresaKey = "confecciones_boston";

/**
 * Piso de «la lista vino completa», como fracción de los clientes que la tabla
 * YA conoce para esta empresa. Mismo criterio y mismo número que el reporte de
 * cartera (`PISO_CLIENTES_REPORTE`): por debajo de esto la marca de ausentes se
 * apaga, porque una respuesta corta se ve idéntica a «se fueron 1.400 clientes».
 * Boston tiene 4.915: 70% son 3.440.
 */
export const PISO_DIRECTORIO = 0.7;

export interface ResultadoClientesBoston {
  ok: boolean;
  empresaKey: string;
  /** Clientes que trajo Switch. */
  traidos: number;
  /** Lo que Switch dice que hay (0 = no lo reportó). */
  totalReportado: number;
  /** Filas upserted en `switch_clientes`. */
  escritos: number;
  /** ¿Se corrió la marca de ausentes? `false` = alguna guarda la apagó. */
  marcoAusentes: boolean;
  /** Filas que la tabla ya tenía para esta empresa, antes de la corrida. */
  conocidos: number;
  error?: string;
  /** Por qué no se marcaron ausentes, cuando corresponde decirlo. */
  nota?: string;
}

/** Cuántas filas conoce hoy la tabla para esa empresa. Solo para la guarda del
 *  piso: si no se puede leer, se prefiere NO marcar ausentes. */
async function clientesConocidos(empresaKey: string): Promise<number | null> {
  const { count, error } = await supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id", { count: "exact", head: true })
    .eq("empresa_key", empresaKey);
  if (error) {
    console.error(`[clientes ${empresaKey}] no pude contar lo que ya hay: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

/**
 * Trae el directorio de Boston desde Switch y lo escribe. Nunca lanza: devuelve
 * el resultado y deja la fila en `switch_sync_log`.
 */
export async function syncClientesBoston(opts?: {
  triggeredBy?: SwitchSyncTriggeredBy;
  /** Calcula y reporta, pero NO escribe. */
  dryRun?: boolean;
}): Promise<ResultadoClientesBoston> {
  const empresaKey = EMPRESA_CLIENTES_APARTE;
  const dryRun = opts?.dryRun === true;
  const runStamp = new Date().toISOString();
  const logId = dryRun
    ? null
    : await createSwitchSyncLog({
        empresaKey,
        syncType: "clientes",
        triggeredBy: opts?.triggeredBy ?? "cron",
      });

  const base: ResultadoClientesBoston = {
    ok: false,
    empresaKey,
    traidos: 0,
    totalReportado: 0,
    escritos: 0,
    marcoAusentes: false,
    conocidos: 0,
  };

  try {
    const conocidos = (await clientesConocidos(empresaKey)) ?? -1;
    const client = createSwitchClient(empresaKey);
    const lista: ListaDeClientes = await traerListaDeClientes(client);
    console.error(`[clientes ${empresaKey}] ${lista.cobertura}`);

    // Guard 1 — lista vacía: no se escribe NI se marca. Una respuesta vacía se
    // ve igual que «esta empresa se quedó sin clientes», y no lo es.
    if (lista.clientes.length === 0) {
      const error = "Switch devolvió cero clientes: no se escribió nada";
      await finishSwitchSyncLog(logId, "error", { errorMessage: error });
      return { ...base, conocidos: Math.max(conocidos, 0), error };
    }

    // Guard 2 — la lista encogió: se escribe, pero NO se marca a nadie ausente.
    const piso = conocidos > 0 ? Math.floor(conocidos * PISO_DIRECTORIO) : 0;
    const encogio = conocidos > 0 && lista.clientes.length < piso;
    const noSePuedeContar = conocidos < 0;
    const nota = encogio
      ? `la lista trajo ${lista.clientes.length} contra ${conocidos} conocidos (menos del ${Math.round(PISO_DIRECTORIO * 100)}%): no se marcó a nadie como ausente`
      : noSePuedeContar
        ? "no pude contar lo que ya había: no se marcó a nadie como ausente"
        : !lista.completa
          ? "la lista vino incompleta: no se marcó a nadie como ausente"
          : undefined;

    const listaSegura: ListaDeClientes = {
      ...lista,
      completa: lista.completa && !encogio && !noSePuedeContar,
    };

    if (dryRun) {
      return {
        ...base,
        ok: true,
        traidos: lista.clientes.length,
        totalReportado: lista.totalReportado,
        conocidos: Math.max(conocidos, 0),
        nota,
      };
    }

    const escritura = await escribirDirectorioDeClientes(empresaKey, listaSegura, runStamp);
    await finishSwitchSyncLog(logId, "success", {
      inserted: escritura.escritos,
      updated: 0,
      skipped: 0,
    });
    return {
      ok: true,
      empresaKey,
      traidos: lista.clientes.length,
      totalReportado: lista.totalReportado,
      escritos: escritura.escritos,
      marcoAusentes: escritura.marcoAusentes,
      conocidos: Math.max(conocidos, 0),
      nota,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[clientes ${empresaKey}] falló: ${error}`);
    await finishSwitchSyncLog(logId, "error", { errorMessage: error });
    return { ...base, error };
  }
}
