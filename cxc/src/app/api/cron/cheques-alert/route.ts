import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_EMAILS = ["daniel@fashiongr.com", "info@fashiongr.com"];
const WA_NUMBERS = ["+50766745522", "+50766494096"];

function getPanamaDate(offset = 0) {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offset);
  return panama.toISOString().slice(0, 10);
}

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

  const today = getPanamaDate();
  const tomorrow = getPanamaDate(1);

  const { data: cheques } = await supabaseServer
    .from("cheques")
    .select("cliente, empresa, monto, fecha_deposito")
    .eq("estado", "pendiente")
    .or(`fecha_deposito.eq.${today},fecha_deposito.eq.${tomorrow}`)
    .order("fecha_deposito");

  if (!cheques || cheques.length === 0) {
    return NextResponse.json({ message: "No hay cheques por vencer", count: 0 });
  }

  const lines = cheques.map(c =>
    `• ${c.cliente} — ${c.empresa} — $${Number(c.monto).toLocaleString()} — ${c.fecha_deposito === today ? "HOY" : "MAÑANA"}`
  );

  const totalMonto = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  const html = `
    <h2 style="color:#1a1a1a">Cheques por vencer</h2>
    <p>${cheques.length} cheque${cheques.length > 1 ? "s" : ""} por un total de <strong>$${totalMonto.toLocaleString()}</strong></p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Cliente</th><th style="padding:8px">Empresa</th><th style="padding:8px;text-align:right">Monto</th><th style="padding:8px">Vence</th></tr>
      ${cheques.map(c => `<tr style="border-bottom:1px solid #eee"><td style="padding:8px">${c.cliente}</td><td style="padding:8px">${c.empresa}</td><td style="padding:8px;text-align:right">$${Number(c.monto).toLocaleString()}</td><td style="padding:8px">${c.fecha_deposito === today ? "HOY" : "MAÑANA"}</td></tr>`).join("")}
    </table>
    <p style="margin-top:16px;color:#888;font-size:12px">WhatsApp para seguimiento: ${WA_NUMBERS.join(", ")}</p>
    <p style="color:#888;font-size:11px">Fashion Group Panamá — Alerta automática</p>
  `;

  try {
    await resend.emails.send({
      from: "Fashion Group <notificaciones@fashiongr.com>",
      to: NOTIFY_EMAILS,
      subject: `⚠️ ${cheques.length} cheque${cheques.length > 1 ? "s" : ""} por vencer — $${totalMonto.toLocaleString()}`,
      html,
    });
  } catch { /* email send failed silently */ }

  return NextResponse.json({ message: "Alerta enviada", count: cheques.length, total: totalMonto });
}
