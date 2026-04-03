import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const BACKUP_EMAIL = "daniel@fashionfitnessgroup.com";
const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024; // 24MB safe limit

export async function GET(req: NextRequest) {
  // Auth: cron secret or admin session
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
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
  const today = now.toISOString().slice(0, 10);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const counts: Record<string, number> = {};

  // 1. CXC rows — only latest upload per company
  const { data: latestUploads } = await supabaseServer
    .from("cxc_uploads")
    .select("id, company_key")
    .order("uploaded_at", { ascending: false });

  const seenCompanies = new Set<string>();
  const latestUploadIds: string[] = [];
  for (const u of latestUploads || []) {
    if (!seenCompanies.has(u.company_key)) {
      seenCompanies.add(u.company_key);
      latestUploadIds.push(u.id);
    }
  }

  let cxcRows: unknown[] = [];
  for (const uid of latestUploadIds) {
    const { data } = await supabaseServer.from("cxc_rows").select("*").eq("upload_id", uid);
    if (data) cxcRows = cxcRows.concat(data);
  }
  counts.cxc_rows = cxcRows.length;

  // 2. Ventas raw — last 3 months
  const { data: ventas } = await supabaseServer
    .from("ventas_raw")
    .select("*")
    .gte("fecha", threeMonthsAgo);
  counts.ventas_raw = ventas?.length || 0;

  // 3. Cheques — pendientes + últimos 30 días de depositados
  const { data: chequesPendientes } = await supabaseServer
    .from("cheques")
    .select("*")
    .neq("estado", "depositado");
  const { data: chequesRecientes } = await supabaseServer
    .from("cheques")
    .select("*")
    .eq("estado", "depositado")
    .gte("fecha_deposito", thirtyDaysAgo);
  const cheques = [...(chequesPendientes || []), ...(chequesRecientes || [])];
  counts.cheques = cheques.length;

  // 4. Reclamos + items — last 6 months
  const { data: reclamos } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .gte("created_at", sixMonthsAgo);
  counts.reclamos = reclamos?.length || 0;

  // 5. Guias — last 3 months
  const { data: guias } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .gte("created_at", threeMonthsAgo);
  counts.guias = guias?.length || 0;

  // 6. Caja — last 6 months
  const { data: cajaPeriodos } = await supabaseServer
    .from("caja_periodos")
    .select("*, caja_gastos(*)")
    .gte("created_at", sixMonthsAgo);
  counts.caja_periodos = cajaPeriodos?.length || 0;

  // 7. Préstamos — activos
  const { data: prestamos } = await supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("estado", "activo");
  counts.prestamos = prestamos?.length || 0;

  // 8. Directorio
  const { data: directorio } = await supabaseServer
    .from("directorio_clientes")
    .select("*");
  counts.directorio = directorio?.length || 0;

  // 9. Users (sin passwords)
  const { data: usersRaw } = await supabaseServer
    .from("fg_users")
    .select("id, email, nombre, role, empresa, created_at, last_login");
  counts.fg_users = usersRaw?.length || 0;

  // Build backup object
  const backup = {
    meta: {
      date: today,
      timestamp: now.toISOString(),
      counts,
    },
    cxc_rows: cxcRows,
    ventas_raw: ventas || [],
    cheques,
    reclamos: reclamos || [],
    guias: guias || [],
    caja_periodos: cajaPeriodos || [],
    prestamos: prestamos || [],
    directorio: directorio || [],
    fg_users: usersRaw || [],
  };

  const jsonStr = JSON.stringify(backup);
  const jsonBytes = Buffer.from(jsonStr, "utf-8");

  // Upload to Supabase Storage
  const { error: storageErr } = await supabaseServer.storage
    .from("backups")
    .upload(`backup_${today}.json`, jsonBytes, {
      contentType: "application/json",
      upsert: true,
    });

  if (storageErr) console.error("Storage upload error:", storageErr);

  // Clean old backups (keep last 30 days)
  try {
    const { data: files } = await supabaseServer.storage.from("backups").list("", { limit: 200 });
    if (files && files.length > 30) {
      const sorted = files
        .filter((f) => f.name.startsWith("backup_"))
        .sort((a, b) => a.name.localeCompare(b.name));
      const toDelete = sorted.slice(0, sorted.length - 30).map((f) => f.name);
      if (toDelete.length > 0) {
        await supabaseServer.storage.from("backups").remove(toDelete);
      }
    }
  } catch (e) {
    console.error("Cleanup error:", e);
  }

  // Send email(s) via Resend
  try {
    if (jsonBytes.length <= MAX_ATTACHMENT_BYTES) {
      // Single email
      await resend.emails.send({
        from: "notificaciones@fashiongr.com",
        to: BACKUP_EMAIL,
        subject: `Backup Diario Fashion Group — ${today}`,
        html: buildEmailHtml(counts, today, jsonBytes.length),
        attachments: [{
          filename: `backup_${today}.json`,
          content: jsonBytes.toString("base64"),
        }],
      });
    } else {
      // Split into chunks by table groups
      const groups = [
        { name: "CXC_Ventas", tables: { cxc_rows: backup.cxc_rows, ventas_raw: backup.ventas_raw } },
        { name: "Operaciones", tables: { cheques: backup.cheques, reclamos: backup.reclamos, guias: backup.guias } },
        { name: "Admin", tables: { caja_periodos: backup.caja_periodos, prestamos: backup.prestamos, directorio: backup.directorio, fg_users: backup.fg_users, meta: backup.meta } },
      ];

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const chunk = JSON.stringify(g.tables);
        const chunkBuf = Buffer.from(chunk, "utf-8");
        await resend.emails.send({
          from: "notificaciones@fashiongr.com",
          to: BACKUP_EMAIL,
          subject: `Backup Diario Fashion Group — ${today} (${i + 1}/${groups.length}: ${g.name})`,
          html: buildEmailHtml(counts, today, jsonBytes.length, i + 1, groups.length, g.name),
          attachments: [{
            filename: `backup_${today}_${g.name.toLowerCase()}.json`,
            content: chunkBuf.toString("base64"),
          }],
        });
      }
    }
  } catch (e) {
    console.error("Email error:", e);
    return NextResponse.json({ ok: true, date: today, counts, email: "failed", storage: !storageErr });
  }

  return NextResponse.json({ ok: true, date: today, counts, email: "sent", storage: !storageErr });
}

