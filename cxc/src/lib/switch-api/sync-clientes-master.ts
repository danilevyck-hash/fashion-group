// ─────────────────────────────────────────────────────────────────────────────
// Refresco de clientes_master (datos fiscales) desde switch_clientes.
//
// Extraído del route /api/cron/sync-clientes-master (antes inline) para poder
// invocarlo IN-PROCESS desde la reconciliación cuando el cron diario se pierde
// (scheduler de Vercel). El route sigue siendo el caller de producción; la
// reconciliación es el caller de recuperación. La lógica vive aquí, una sola vez.
//
// QUÉ REFRESCA (SOLO fiscal): nombre, razon_social, identificacion (RUC), dv.
// NUNCA toca telefono/celular/email/notas/provincia — editables en la app; el
// payload uniforme sin esas columnas garantiza que el UPSERT (merge-duplicates)
// solo actualice las que mandamos.
//
// FUENTE: lee de NUESTRA DB (switch_clientes), NO pega al API de Switch → cero
// riesgo de colisión de sesión única.
//
// NO registra heartbeat ni logCronError: eso es responsabilidad del caller
// (route de producción o reconciliación), que mapea este resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

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

export interface ClientesMasterResult {
  ok: boolean;
  source_rows: number;
  distinct_codigos: number;
  upserted: number;
  skipped_sin_nombre: number;
  synced_at: string;
  /** Presente solo si ok=false. */
  error?: string;
}

/**
 * Refresca clientes_master desde switch_clientes. Tolerante: nunca lanza —
 * devuelve `{ ok:false, error }` para que el caller decida cómo reportar.
 */
export async function syncClientesMaster(): Promise<ClientesMasterResult> {
  const now = new Date().toISOString();
  const empty = { source_rows: 0, distinct_codigos: 0, upserted: 0, skipped_sin_nombre: 0, synced_at: now };

  // 1. Traer todos los clientes del espejo de Switch, paginado.
  //    - Excluye american_classic: son clientes retail ACS (la fidelización lee
  //      switch_clientes directo), NO directorio B2B — decisión Daniel 4-jul-2026.
  //      Además evita el O(N×M) del trigger trg_refresh_wholesale sobre ventas_raw.
  //    - PostgREST trunca silenciosamente a 1,000 filas por request → paginamos
  //      con .range() hasta que llegue una página incompleta. Tiebreaker por id
  //      para que la paginación sea estable (synced_at empata dentro de un sync).
  const PAGE = 1000;
  const rows: SwitchClienteRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("switch_clientes")
      .select("codigo, nombre, razonsocial, identificacion, raw_data, synced_at")
      .neq("empresa_key", "american_classic")
      .order("synced_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      return { ok: false, ...empty, error: error.message };
    }

    const batch = (data ?? []) as SwitchClienteRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  // 2. Dedup por codigo: switch_clientes tiene una fila por (empresa, cliente);
  //    la identidad fiscal es la misma. Orden desc por synced_at → la primera
  //    fila de cada codigo es la más reciente.
  const byCodigo = new Map<string, SwitchClienteRow>();
  for (const row of rows) {
    const codigo = cleanText(row.codigo);
    if (!codigo) continue;
    if (!byCodigo.has(codigo)) byCodigo.set(codigo, row);
  }

  // 3. Armar payload uniforme (SOLO campos fiscales).
  const payload: MasterUpsertRow[] = [];
  let skippedSinNombre = 0;
  for (const [codigo, row] of byCodigo) {
    // TCKCTA = pseudo-cliente de contado (varios nombres por empresa); lo
    // normalizamos igual que el seed para que la ficha lo muestre consistente.
    const nombre = codigo === "TCKCTA" ? "VENTAS LOCAL" : cleanText(row.nombre) ?? "";
    if (!nombre) {
      skippedSinNombre++;
      continue;
    }

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

  const sourceRows = rows.length;

  if (payload.length === 0) {
    return {
      ok: false,
      ...empty,
      source_rows: sourceRows,
      distinct_codigos: byCodigo.size,
      error: "switch_clientes vacío o sin filas válidas",
    };
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
      return {
        ok: false,
        source_rows: sourceRows,
        distinct_codigos: byCodigo.size,
        upserted,
        skipped_sin_nombre: skippedSinNombre,
        synced_at: now,
        error: upErr.message,
      };
    }
    upserted += slice.length;
  }

  return {
    ok: true,
    source_rows: sourceRows,
    distinct_codigos: byCodigo.size,
    upserted,
    skipped_sin_nombre: skippedSinNombre,
    synced_at: now,
  };
}
