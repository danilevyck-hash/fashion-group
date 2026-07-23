"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente compartido de /api/admin/sync-now (lo usan SyncNowButton y
// CatalogoSyncNow — regla GLOBAL de todos los botones "Actualizar ahora").
//
// syncConEnganche: dispara UNA opción y, si hay un sync de esa empresa
// corriendo YA (409 motivo "running" — manual o cron), NO reporta nada al
// usuario: se engancha al sync en curso re-intentando el POST cada ~5s hasta
// que termine.
//   - running → success: el re-intento cae en cooldown → se trata como éxito
//     (la data quedó fresca, como si el clic la hubiera actualizado).
//   - running → error: el re-intento adquiere el lock libre y corre el sync
//     manual (reintento automático único); si ese también falla, recién ahí
//     se devuelve error.
// Cero mensajes tipo "espera al sync de las HH:MM" en todo el sistema.
// El 409 cooldown DIRECTO (primer intento) se devuelve como "fresco" con su
// detalle ("Ya se actualizó hace X min…") para mostrarse tal cual.
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncNowRequest {
  modulo: string;
  empresa?: string;
}

interface SyncApiJson {
  ok?: boolean;
  resumen?: string;
  motivo?: string;
  detalle?: string;
  error?: string;
}

// Re-intento cada 5s, tope 8 min (los syncs largos —catálogo Reebok ~3 min,
// cron tipo=all— caben; RUNNING_STALE server-side es 30 min).
const ENGANCHE_POLL_MS = 5_000;
const ENGANCHE_MAX_MS = 8 * 60_000;

export const MSG_ERROR_GENERICO = "No se pudo actualizar. Intenta de nuevo en unos segundos.";
const MSG_ERROR_RED = "No se pudo actualizar. Revisa tu conexión e intenta de nuevo.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function postSyncNow(
  opcion: SyncNowRequest,
): Promise<{ status: number; json: SyncApiJson | null }> {
  const res = await fetch("/api/admin/sync-now", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modulo: opcion.modulo, empresa: opcion.empresa }),
  });
  const json = (await res.json().catch(() => null)) as SyncApiJson | null;
  return { status: res.status, json };
}

export type ResultadoSync =
  | { tipo: "ok"; resumen?: string }
  /** Cooldown directo al PRIMER intento: la data ya estaba fresca. */
  | { tipo: "fresco"; detalle: string }
  | { tipo: "error"; mensaje: string };

export async function syncConEnganche(opcion: SyncNowRequest): Promise<ResultadoSync> {
  const t0 = Date.now();
  let primerIntento = true;
  for (;;) {
    let status: number;
    let json: SyncApiJson | null;
    try {
      ({ status, json } = await postSyncNow(opcion));
    } catch {
      return { tipo: "error", mensaje: MSG_ERROR_RED };
    }
    if (status === 200 && json?.ok) return { tipo: "ok", resumen: json.resumen };
    if (status === 409 && json?.motivo === "running") {
      if (Date.now() - t0 > ENGANCHE_MAX_MS) return { tipo: "error", mensaje: MSG_ERROR_GENERICO };
      await sleep(ENGANCHE_POLL_MS);
      primerIntento = false;
      continue;
    }
    if (status === 409 && json?.motivo === "cooldown") {
      // Tras esperar un running = ese sync terminó bien → éxito. Directo al
      // primer intento = la data ya estaba fresca → se informa el detalle.
      if (primerIntento) return { tipo: "fresco", detalle: json.detalle ?? "Los datos ya están frescos." };
      return { tipo: "ok" };
    }
    return { tipo: "error", mensaje: json?.error || json?.detalle || MSG_ERROR_GENERICO };
  }
}
