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

export interface ArticulosSyncResult {
  empresaKey: string;
  desde: string;
  hasta: string;
  dias: number;
  filas: number;
}

const SUCURSAL_ID = 1; // PRINCIPAL (única en todas las empresas)

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
): Promise<ArticulosSyncResult> {
  const client = createSwitchClient(empresaKey);
  const now = new Date().toISOString();
  let dias = 0;
  let filas = 0;

  for (const fecha of dateRange(desde, hasta)) {
    dias++;
    // Dedup por (articulo_id|tipo) dentro del día (por si paginación repite).
    const byKey = new Map<string, Record<string, unknown>>();
    let pagina = 1;
    for (;;) {
      const data = await client.getVentaSucursal({ fecha, sucursalId: SUCURSAL_ID, porPagina: 50, paginaActual: pagina });
      const arr = data?.ventasucursal ?? [];
      for (const a of arr) {
        byKey.set(`${a.articuloId}|${a.tipo}`, {
          empresa_key: empresaKey,
          fecha,
          articulo_id: a.articuloId,
          codigo: a.codigo ?? null,
          descripcion: a.descripcion ?? null,
          unidad_medida_id: a.unidadmedidaId ?? null,
          tipo: a.tipo,
          total_comprobantes: Number(a.totalcomprobantes) || 0,
          cantidad_total: num(a.cantidadtotal),
          venta_total: num(a.ventatotal),
          costo_total: num(a.costototal),
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

  return { empresaKey, desde, hasta, dias, filas };
}
