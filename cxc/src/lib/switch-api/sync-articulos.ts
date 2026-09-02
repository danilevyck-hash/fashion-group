// ─────────────────────────────────────────────────────────────────────────────
// Sync de ventas por ARTÍCULO/día → switch_articulo_diario.
//
// Fuente: /apireporte/ventasucursal (por sucursal, por DÍA, por artículo, con
// costo). Grano upsert = empresa × fecha × articulo_id × tipo (sin id de fila →
// se dedup por esa llave dentro del día). venta_total/costo_total se guardan
// como MAGNITUD; el signo lo aplica la lectura por tipo (solo NC resta; FA y
// CNF/Transacción suman). No incluye Notas de Débito.
// ─────────────────────────────────────────────────────────────────────────────

import { createSwitchClient } from "./client";
import { supabaseServer } from "@/lib/supabase-server";
import { esCostoSospechoso } from "./costo-guard";
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";
// Del módulo del #390 se conserva SOLO el rastro en base (`skip_details`); el
// resto (anti-loop y armado del mensaje) dejó de usarse al quitar el aviso.
import { detallesDeCostoSospechoso, type CostoSospechoso } from "./costo-sospechoso-aviso";

export interface ArticulosSyncResult {
  empresaKey: string;
  desde: string;
  hasta: string;
  dias: number;
  filas: number;
  costosSospechosos: number;
  /** Filas descartadas por el guard de montos imposibles (venta o costo). */
  montosImposibles: number;
}

const SUCURSAL_ID = 1; // PRINCIPAL (única en todas las empresas)

// ⚠️ NO SE AVISA POR TELEGRAM. Daniel lo pidió explícito el 3-ago-2026: *"no
// quiero mensaje de costos"*. Le llegaba repetido por confecciones_boston (el
// artículo "0806 AGUA MINERAL 600ML" con costo mal cargado en Switch) y no es
// accionable en el momento en que suena.
//
// Esto SUCEDE al #390, que lo había mudado de 📊 NEGOCIO a 🔧 SISTEMA con un
// anti-loop de 7 días. Cambiar de canal no alcanzó: Daniel no quiere el mensaje
// en ninguno. De aquel PR **se conserva el rastro en `skip_details`** — es la
// parte que sirve para auditar después sin escribirle a nadie.
//
// **La PROTECCIÓN sigue intacta**: `esCostoSospechoso` se sigue evaluando, la
// fila se sigue guardando con costo $0 para no dañar el margen, el conteo sigue
// viajando en `costosSospechosos` y el detalle sigue quedando en la base y en el
// log de la corrida. Lo único que se quitó es el mensaje.

