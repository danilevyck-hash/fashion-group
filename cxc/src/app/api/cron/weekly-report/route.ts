import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function fmt(n: number): string { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

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
    } catch { /* */ }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Ventas this month by empresa
  const { data: ventas } = await supabaseServer.from("ventas_mensuales").select("empresa, ventas_brutas, notas_credito").eq("año", year).eq("mes", month);
  const ventasHtml = (ventas || []).map(v => {
    const netas = (Number(v.ventas_brutas) || 0) - (Number(v.notas_credito) || 0);
    return `<tr><td style="padding:4px 8px">${v.empresa}</td><td style="padding:4px 8px;text-align:right">$${fmt(netas)}</td></tr>`;
  }).join("");
  const totalVentas = (ventas || []).reduce((s, v) => s + (Number(v.ventas_brutas) || 0) - (Number(v.notas_credito) || 0), 0);

  // CxC vencida
  const { data: cxc } = await supabaseServer.from("cxc_rows").select("total, d121_180, d181_270, d271_365, mas_365");
  const cxcTotal = (cxc || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
  const cxcVencida = (cxc || []).reduce((s, r) => s + (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0), 0);

  // Reclamos abiertos
  const { count: reclamosCount } = await supabaseServer.from("reclamos").select("*", { count: "exact", head: true }).not("estado", "in", '("Aplicado","Rechazado","Aplicada")').eq("deleted", false);

  // Cheques por vencer
  const { data: cheques } = await supabaseServer.from("cheques").select("monto").eq("estado", "pendiente").eq("deleted", false).gte("fecha_deposito", today).lte("fecha_deposito", weekFromNow);
  const chequesCount = cheques?.length || 0;
  const chequesTotal = (cheques || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);

  const html = `
    <h2 style="color:#1a1a1a">Resumen Semanal — Fashion Group</h2>
    <p style="color:#888">Semana del ${weekAgo} al ${today}</p>
    <h3 style="margin-top:16px">Ventas del mes (${month}/${year})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#1a1a1a;color:white"><th style="padding:6px 8px;text-align:left">Empresa</th><th style="padding:6px 8px;text-align:right">Ventas Netas</th></tr>
      ${ventasHtml}
      <tr style="font-weight:bold;border-top:2px solid #1a1a1a"><td style="padding:6px 8px">TOTAL</td><td style="padding:6px 8px;text-align:right">$${fmt(totalVentas)}</td></tr>
    </table>
    <h3 style="margin-top:16px">Indicadores</h3>
    <ul style="font-size:13px">
      <li>CxC total: <strong>$${fmt(cxcTotal)}</strong> — Vencida (+121d): <strong style="color:${cxcVencida > 0 ? 'red' : 'green'}">$${fmt(cxcVencida)}</strong></li>
      <li>Reclamos abiertos: <strong>${reclamosCount || 0}</strong></li>
      <li>Cheques por vencer (próxima semana): <strong>${chequesCount}</strong> por <strong>$${fmt(chequesTotal)}</strong></li>
    </ul>
    <p style="color:#888;font-size:11px;margin-top:24px">Fashion Group Panamá — Reporte automático semanal</p>
  `;

  try {
    const { error: sendErr } = await resend.emails.send({
      from: "Fashion Group <notificaciones@fashiongr.com>",
      to: ["daniel@fashiongr.com"],
      subject: `📊 Resumen semanal — Fashion Group — ${today}`,
      html,
    });
    if (sendErr) {
      console.error("[weekly-report] Resend error:", sendErr.message);
      return NextResponse.json({ error: sendErr.message }, { status: 500 });
    }
  } catch (err) {
    console.error("[weekly-report] Send failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ message: "Reporte semanal enviado", ventasTotal: totalVentas, cxcVencida, reclamos: reclamosCount, cheques: chequesCount });
}
