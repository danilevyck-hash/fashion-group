// ─────────────────────────────────────────────────────────────────────────────
// Refresco de clientes_master (datos fiscales) desde switch_clientes.
//
// Extraído del route /api/cron/sync-clientes-master (antes inline) para poder
// invocarlo IN-PROCESS desde la reconciliación cuando el cron diario se pierde
// (scheduler de Vercel). El route sigue siendo el caller de producción; la
// reconciliación es el caller de recuperación. La lógica vive aquí, una sola vez.
//
// 🩸 EL HUECO QUE TENÍA, medido el 8-ago-2026 — dos cosas distintas:
//
//   1. EL NOMBRE LO ELEGÍA EL CALENDARIO DE CRONS. El dedup por código se
//      quedaba con la fila de `synced_at` más reciente, o sea con la empresa
//      cuyo cron corrió último (joystep, 05:42). Como cada empresa de Switch
//      lleva su PROPIA numeración, hay 4 códigos del grupo con más de un nombre
//      —D-134, D-26, D-170 y TCKCTA— y para esos el resultado no era una función
//      de los datos: mover una entrada de vercel.json 15 minutos habría
//      renombrado clientes en silencio. Ahora la regla es explícita y vive en
//      `lib/clientes/nombre-canonico` (gana el nombre que más empresas usan),
//      que reproduce EXACTAMENTE lo que hay hoy en producción.
//   2. SE PAGINABA POR UNA COLUMNA QUE SE MUEVE (`synced_at`, que el sync
//      reescribe) → filas salteadas o repetidas entre páginas, sin error. Ahora
//      va por `id` con `leerTodoPaginado`, que además verifica contra el COUNT.
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
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  elegirNombreCanonico,
  codigosAmbiguos,
  type CandidatoNombre,
  type CodigoAmbiguo,
} from "@/lib/clientes/nombre-canonico";

// N2: UPPER + quita [.,] + colapsa espacios (mismo algoritmo que cxc / ventas).
const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const cleanText = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

interface SwitchClienteRow {
  empresa_key: string;
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
  /**
   * Códigos que llevan MÁS DE UN nombre entre las empresas del grupo. No es un
   * error del sync: es un dato de Switch que hay que corregir en su panel. Antes
   * el sync elegía uno y se callaba; ahora se ven.
   */
  codigos_ambiguos: CodigoAmbiguo[];
  /** Presente solo si ok=false. */
  error?: string;
}

/**
 * Refresca clientes_master desde switch_clientes. Tolerante: nunca lanza —
 * devuelve `{ ok:false, error }` para que el caller decida cómo reportar.
 */
export async function syncClientesMaster(): Promise<ClientesMasterResult> {
  const now = new Date().toISOString();
  const empty = {
    source_rows: 0,
    distinct_codigos: 0,
    upserted: 0,
    skipped_sin_nombre: 0,
    synced_at: now,
    codigos_ambiguos: [] as CodigoAmbiguo[],
  };

  // 1. Traer todos los clientes del espejo de Switch, paginado.
  //    - Excluye american_classic: son clientes retail ACS (la fidelización lee
  //      switch_clientes directo), NO directorio B2B — decisión Daniel 4-jul-2026.
  //      Además evita el O(N×M) del trigger trg_refresh_wholesale sobre ventas_raw.
  //
  //    🩸 SE PAGINA POR `id`, NO POR `synced_at` (8-ago-2026). Antes el orden era
  //    `synced_at DESC` — una columna que el sync de Switch REESCRIBE. Paginar
  //    por una llave que se mueve entre una página y la siguiente hace que filas
  //    se salteen o se repitan, en silencio y sin error: `confecciones_boston`
  //    son 4.915 de las 5.750 filas y su sync de las 06:30 puede solaparse con
  //    este de las 07:00. `leerTodoPaginado` además VERIFICA contra un
  //    `count: "exact"` y revienta si no cuadra, en vez de seguir con menos.
  let rows: SwitchClienteRow[];
  try {
    rows = await leerTodoPaginado<SwitchClienteRow>(
      "switch_clientes (maestro de clientes)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("switch_clientes")
          .select(
            "empresa_key, codigo, nombre, razonsocial, identificacion, raw_data, synced_at",
            pedirCount ? { count: "exact" } : {},
          )
          .neq("empresa_key", "american_classic")
          .order("id", { ascending: true })
          .range(from, to),
    );
  } catch (e) {
    return { ok: false, ...empty, error: e instanceof Error ? e.message : String(e) };
  }

  // 2. Agrupar por codigo: switch_clientes tiene una fila por (empresa, cliente).
  //    Los datos FISCALES (RUC, razón social, dv) son los mismos en todas, pero
  //    el NOMBRE no siempre — ver `lib/clientes/nombre-canonico`.
  const byCodigo = new Map<string, SwitchClienteRow[]>();
  for (const row of rows) {
    const codigo = cleanText(row.codigo);
    if (!codigo) continue;
    const lista = byCodigo.get(codigo);
    if (lista) lista.push(row);
    else byCodigo.set(codigo, [row]);
  }

  // 2b. Los códigos que llevan más de un nombre. No frenan el sync: se reportan.
  const ambiguos = codigosAmbiguos(
    new Map<string, CandidatoNombre[]>([...byCodigo].map(([c, rs]) => [c, rs])),
  );

  // 3. Armar payload uniforme (SOLO campos fiscales).
  const payload: MasterUpsertRow[] = [];
  let skippedSinNombre = 0;
  for (const [codigo, filas] of byCodigo) {
    // TCKCTA = pseudo-cliente de contado (varios nombres por empresa); lo
    // normalizamos igual que el seed para que la ficha lo muestre consistente.
    //
    // Para el resto, el nombre lo decide una REGLA sobre los datos (el que más
    // empresas comparten), no el reloj: antes ganaba la empresa cuyo cron había
    // corrido último, así que mover una entrada de vercel.json renombraba
    // clientes en silencio.
    const nombre = codigo === "TCKCTA" ? "VENTAS LOCAL" : elegirNombreCanonico(filas) ?? "";
    if (!nombre) {
      skippedSinNombre++;
      continue;
    }

    // Los campos fiscales sí son los mismos en todas las empresas: se toma la
    // primera fila que los tenga, para no perderlos si una empresa los deja en
    // blanco.
    const row =
      filas.find((f) => cleanText(f.identificacion) || cleanText(f.razonsocial)) ?? filas[0];

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
      codigos_ambiguos: ambiguos,
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
        codigos_ambiguos: ambiguos,
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
    codigos_ambiguos: ambiguos,
  };
}
