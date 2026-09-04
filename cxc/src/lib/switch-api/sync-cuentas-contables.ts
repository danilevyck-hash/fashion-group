/**
 * Sincronización del CATÁLOGO DE CUENTAS de Switch.
 *
 * ── 🔑 VIAJA PEGADO AL SYNC DE EGRESOS, EN LA MISMA SESIÓN ─────────────────
 *
 * No tiene cron propio y no debe tenerlo. El login web usa `changesession="SI"`,
 * que TOMA la sesión y EXPULSA a quien esté en el panel de esa empresa: un cron
 * aparte serían 7 expulsiones más por día para traer una lista de nombres que
 * casi nunca cambia. `syncEmpresaEgresos` ya abre esa sesión a las 10:35 UTC
 * (05:35 a.m. de Panamá) — el catálogo entra ahí, cuesta UN GET y cero logins.
 *
 * ── 🔴 NUNCA PUEDE TUMBAR AL SYNC DE EGRESOS ───────────────────────────────
 *
 * Los egresos son la PLATA; los nombres de cuenta son cómo se lee esa plata. Si
 * el catálogo falla, el mes de egresos tiene que entrar igual y la pantalla
 * mostrar los códigos pelados, que es exactamente como se veía antes. Por eso
 * esta función NUNCA lanza: devuelve el resultado y el que llama decide.
 *
 * ── POR QUÉ NO ALERTA ──────────────────────────────────────────────────────
 *
 * La lista de alertas de 🔧 SISTEMA está CERRADA (ver CLAUDE.md) y un nombre de
 * cuenta que falta no entra en ninguna de las cuatro reglas: no es un dato viejo
 * que se mire, no deja nada roto, y no hay nada que Daniel pueda hacer al
 * respecto esa mañana. El rastro queda en `switch_sync_log` (fila propia
 * `cuentas_contables`) y en la respuesta del cron, que es donde se mira cuando
 * se sospecha. Agregar una 5ª alerta por esto sería la alerta que suena para
 * siempre.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { fetchCatalogoCuentas, type WebSession } from "./web-client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import {
  normalizarCatalogo,
  catalogoUtilizable,
  MINIMO_CUENTAS,
} from "@/lib/cuentas/catalogo";

/** Cuántas cuentas se mandan por sentencia. El catálogo de una empresa ronda las
 *  centenas; 500 es el mismo tamaño que usa el resto del repo. */
const LOTE = 500;

export interface ResultadoCuentas {
  empresaKey: string;
  ok: boolean;
  /** Cuentas escritas. */
  cuentas?: number;
  /** Nodos que vinieron y no se pudieron usar (sin nombre, código raro…). */
  descartados?: number;
  error?: string;
}

// Historia (ago-2026): acá vivía `cuentasInstalado()`, una sonda que ANTES de
// pedirle el catálogo a Switch preguntaba si `cuentas_contables` existía y, si
// no, devolvía `{ ok: true, omitido: "la migración … todavía no corrió" }`.
// Tolerancia retirada el 3-sep-2026: la tabla existe desde
// 20260813180000_cuentas_contables.sql (verificado en producción). La sonda se
// fue entera: la sesión ya está abierta (la comparte con egresos), el catálogo
// cuesta UN GET, y si la base no contesta el upsert de abajo lo dice con
// `ok:false` y su mensaje — sin disfrazar un permiso o un timeout de "todavía no
// está instalado".

/**
 * Trae y guarda el catálogo de UNA empresa, **reusando una sesión ya abierta**.
 * Nunca lanza.
 */
export async function syncCuentasContables(session: WebSession): Promise<ResultadoCuentas> {
  const empresaKey = session.empresaKey;

  const logId = await createSwitchSyncLog({ empresaKey, syncType: "cuentas_contables" });

  try {
    const { nodos } = await fetchCatalogoCuentas(session);
    const { cuentas, descartados } = normalizarCatalogo(nodos);

    // ── Guard del catálogo CORTO ──
    // El upsert PISA lo que toca: escribir una lista recortada dejaría el
    // catálogo a medias sin un solo error, y lo que se pierde son nombres que ya
    // estaban buenos. Ante la duda no se escribe nada.
    if (!catalogoUtilizable({ cuentas, descartados })) {
      throw new Error(
        `el catálogo trajo ${cuentas.length} cuentas utilizables (mínimo ${MINIMO_CUENTAS}) ` +
          `de ${nodos.length} nodos; parece una respuesta a medias, no se escribió nada`,
      );
    }

    const filas = cuentas.map((c) => ({
      empresa_key: empresaKey,
      cuenta: c.cuenta,
      nombre: c.nombre,
      // El nombre CRUDO se guarda para poder auditar contra el panel: los
      // nombres de Switch vienen con espacios de más y lo que se pinta es el
      // normalizado, así que sin el original no habría con qué comparar.
      nombre_switch: c.nombreCrudo,
      nivel: c.nivel,
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < filas.length; i += LOTE) {
      const { error } = await supabaseServer
        .from("cuentas_contables")
        .upsert(filas.slice(i, i + LOTE), { onConflict: "empresa_key,cuenta" });
      if (error) throw new Error(`no se pudieron guardar las cuentas: ${error.message}`);
    }

    await finishSwitchSyncLog(logId, "success", {
      inserted: filas.length,
      skipped: descartados.length,
    });

    return {
      empresaKey,
      ok: true,
      cuentas: filas.length,
      descartados: descartados.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    return { empresaKey, ok: false, error: msg };
  }
}
