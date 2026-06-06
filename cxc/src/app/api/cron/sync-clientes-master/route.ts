// ─────────────────────────────────────────────────────────────────────────────
// Cron diario: refresca clientes_master (datos fiscales) desde switch_clientes.
//
// PROBLEMA QUE RESUELVE: clientes_master se pobló UNA sola vez con un CSV manual
// (seed-clientes-master, 9-may-2026) y nunca más → la ficha mostraba "última
// sincronización 9 may" indefinidamente. El dato fresco SÍ existe: el sync
// nocturno de facturas mantiene switch_clientes al día (espejo del listado de
// Switch). Este cron propaga esa frescura al maestro.
//
// QUÉ REFRESCA (SOLO fiscal): nombre, razon_social, identificacion (RUC), dv.
// NUNCA toca telefono/celular/email/notas — esos son EDITABLES en la app
// (ficha → PATCH) y el sync semanal no debe pisarlos. provincia tampoco se
// incluye: switch_clientes.raw_data no la trae (solo zona/dirección), así que
// se preserva la del seed. El payload uniforme sin esas columnas garantiza que
// el UPSERT (merge-duplicates) solo actualice las que mandamos.
//
// FUENTE: lee de NUESTRA DB (switch_clientes), NO pega al API de Switch → cero
// riesgo de colisión de sesión única. Schedule 0 7 UTC: después de switch-sync
// (5:30-6:30, que llena switch_clientes), antes de utilidad/recibos/articulos.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_NAME = "sync-clientes-master";

// N2: UPPER + quita [.,] + colapsa espacios (mismo algoritmo que cxc / ventas).
const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const cleanText = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

interface SwitchClienteRow {
  codigo: string | null;
  nombre: string | null;
  razonsocial: string | null;
  identificacion: string | null;
  raw_data: Record<string, unknown> | null;
  synced_at: string | null;
}

interface MasterUpsertRow {
  codigo: string;
  nombre: string;
  nombre_normalized: string;
  razon_social: string | null;
  identificacion: string | null;
  dv: string | null;
  last_synced_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 1. Traer todos los clientes del espejo de Switch.
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("codigo, nombre, razonsocial, identificacion, raw_data, synced_at")
    .order("synced_at", { ascending: false });

  if (error) {
    console.error("[cron/sync-clientes-master] read switch_clientes:", error.message);
    await logCronError("sync_clientes_master_failed", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // 2. Dedup por codigo: switch_clientes tiene una fila por (empresa, cliente);
  //    la identidad fiscal es la misma. Orden desc por synced_at → la primera
  //    fila de cada codigo es la más reciente.
  const byCodigo = new Map<string, SwitchClienteRow>();
  for (const row of (data ?? []) as SwitchClienteRow[]) {
    const codigo = cleanText(row.codigo);
    if (!codigo) continue;
    if (!byCodigo.has(codigo)) byCodigo.set(codigo, row);
  }

  // 3. Armar payload uniforme (SOLO campos fiscales).
  const now = new Date().toISOString();
  const payload: MasterUpsertRow[] = [];
  let skippedSinNombre = 0;
  for (const [codigo, row] of byCodigo) {
    // TCKCTA = pseudo-cliente de contado (varios nombres por empresa); lo
    // normalizamos igual que el seed para que la ficha lo muestre consistente.
    const nombre = codigo === "TCKCTA" ? "VENTAS LOCAL" : cleanText(row.nombre) ?? "";
    if (!nombre) { skippedSinNombre++; continue; }

    const dvRaw = row.raw_data && typeof row.raw_data.dv === "string" ? row.raw_data.dv : null;

    payload.push({
      codigo,
      nombre,
      nombre_normalized: N2(nombre),
      razon_social: cleanText(row.razonsocial),
      identificacion: cleanText(row.identificacion),
      dv: cleanText(dvRaw),
      last_synced_at: now,
    });
  }

  if (payload.length === 0) {
    await logCronError("sync_clientes_master_failed", "switch_clientes vacío o sin filas válidas");
    return NextResponse.json({ ok: false, error: "switch_clientes vacío o sin filas válidas" }, { status: 500 });
  }

  // 4. UPSERT onConflict=codigo. Al no incluir telefono/celular/email/notas/
  //    provincia en el payload, merge-duplicates deja esas columnas intactas.
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const slice = payload.slice(i, i + BATCH);
    const { error: upErr } = await supabaseServer
      .from("clientes_master")
      .upsert(slice, { onConflict: "codigo", ignoreDuplicates: false });
    if (upErr) {
      console.error(`[cron/sync-clientes-master] upsert batch [${i}..${i + slice.length}):`, upErr.message);
      await logCronError("sync_clientes_master_failed", upErr.message);
      return NextResponse.json(
        { ok: false, error: upErr.message, upserted_before_error: upserted },
        { status: 500 },
      );
    }
    upserted += slice.length;
  }

  console.log(`[cron/sync-clientes-master] ${upserted} clientes refrescados (fiscal) desde switch_clientes`);
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    ok: true,
    source_rows: data?.length ?? 0,
    distinct_codigos: byCodigo.size,
    upserted,
    skipped_sin_nombre: skippedSinNombre,
    synced_at: now,
  });
}
