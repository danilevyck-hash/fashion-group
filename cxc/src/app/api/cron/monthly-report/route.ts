import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Factor total reclamos: importación 10% + ITBMS 7.7% */
const FACTOR_TOTAL_RECLAMOS = 1.177;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${fmt(n)}`;
}
function pct(a: number, b: number): string {
  if (b === 0) return "—";
  const v = ((a - b) / Math.abs(b)) * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function pctOf(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ── Shared styles ──

const S = {
  table: 'style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:24px"',
  th: 'style="padding:8px 10px;text-align:left;background:#1B3A5C;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.04em"',
  thR: 'style="padding:8px 10px;text-align:right;background:#1B3A5C;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.04em"',
  td: 'style="padding:6px 10px;border-bottom:1px solid #eee"',
  tdR: 'style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums"',
  tdBold: 'style="padding:8px 10px;border-top:2px solid #1B3A5C;font-weight:bold"',
  tdBoldR: 'style="padding:8px 10px;border-top:2px solid #1B3A5C;font-weight:bold;text-align:right;font-variant-numeric:tabular-nums"',
};

export async function GET(req: NextRequest) {
  // Auth: cron secret or admin session
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

  // Report covers the PREVIOUS month (cron runs on 1st of each month)
  const now = new Date();
  const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed
  const prevMonth = reportMonth === 1 ? 12 : reportMonth - 1;
  const prevYear = reportMonth === 1 ? reportYear - 1 : reportYear;

  const monthLabel = `${MESES[reportMonth]} ${reportYear}`;
  const monthStart = `${reportYear}-${String(reportMonth).padStart(2, "0")}-01`;
  const nextMonthStart = reportMonth === 12
    ? `${reportYear + 1}-01-01`
    : `${reportYear}-${String(reportMonth + 1).padStart(2, "0")}-01`;

  // ── 1. VENTAS ──

  const { data: ventasCurrent } = await supabaseServer
    .from("ventas_mensuales")
    .select("empresa, ventas_brutas, notas_credito")
    .eq("año", reportYear)
    .eq("mes", reportMonth);

  const { data: ventasPrev } = await supabaseServer
    .from("ventas_mensuales")
    .select("empresa, ventas_brutas, notas_credito")
    .eq("año", prevYear)
    .eq("mes", prevMonth);

  const prevMap: Record<string, number> = {};
  for (const v of ventasPrev || []) {
    prevMap[v.empresa] = (Number(v.ventas_brutas) || 0) - (Number(v.notas_credito) || 0);
  }

  type VentasRow = { empresa: string; current: number; prev: number };
  const ventasRows: VentasRow[] = [];
  let totalCurrent = 0, totalPrev = 0;

  for (const v of ventasCurrent || []) {
    const netas = (Number(v.ventas_brutas) || 0) - (Number(v.notas_credito) || 0);
    const prev = prevMap[v.empresa] || 0;
    ventasRows.push({ empresa: v.empresa, current: netas, prev });
    totalCurrent += netas;
    totalPrev += prev;
    delete prevMap[v.empresa];
  }
  // Empresas that had sales last month but not this month
  for (const [emp, prev] of Object.entries(prevMap)) {
    ventasRows.push({ empresa: emp, current: 0, prev });
    totalPrev += prev;
  }
  ventasRows.sort((a, b) => b.current - a.current);

  const ventasHtml = ventasRows.map(r => {
    const change = pct(r.current, r.prev);
    const color = r.current >= r.prev ? "#16a34a" : "#dc2626";
    return `<tr>
      <td ${S.td}>${r.empresa}</td>
      <td ${S.tdR}>$${fmt(r.current)}</td>
      <td ${S.tdR}>$${fmt(r.prev)}</td>
      <td ${S.tdR}><span style="color:${color}">${change}</span></td>
    </tr>`;
  }).join("");

  // ── 2. CXC AGING ──

  const { data: cxcRows } = await supabaseServer
    .from("cxc_rows")
    .select("company_key, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365");

  type CxcAging = { total: number; d0_30: number; d31_60: number; d61_90: number; over90: number };
  const cxcByEmpresa: Record<string, CxcAging> = {};
  const cxcTotals: CxcAging = { total: 0, d0_30: 0, d31_60: 0, d61_90: 0, over90: 0 };

  for (const r of cxcRows || []) {
    const emp = r.company_key || "otro";
    if (!cxcByEmpresa[emp]) cxcByEmpresa[emp] = { total: 0, d0_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
    const total = Number(r.total) || 0;
    const d030 = Number(r.d0_30) || 0;
    const d3160 = Number(r.d31_60) || 0;
    const d6190 = Number(r.d61_90) || 0;
    const over90 = (Number(r.d91_120) || 0) + (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0);
    cxcByEmpresa[emp].total += total;
    cxcByEmpresa[emp].d0_30 += d030;
    cxcByEmpresa[emp].d31_60 += d3160;
    cxcByEmpresa[emp].d61_90 += d6190;
    cxcByEmpresa[emp].over90 += over90;
    cxcTotals.total += total;
    cxcTotals.d0_30 += d030;
    cxcTotals.d31_60 += d3160;
    cxcTotals.d61_90 += d6190;
    cxcTotals.over90 += over90;
  }

  const cxcSorted = Object.entries(cxcByEmpresa).sort((a, b) => b[1].total - a[1].total);
  const cxcHtml = cxcSorted.map(([emp, d]) => {
    const vencidoPct = pctOf(d.over90, d.total);
    const color = d.over90 / (d.total || 1) > 0.3 ? "#dc2626" : d.over90 > 0 ? "#d97706" : "#16a34a";
    return `<tr>
      <td ${S.td}>${emp}</td>
      <td ${S.tdR}>${fmtK(d.total)}</td>
      <td ${S.tdR}>${fmtK(d.d0_30)}</td>
      <td ${S.tdR}>${fmtK(d.d31_60)}</td>
      <td ${S.tdR}>${fmtK(d.d61_90)}</td>
      <td ${S.tdR}>${fmtK(d.over90)}</td>
      <td ${S.tdR}><span style="color:${color};font-weight:600">${vencidoPct}</span></td>
    </tr>`;
  }).join("");

  // ── 3. RECLAMOS ──

  const { data: reclamos } = await supabaseServer
    .from("reclamos")
    .select("empresa, estado, created_at, reclamo_items(cantidad, precio_unitario)")
    .eq("deleted", false)
    .in("estado", ["Borrador", "Enviado", "En revisión"]);

  type ReclamoAgg = { count: number; monto: number; totalDays: number };
  const recByEmpresa: Record<string, ReclamoAgg> = {};
  let recTotalCount = 0, recTotalMonto = 0;

  for (const r of reclamos || []) {
    const emp = r.empresa || "otro";
    if (!recByEmpresa[emp]) recByEmpresa[emp] = { count: 0, monto: 0, totalDays: 0 };
    recByEmpresa[emp].count++;
    recTotalCount++;
    const monto = ((r.reclamo_items || []) as { cantidad: number; precio_unitario: number }[])
      .reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0) * FACTOR_TOTAL_RECLAMOS;
    recByEmpresa[emp].monto += monto;
    recTotalMonto += monto;
    const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
    recByEmpresa[emp].totalDays += days;
  }

  const recSorted = Object.entries(recByEmpresa).sort((a, b) => b[1].monto - a[1].monto);
  const recHtml = recSorted.map(([emp, d]) => {
    const avgDays = d.count > 0 ? Math.round(d.totalDays / d.count) : 0;
    const color = avgDays > 45 ? "#dc2626" : avgDays > 30 ? "#d97706" : "#374151";
    return `<tr>
      <td ${S.td}>${emp}</td>
      <td ${S.tdR}>${d.count}</td>
      <td ${S.tdR}>$${fmt(d.monto)}</td>
      <td ${S.tdR}><span style="color:${color}">${avgDays} dias</span></td>
    </tr>`;
  }).join("");

  // ── 4. CHEQUES ──

  const { data: chqDeposited } = await supabaseServer
    .from("cheques")
    .select("monto")
    .eq("estado", "depositado")
    .eq("deleted", false)
    .gte("fecha_depositado", monthStart)
    .lt("fecha_depositado", nextMonthStart);

  const { data: chqBounced } = await supabaseServer
    .from("cheques")
    .select("monto")
    .eq("estado", "rebotado")
    .eq("deleted", false)
    .gte("created_at", monthStart)
    .lt("created_at", nextMonthStart);

  const { data: chqPending } = await supabaseServer
    .from("cheques")
    .select("monto")
    .eq("estado", "pendiente")
    .eq("deleted", false);

  const depCount = chqDeposited?.length || 0;
  const depMonto = (chqDeposited || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const bounceCount = chqBounced?.length || 0;
  const bounceMonto = (chqBounced || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const pendCount = chqPending?.length || 0;
  const pendMonto = (chqPending || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);

  // ── BUILD EMAIL ──

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a">
  <!-- Header -->
  <div style="background:#1B3A5C;padding:24px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:white;font-size:20px;font-weight:600">Fashion Group</h1>
    <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Resumen Mensual — ${monthLabel}</p>
  </div>

  <div style="padding:24px 28px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

    <!-- VENTAS -->
    <h2 style="font-size:14px;color:#1B3A5C;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;border-bottom:2px solid #1B3A5C;padding-bottom:6px">Ventas</h2>
    <table ${S.table}>
      <tr>
        <th ${S.th}>Empresa</th>
        <th ${S.thR}>${MESES[reportMonth]}</th>
        <th ${S.thR}>${MESES[prevMonth]}</th>
        <th ${S.thR}>Cambio</th>
      </tr>
      ${ventasHtml}
      <tr>
        <td ${S.tdBold}>TOTAL</td>
        <td ${S.tdBoldR}>$${fmt(totalCurrent)}</td>
        <td ${S.tdBoldR}>$${fmt(totalPrev)}</td>
        <td ${S.tdBoldR}><span style="color:${totalCurrent >= totalPrev ? "#16a34a" : "#dc2626"}">${pct(totalCurrent, totalPrev)}</span></td>
      </tr>
    </table>

    <!-- CXC AGING -->
    <h2 style="font-size:14px;color:#1B3A5C;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;border-bottom:2px solid #1B3A5C;padding-bottom:6px">CxC — Antiguedad de Cartera</h2>
    <table ${S.table}>
      <tr>
        <th ${S.th}>Empresa</th>
        <th ${S.thR}>Total</th>
        <th ${S.thR}>0-30d</th>
        <th ${S.thR}>31-60d</th>
        <th ${S.thR}>61-90d</th>
        <th ${S.thR}>91+d</th>
        <th ${S.thR}>% Vencido</th>
      </tr>
      ${cxcHtml}
      <tr>
        <td ${S.tdBold}>TOTAL</td>
        <td ${S.tdBoldR}>${fmtK(cxcTotals.total)}</td>
        <td ${S.tdBoldR}>${fmtK(cxcTotals.d0_30)}</td>
        <td ${S.tdBoldR}>${fmtK(cxcTotals.d31_60)}</td>
        <td ${S.tdBoldR}>${fmtK(cxcTotals.d61_90)}</td>
        <td ${S.tdBoldR}>${fmtK(cxcTotals.over90)}</td>
        <td ${S.tdBoldR}><span style="color:${cxcTotals.over90 / (cxcTotals.total || 1) > 0.3 ? "#dc2626" : "#d97706"}">${pctOf(cxcTotals.over90, cxcTotals.total)}</span></td>
      </tr>
    </table>

    <!-- RECLAMOS -->
    <h2 style="font-size:14px;color:#1B3A5C;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;border-bottom:2px solid #1B3A5C;padding-bottom:6px">Reclamos Pendientes</h2>
    ${recSorted.length > 0 ? `
    <table ${S.table}>
      <tr>
        <th ${S.th}>Empresa</th>
        <th ${S.thR}>Cantidad</th>
        <th ${S.thR}>Monto Total</th>
        <th ${S.thR}>Antiguedad Prom.</th>
      </tr>
      ${recHtml}
      <tr>
        <td ${S.tdBold}>TOTAL</td>
        <td ${S.tdBoldR}>${recTotalCount}</td>
        <td ${S.tdBoldR}>$${fmt(recTotalMonto)}</td>
        <td ${S.tdBoldR}>${recTotalCount > 0 ? Math.round(recSorted.reduce((s, [, d]) => s + d.totalDays, 0) / recTotalCount) : 0} dias</td>
      </tr>
    </table>` : `<p style="color:#6b7280;font-size:13px;margin-bottom:24px">Sin reclamos pendientes.</p>`}

    <!-- CHEQUES -->
    <h2 style="font-size:14px;color:#1B3A5C;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;border-bottom:2px solid #1B3A5C;padding-bottom:6px">Cheques — ${MESES[reportMonth]}</h2>
    <table ${S.table}>
      <tr>
        <th ${S.th}>Estado</th>
        <th ${S.thR}>Cantidad</th>
        <th ${S.thR}>Monto</th>
      </tr>
      <tr>
        <td ${S.td}>Depositados en el mes</td>
        <td ${S.tdR}>${depCount}</td>
        <td ${S.tdR} style="color:#16a34a">$${fmt(depMonto)}</td>
      </tr>
      <tr>
        <td ${S.td}>Rebotados en el mes</td>
        <td ${S.tdR}>${bounceCount}</td>
        <td ${S.tdR} style="color:${bounceCount > 0 ? "#dc2626" : "#374151"}">$${fmt(bounceMonto)}</td>
      </tr>
      <tr>
        <td ${S.tdBold}>Pendientes al cierre</td>
        <td ${S.tdBoldR}>${pendCount}</td>
        <td ${S.tdBoldR}>$${fmt(pendMonto)}</td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">
      <p style="color:#9ca3af;font-size:11px;margin:0">Fashion Group Panama — Reporte mensual automatico</p>
      <p style="color:#9ca3af;font-size:11px;margin:2px 0 0">Generado el ${now.toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "long", year: "numeric" })}</p>
    </div>
  </div>
</div>`;

  try {
    const { error: sendErr } = await resend.emails.send({
      from: "Fashion Group <notificaciones@fashiongr.com>",
      to: ["daniel@fashionfitnessgroup.com"],
      subject: `Resumen Mensual — ${monthLabel}`,
      html,
    });
    if (sendErr) {
      console.error("[monthly-report] Resend error:", sendErr.message);
      return NextResponse.json({ error: sendErr.message }, { status: 500 });
    }
  } catch (err) {
    console.error("[monthly-report] Send failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    message: "Reporte mensual enviado",
    month: monthLabel,
    ventas: totalCurrent,
    cxcTotal: cxcTotals.total,
    cxcVencida: cxcTotals.over90,
    reclamos: recTotalCount,
    cheques: { depositados: depCount, rebotados: bounceCount, pendientes: pendCount },
  });
}
