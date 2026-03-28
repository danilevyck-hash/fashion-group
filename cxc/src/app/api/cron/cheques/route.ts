import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function getPanamaDate() {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  return panama.toISOString().slice(0, 10);
}

function getTomorrow() {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + 1);
  return panama.toISOString().slice(0, 10);
}

function fmtMonto(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log("RESEND_API_KEY not configured"); return false; }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Fashion Group <noreply@fashiongr.com>",
      to: [to],
      subject,
      html,
    }),
  });
  return res.ok;
}

function buildHtml(cheque: Record<string, unknown>, isToday: boolean) {
  return `
    <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h2 style="font-size:16px;margin:0 0 16px">${isToday ? "⚠️ Depositar HOY" : "Recordatorio: Depositar mañana"}</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#888">Cliente</td><td style="padding:6px 0;font-weight:500">${cheque.cliente}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Empresa</td><td style="padding:6px 0">${cheque.empresa}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Banco</td><td style="padding:6px 0">${cheque.banco}</td></tr>
        <tr><td style="padding:6px 0;color:#888">N° Cheque</td><td style="padding:6px 0">${cheque.numero_cheque}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Monto</td><td style="padding:6px 0;font-weight:600;font-size:18px">${fmtMonto(Number(cheque.monto))}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Fecha Depósito</td><td style="padding:6px 0">${fmtDate(String(cheque.fecha_deposito))}</td></tr>
        ${cheque.notas ? `<tr><td style="padding:6px 0;color:#888">Notas</td><td style="padding:6px 0">${cheque.notas}</td></tr>` : ""}
      </table>
      <p style="margin-top:20px;font-size:12px;color:#aaa">Fashion Group — Sistema de Cheques</p>
    </div>
  `;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getPanamaDate();
  const tomorrow = getTomorrow();

  // Mark overdue
  const { data: overdue } = await supabaseServer
    .from("cheques")
    .update({ estado: "vencido" })
    .eq("estado", "pendiente")
    .lt("fecha_deposito", today)
    .select("id");

  const markedVencido = overdue?.length || 0;

  // Get cheques to remind about
  const { data: pending } = await supabaseServer
    .from("cheques")
    .select("*")
    .eq("estado", "pendiente")
    .in("fecha_deposito", [today, tomorrow]);

  let sent = 0;
  for (const cheque of pending || []) {
    const isToday = cheque.fecha_deposito === today;
    const subject = isToday
      ? `⚠️ Hoy debes depositar: Cheque ${cheque.cliente}`
      : `Recordatorio: Cheque a depositar mañana — ${cheque.cliente}`;
    const ok = await sendEmail("info@fashiongr.com", subject, buildHtml(cheque, isToday));
    if (ok) sent++;
  }

  return NextResponse.json({ sent, markedVencido, today, tomorrow });
}
