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
import { sendTelegramAlert } from "@/lib/telegram";
import { esCostoSospechoso } from "./costo-guard";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";
import { enviarNegocio } from "@/lib/alertas/canal";

export interface ArticulosSyncResult {
  empresaKey: string;
  desde: string;
  hasta: string;
  dias: number;
  filas: number;
  costosSospechosos: number;
}

const SUCURSAL_ID = 1; // PRINCIPAL (única en todas las empresas)

interface CostoSospechoso {
  fecha: string;
  codigo: string | null;
  descripcion: string | null;
  tipo: string;
  cantidad: number;
  costo: number;
}

function fmtMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

async function alertarCostosSospechosos(empresaKey: string, filas: CostoSospechoso[]): Promise<void> {
  const detalle = filas
    .slice(0, 5)
    .map((f) => {
      const unit = f.cantidad > 0 ? ` (≈ ${fmtMonto(f.costo / f.cantidad)}/und)` : "";
      const desc = (f.descripcion ?? "").slice(0, 40);
      return `• ${f.fecha} · ${f.codigo ?? "?"} ${desc} [${f.tipo}]: costo ${fmtMonto(f.costo)} × ${f.cantidad} und${unit}`;
    })
    .join("\n");
  const extra = filas.length > 5 ? `\n…y ${filas.length - 5} más.` : "";
  await enviarNegocio(
    `⚠️ Costo sospechoso en artículos — ${empresaKey}\n${detalle}${extra}\n` +
      `Se guardaron con costo $0 para no dañar el margen. ` +
      `Corrige el costo del artículo en Switch y relanza switch-articulos de ese día.`,
  );
}

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
    const result = await syncArticulosDiarioInner(empresaKey, desde, hasta);
    await finishSwitchSyncLog(logId, "success", { updated: result.filas });
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
): Promise<ArticulosSyncResult> {
  const client = createSwitchClient(empresaKey);
  const now = new Date().toISOString();
  let dias = 0;
  let filas = 0;
  const sospechosos: CostoSospechoso[] = [];

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

    const { error } = await supabaseServer
      .from("switch_articulo_diario")
      .upsert([...byKey.values()], { onConflict: "empresa_key,fecha,articulo_id,tipo" });
    if (error) throw new Error(`upsert ${empresaKey} ${fecha}: ${error.message}`);
    filas += byKey.size;
  }

  if (sospechosos.length > 0) {
    console.error(`[sync-articulos] ${empresaKey}: ${sospechosos.length} fila(s) con costo sospechoso`, sospechosos);
    await alertarCostosSospechosos(empresaKey, sospechosos);
  }

  return { empresaKey, desde, hasta, dias, filas, costosSospechosos: sospechosos.length };
}
