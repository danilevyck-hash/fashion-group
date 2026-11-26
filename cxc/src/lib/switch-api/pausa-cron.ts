// «Pausar Switch» en los crons y la puesta al día (26-nov-2026).
//
// Cada cron de `CRONS_DE_SWITCH` llama `respuestaSiSwitchEnPausa` después de
// validar el CRON_SECRET:
//   · EN PAUSA → contesta 200 «en pausa» y no hace nada más: ni fila en
//     `switch_sync_log`, ni heartbeat, ni alerta. No es éxito ni fallo.
//   · SIN PAUSA → antes de su trabajo manda los pedidos del catálogo que
//     esperaron la pausa (si hay), en serie y en el MISMO proceso que después
//     usa Switch: un solo token por empresa, sin chocar la sesión única.
// El resto de la puesta al día no necesita nada: la corrida siguiente de cada
// cron trae lo atrasado, y la reconciliación re-ejecuta los turnos perdidos.

import { NextResponse } from "next/server";
import { leerPausaSwitch } from "./pausa-io";
import { textoPausa } from "./pausa";
import type { FilaEnEspera } from "@/lib/catalogo/pedidos-en-espera";
// El catálogo se carga solo cuando hay pedidos que mandar (import dinámico):
// los ~20 crons que llaman al freno no arrastran el catálogo en cada arranque.

export async function respuestaSiSwitchEnPausa(cronName: string): Promise<NextResponse | null> {
  const p = await leerPausaSwitch({ fresca: true });
  if (p) {
    console.warn(`[${cronName}] ${textoPausa(p)} — no corre`);
    return NextResponse.json({ ok: true, enPausa: true, cron: cronName, hasta: p.hasta, mensaje: textoPausa(p) });
  }
  await enviarPedidosQueEsperaron();
  return null;
}

/** Arma y manda UN pedido en espera por el camino del checkout. Devuelve el desenlace. */
async function enviarUno(f: FilaEnEspera): Promise<string> {
  const { MARCAS_CONFIG } = await import("@/lib/catalogo/marcas");
  const { armarEnvioDePedido } = await import("@/lib/catalogo/enviar-switch-route");
  const { enviarEnSegundoPlano } = await import("@/lib/catalogo/envio-en-segundo-plano");
  const cfg = Object.values(MARCAS_CONFIG).find((c) => c.enviosTable === f.envios_table);
  if (!cfg) return `error: tabla de envíos desconocida (${f.envios_table})`;
  const armado = await armarEnvioDePedido(cfg.marca, f.order_id, { auto: f.auto, documento: f.documento });
  if ("respuesta" in armado) {
    const j = (await armado.respuesta.json().catch(() => null)) as { error?: string } | null;
    return `no se envió: ${j?.error ?? armado.respuesta.status}`;
  }
  // Mismo desenlace que el checkout en segundo plano: si no sale, queda
  // «error» con Reintentar y avisa 🔧 SISTEMA (una avería real, no la pausa).
  return enviarEnSegundoPlano(armado.params);
}

/** Nunca lanza: un tropiezo aquí no puede tumbar el cron que la llama. */
export async function enviarPedidosQueEsperaron(): Promise<Array<{ pedido: string; resultado: string }>> {
  if (!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)) return [];
  try {
    const { enviarPedidosEnEspera } = await import("@/lib/catalogo/pedidos-en-espera");
    const hechos = await enviarPedidosEnEspera(enviarUno);
    if (hechos.length > 0) {
      const { logActivity } = await import("@/lib/log-activity");
      await logActivity("sistema", "switch_pausa_pedidos_enviados", "switch", { pedidos: hechos });
    }
    return hechos;
  } catch (err) {
    console.error(`[switch-pausa] puesta al día de pedidos: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