function num(x: unknown): number {
  const n = parseFloat(String(x).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function* dateRange(desde: string, hasta: string): Generator<string> {
  const d = new Date(`${desde}T00:00:00Z`);
  const end = new Date(`${hasta}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export async function syncArticulosDiario(
  empresaKey: string,
  desde: string,
  hasta: string,
  triggeredBy: SwitchSyncTriggeredBy = "cron",
): Promise<ArticulosSyncResult> {
  // Corrida registrada en switch_sync_log (sync_type='articulos') para la
  // política anti-ruido 401 (alert-policy.ts). Degradable: sin log, el sync
  // corre igual y el 401 alerta inmediato (fail-open).
  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "articulos",
    triggeredBy,
    rangeFrom: desde,
    rangeTo: hasta,
  });

  try {
    const result = await syncArticulosDiarioInner(empresaKey, desde, hasta, logId);
    await finishSwitchSyncLog(logId, "success", {
      updated: result.filas,
      skipped: result.montosImposibles,
      skipDetails: result.skipDetails,
    });
    return result;
  } catch (err) {
    await finishSwitchSyncLog(logId, "error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function syncArticulosDiarioInner(
  empresaKey: string,
  desde: string,
  hasta: string,
  logId: string | null,
): Promise<ArticulosSyncResult & { skipDetails?: unknown[] }> {
  const client = createSwitchClient(empresaKey);
  const now = new Date().toISOString();
  let dias = 0;
  let filas = 0;
  const sospechosos: CostoSospechoso[] = [];

  // ⚠️ ARREGLO DE LA ASIMETRÍA. `esCostoSospechoso` mira el COSTO y deja pasar
  // la VENTA de la misma fila sin mirarla: con la venta corrupta el margen
  // queda igual de reventado y el guard no se entera. El guard compartido mira
  // la fila entera (venta_total Y costo_total) con el umbral relativo de la
  // tabla. Los dos guards conviven y hacen cosas distintas:
  //   • `esCostoSospechoso` = costo mal cargado en Switch → se guarda costo $0
  //     y avisa por 📊 NEGOCIO (texto de Daniel, no se toca).
  //   • el guard de montos = cifra IMPOSIBLE de la fuente → la fila NO se
  //     escribe (el upsert conserva el último valor bueno) y avisa por
  //     🔧 SISTEMA. Las demás filas del día se guardan igual.
  const umbralArticulo = await calibrarUmbral("articulo_diario", empresaKey);
  const rechazadasArticulo: Array<ReturnType<typeof particionarFilas<Record<string, unknown>>>["rechazadas"][number]> = [];

  for (const fecha of dateRange(desde, hasta)) {
    dias++;
    // Dedup por (articulo_id|tipo) dentro del día (por si paginación repite).
    const byKey = new Map<string, Record<string, unknown>>();
    let pagina = 1;
    for (;;) {
      const data = await client.getVentaSucursal({ fecha, sucursalId: SUCURSAL_ID, porPagina: 50, paginaActual: pagina });
      const arr = data?.ventasucursal ?? [];
      for (const a of arr) {
        const cantidadTotal = num(a.cantidadtotal);
        const costoTotal = num(a.costototal);
        const sospechoso = esCostoSospechoso(costoTotal, cantidadTotal);
        if (sospechoso) {
          sospechosos.push({
            fecha,
            codigo: a.codigo ?? null,
            descripcion: a.descripcion ?? null,
            tipo: a.tipo,
            cantidad: cantidadTotal,
            costo: costoTotal,
          });
        }
        byKey.set(`${a.articuloId}|${a.tipo}`, {
          empresa_key: empresaKey,
          fecha,
          articulo_id: a.articuloId,
          codigo: a.codigo ?? null,
          descripcion: a.descripcion ?? null,
          unidad_medida_id: a.unidadmedidaId ?? null,
          tipo: a.tipo,
          total_comprobantes: Number(a.totalcomprobantes) || 0,
          cantidad_total: cantidadTotal,
          venta_total: num(a.ventatotal),
          costo_total: sospechoso ? 0 : costoTotal,
          synced_at: now,
          updated_at: now,
        });
      }
      if (arr.length < 50) break;
      pagina++;
      if (pagina > 60) break;
    }
    if (byKey.size === 0) continue;

    const { buenas, rechazadas } = particionarFilas(
      "articulo_diario",
      [...byKey.values()],
      umbralArticulo,
      (f) => `${f.fecha} · ${f.codigo ?? f.articulo_id} [${f.tipo}]`,
    );
    if (rechazadas.length > 0) {
      rechazadasArticulo.push(...rechazadas);
      console.error(
        `[sync-articulos] ${empresaKey} ${fecha}: ${rechazadas.length} fila(s) con monto IMPOSIBLE (umbral ${umbralArticulo}) — no se guardaron`,
        rechazadas.map((r) => r.clave),
      );
    }
    if (buenas.length === 0) continue;

    const { error } = await supabaseServer
      .from("switch_articulo_diario")
      .upsert(buenas, { onConflict: "empresa_key,fecha,articulo_id,tipo" });
    if (error) throw new Error(`upsert ${empresaKey} ${fecha}: ${error.message}`);
    filas += buenas.length;
  }

  // Se declara acá arriba porque lo llenan DOS guards distintos: el de costos
  // sospechosos (abajo) y el de montos imposibles (más abajo).
  let skipDetails: unknown[] | undefined;

  if (sospechosos.length > 0) {
    // Rastro en el log de la corrida — el aviso a Telegram se quitó a pedido de
    // Daniel (ver la nota arriba de `num`); la fila ya se guardó con costo $0.
    console.error(`[sync-articulos] ${empresaKey}: ${sospechosos.length} fila(s) con costo sospechoso`, sospechosos);
    // El rastro en `skip_details` SE MANTIENE (viene del #390) aunque ya no se
    // avise: es lo que permite auditar después qué artículos vinieron mal y
    // desde cuándo, sin mandarle un mensaje a nadie. Van marcadas con
    // `campo = 'costo_sospechoso'`, así que NO se mezclan con los descartes del
    // guard de montos, que usan su propia familia.
    skipDetails = [...(skipDetails ?? []), ...detallesDeCostoSospechoso(sospechosos)];
  }

  // Aviso DESPUÉS de escribir; nunca tumba la corrida.
  if (rechazadasArticulo.length > 0) {
    skipDetails = detallesDeRechazo("articulo_diario", rechazadasArticulo, umbralArticulo);
    try {
      await avisarMontosImposibles({
        familia: "articulo_diario",
        empresaKey,
        syncType: "articulos",
        rechazadas: rechazadasArticulo,
        umbral: umbralArticulo,
        logId,
      });
    } catch (e) {
      console.error(`[sync-articulos] ${empresaKey}: no pude avisar el monto imposible: ${String(e)}`);
    }
  }

  return {
    empresaKey,
    desde,
    hasta,
    dias,
    filas,
    costosSospechosos: sospechosos.length,
    montosImposibles: rechazadasArticulo.length,
    skipDetails,
  };
}
