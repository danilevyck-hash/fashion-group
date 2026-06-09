// Lógica core del cron cheques-alert, extraída del route para poder llamarla
// IN-PROCESS desde la reconciliación (recuperación sin self-fetch), igual que
// sync-clientes-master. NO registra heartbeat ni logCronError: eso es del
// caller (route u orquestador). Es READ-ONLY (query + Telegram) — no muta data,
// así que re-ejecutarla no duplica cheques; la idempotencia de la ALERTA la da
// el caller (solo se re-ejecuta si no hubo success hoy).

import { supabaseServer } from "@/lib/supabase-server";
import { getCompanyDisplay } from "@/lib/companies";
import { sendTelegramAlert } from "@/lib/telegram";

const WA_NUMBERS = ["+50766745522", "+50766494096"];

function getPanamaDate(offset = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offset);
  return panama.toISOString().slice(0, 10);
}

const money = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ChequesAlertResult {
  ok: boolean;       // false solo si la query falla (el caller NO registra heartbeat)
  detail: string;
  count: number;
  sent: boolean;     // si el Telegram salió
}

/**
 * Avisa por Telegram de los cheques pendientes que vencen hoy o mañana.
 * Un solo mensaje compacto por corrida (no uno por cheque). Sin escrituras.
 */
export async function runChequesAlert(): Promise<ChequesAlertResult> {
  const today = getPanamaDate();
  const tomorrow = getPanamaDate(1);

  const { data: cheques, error } = await supabaseServer
    .from("cheques")
    .select("cliente, empresa, monto, fecha_deposito, vendedor")
    .eq("estado", "pendiente")
    .or(`fecha_deposito.eq.${today},fecha_deposito.eq.${tomorrow}`)
    .order("fecha_deposito");

  if (error) {
    return { ok: false, detail: error.message, count: 0, sent: false };
  }

  if (!cheques || cheques.length === 0) {
    return { ok: true, detail: "sin cheques por vencer", count: 0, sent: false };
  }

  const totalMonto = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const lineas = cheques
    .map((c) => {
      const vence = c.fecha_deposito === today ? "HOY" : "MAÑANA";
      return `• ${c.cliente} (${getCompanyDisplay(c.empresa)}) ${money(Number(c.monto))} — ${vence}${c.vendedor ? ` · ${c.vendedor}` : ""}`;
    })
    .join("\n");

  const mensaje =
    `⚠️ ${cheques.length} cheque${cheques.length > 1 ? "s" : ""} por vencer — ${money(totalMonto)}\n` +
    `${lineas}\n` +
    `WhatsApp seguimiento: ${WA_NUMBERS.join(", ")}`;

  const sent = await sendTelegramAlert(mensaje);
  return { ok: true, detail: `${cheques.length} por vencer`, count: cheques.length, sent };
}
