// ─────────────────────────────────────────────────────────────────────────────
// Confirmar pedido sin esperar a Switch (velocidad-2026-11, 19 s → ~1 s).
//
// El checkout guarda el pedido, contesta, y el envío sigue aquí, en segundo
// plano, con el MISMO motor (`enviarPedidoSwitch`). Nada del candado cambia:
//
//   · AT-MOST-ONCE: el motor anota la fila 'pendiente' ANTES del POST y el
//     índice único parcial `(order_id) WHERE estado <> 'error'` impide un
//     segundo envío no fallido. Un Reintentar que llegue a la vez choca con el
//     índice ('carrera'), nunca sale dos veces.
//   · DURABLE: el trabajo se le entrega a `waitUntil` de Vercel, que mantiene
//     viva la función hasta que termine (tope `maxDuration`). Si el runtime no
//     lo ofrece, se ESPERA como antes: nunca queda un envío suelto
//     (fire-and-forget prohibido por CLAUDE.md).
//   · SI FALLA SE DICE Y SE PUEDE REINTENTAR: todo desenlace que no crea nada
//     en Switch queda anotado como 'error' (el único estado que permite
//     Reintentar) con su motivo, la confirmación lo muestra en rojo y avisa a
//     🔧 SISTEMA. Rechazo y respuesta ambigua ya los anotaba y avisaba el motor.
//   · Si la función muriera a medias sin anotar nada, el pedido queda
//     confirmado y SIN envío: la confirmación ofrece «Enviar» (el camino de
//     siempre).
// ─────────────────────────────────────────────────────────────────────────────

import { enviarPedidoSwitch, type EnvioParams, type EnvioResult } from "./switch-envio";
import { enviarSistema } from "@/lib/alertas/canal";
import { shortError } from "@/lib/telegram";
import { logoutSwitchSessions } from "@/lib/switch-api/client";

type ContextoVercel = { waitUntil?: (p: Promise<unknown>) => void };

/**
 * Entrega la promesa al `waitUntil` del request (el mismo símbolo que lee
 * `@vercel/functions`). `false` = no hay runtime de Vercel: el llamador espera.
 */
export function entregarAWaitUntil(p: Promise<unknown>): boolean {
  const g = globalThis as unknown as Record<symbol, { get?: () => ContextoVercel } | undefined>;
  const waitUntil = g[Symbol.for("@vercel/request-context")]?.get?.()?.waitUntil;
  if (typeof waitUntil !== "function") return false;
  waitUntil(p);
  return true;
}

/** El motivo para anotar cuando el desenlace NO creó nada en Switch; `null` = no hay que anotar. */
export function motivoSinEnvio(r: EnvioResult): string | null {
  switch (r.kind) {
    case "prevalidacion":
      return `No pasó la pre-validación de Switch: ${r.errores.join(" · ")}`;
    case "switch_caido":
      return r.error;
    case "en_pausa":
      // «Pausar Switch»: quedó en espera, no es un fallo. Sin fila ni aviso.
      return null;
    case "preorders":
      return `El pedido tiene ${r.count} producto(s) en preventa — no se pueden enviar a Switch`;
    default:
      // ok · ya_enviado · carrera: hay (o habrá) una fila viva.
      // rechazado · ambiguo: el motor ya anotó y avisó.
      // preview: no ocurre sin `dry`/`auto`.
      return null;
  }
}

/** Corre el envío completo; nunca lanza. Cierra SOLO la sesión de su empresa.
 *  Devuelve el desenlace (`kind`, o «error» si el motor lanzó). */
export async function enviarEnSegundoPlano(p: EnvioParams): Promise<string> {
  let motivo: string | null = null;
  let kind = "error";
  try {
    const r = await enviarPedidoSwitch(p);
    kind = r.kind;
    motivo = motivoSinEnvio(r);
  } catch (e) {
    motivo = `Error inesperado al enviar: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await logoutSwitchSessions([p.empresaKey]);
  }
  if (!motivo) return kind;
  try {
    // Solo si no quedó una fila viva (una 'pendiente' a medias manda: no se
    // tapa con un error que invitaría a reintentar algo que pudo salir).
    const { data: viva } = await p.db
      .from(p.enviosTable)
      .select("id")
      .eq("order_id", p.orderId)
      .neq("estado", "error")
      .limit(1)
      .maybeSingle();
    if (!viva) {
      const { error } = await p.db.from(p.enviosTable).insert({
        order_id: p.orderId,
        estado: "error",
        payload: {},
        error_detalle: motivo,
        documento: p.documento ?? "pedido",
      });
      if (error) console.error(`[envio-segundo-plano] ${p.orderNumber}: no se pudo anotar el error: ${error.message}`);
    }
  } catch (e) {
    console.error(`[envio-segundo-plano] ${p.orderNumber}:`, e);
  }
  await enviarSistema(
    `🚨 Envío a Switch NO SALIÓ — ${p.marcaLabel} ${p.orderNumber}: ${shortError(motivo)} (se puede reintentar desde la confirmación)`,
  ).catch((e) => console.error("[envio-segundo-plano] aviso:", e));
  return kind;
}
