"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente compartido de /api/admin/sync-now (lo usan SyncNowButton y
// CatalogoSyncNow — regla GLOBAL de todos los botones "Actualizar ahora").
//
// syncConEnganche: dispara UNA opción. Desde el 26-nov-2026 (Daniel: «si
// pongo Actualizar, lo quiero en vivo») no hay freno de 10 min: el servidor
// siempre lee de Switch, y si la empresa ya tiene una corrida viva, la ESPERA
// (y se une a ella si es del mismo tipo). Solo si esa espera pasa de 4 min
// contesta 409 "running"; aquí se vuelve a preguntar cada ~5 s, sin mostrarle
// nada al usuario. Cero mensajes tipo "espera al sync de las HH:MM".
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncNowRequest {
  modulo: string;
  empresa?: string;
}

interface SyncApiJson {
  ok?: boolean;
  resumen?: string;
  /** Pedidos: cuántos quedaron al día en esa empresa. */
  cantidad?: number;
  motivo?: string;
  detalle?: string;
  error?: string;
}

// Re-intento cada 5s, tope 12 min (el servidor ya espera hasta 4 min por
// pregunta; los syncs largos —catálogo Tommy ~8 min— caben).
const ENGANCHE_POLL_MS = 5_000;
const ENGANCHE_MAX_MS = 12 * 60_000;

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
  | { tipo: "ok"; resumen?: string; cantidad?: number }
  | { tipo: "error"; mensaje: string };

export async function syncConEnganche(opcion: SyncNowRequest): Promise<ResultadoSync> {
  const t0 = Date.now();
  for (;;) {
    let status: number;
    let json: SyncApiJson | null;
    try {
      ({ status, json } = await postSyncNow(opcion));
    } catch {
      return { tipo: "error", mensaje: MSG_ERROR_RED };
    }
    if (status === 200 && json?.ok) return { tipo: "ok", resumen: json.resumen, cantidad: json.cantidad };
    if (status === 409 && json?.motivo === "running") {
      if (Date.now() - t0 > ENGANCHE_MAX_MS) return { tipo: "error", mensaje: MSG_ERROR_GENERICO };
      await sleep(ENGANCHE_POLL_MS);
      continue;
    }
    return { tipo: "error", mensaje: json?.error || json?.detalle || MSG_ERROR_GENERICO };
  }
}
