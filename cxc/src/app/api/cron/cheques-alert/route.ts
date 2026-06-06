import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getCompanyDisplay } from "@/lib/companies";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

const CRON_NAME = "cheques-alert";
const WA_NUMBERS = ["+50766745522", "+50766494096"];

function getPanamaDate(offset = 0) {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offset);
  return panama.toISOString().slice(0, 10);
}

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      const session = req.cookies.get("cxc_session")?.value;
      if (session) {
        const parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
        if (parsed.role === "admin") authorized = true;
      }
    } catch { /* invalid cookie */ }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Test mode: dispara un mensaje Telegram de prueba.
  if (req.nextUrl.searchParams.get("test") === "true") {
    const sent = await sendTelegramAlert(
      `🧪 Cheques por vencer (PRUEBA)\n1 cheque — ${money(1000)}\n• PRUEBA TEST (Vistana) ${money(1000)} — MAÑANA`,
    );
    return NextResponse.json({ message: "Telegram de prueba", sent });
  }

  const today = getPanamaDate();
  const tomorrow = getPanamaDate(1);

  const { data: cheques, error: queryErr } = await supabaseServer
    .from("cheques")
    .select("cliente, empresa, monto, fecha_deposito, vendedor")
    .eq("estado", "pendiente")
    .or(`fecha_deposito.eq.${today},fecha_deposito.eq.${tomorrow}`)
    .order("fecha_deposito");

  if (queryErr) {
    console.error("[cheques-alert] query failed:", queryErr.message);
    await logCronError("cheques_query_failed", queryErr.message);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!cheques || cheques.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ message: "No hay cheques por vencer", count: 0 });
  }

  const totalMonto = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  // Un solo mensaje compacto por corrida (no uno por cheque).
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

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ message: sent ? "Alerta enviada" : "Alerta no enviada (Telegram falló)", count: cheques.length, total: totalMonto, sent });
}