function buildEmailHtml(counts: Record<string, number>, date: string, totalBytes: number, part?: number, totalParts?: number, groupName?: string): string {
  const sizeMB = (totalBytes / 1024 / 1024).toFixed(1);
  const totalRecords = Object.values(counts).reduce((s, n) => s + n, 0);
  const partLabel = part ? ` — Parte ${part}/${totalParts} (${groupName})` : "";

  const rows = Object.entries(counts)
    .map(([table, count]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333">${table}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333;text-align:right;font-weight:600">${count.toLocaleString()}</td></tr>`)
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#1B3A5C;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="color:white;font-size:16px;margin:0;font-weight:600">Backup Diario${partLabel}</h1>
        <p style="color:#93B5D3;font-size:12px;margin:4px 0 0">${date}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px">
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#15803d">${totalRecords.toLocaleString()}</div>
            <div style="font-size:10px;color:#666;text-transform:uppercase;margin-top:2px">Registros</div>
          </div>
          <div style="flex:1;background:#eff6ff;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#1d4ed8">${sizeMB} MB</div>
            <div style="font-size:10px;color:#666;text-transform:uppercase;margin-top:2px">Tamaño</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="padding:6px 12px;text-align:left;font-size:10px;color:#999;text-transform:uppercase;border-bottom:2px solid #e5e7eb">Tabla</th><th style="padding:6px 12px;text-align:right;font-size:10px;color:#999;text-transform:uppercase;border-bottom:2px solid #e5e7eb">Registros</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:11px;color:#999;margin-top:16px;text-align:center">Fashion Group — Sistema CXC</p>
      </div>
    </div>
  `;
}
