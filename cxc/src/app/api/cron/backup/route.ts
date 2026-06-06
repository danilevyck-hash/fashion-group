import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";

const CRON_NAME = "backup";
const BUCKET = "backups";
const RETENTION_DAYS = 30;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth: cron secret or admin session
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
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

  const jsonBytes = Buffer.from(JSON.stringify(backup), "utf-8");

  // Subir a Storage organizado por fecha: backups/YYYY-MM-DD/backup.json
  const objectPath = `${today}/backup.json`;
  const { error: storageErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(objectPath, jsonBytes, {
      contentType: "application/json",
      upsert: true,
    });

  if (storageErr) {
    console.error("[backup] storage upload error:", storageErr.message);
    // El backup FALLÓ → alerta Telegram (única condición de alerta).
    await logCronError("backup_storage_failed", storageErr.message);
    return NextResponse.json({ ok: false, date: today, error: storageErr.message }, { status: 500 });
  }

  // Limpieza de backups > RETENTION_DAYS (carpetas de fecha + legacy flat files).
  // Housekeeping: si falla, solo log a consola (se reintenta mañana, no alerta).
  try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: entries } = await supabaseServer.storage.from(BUCKET).list("", { limit: 1000 });
    const removePaths: string[] = [];
    for (const e of entries || []) {
      // Carpetas de fecha (YYYY-MM-DD): borrar su contenido si son viejas.
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < cutoff) {
        const { data: inner } = await supabaseServer.storage.from(BUCKET).list(e.name, { limit: 1000 });
        for (const f of inner || []) removePaths.push(`${e.name}/${f.name}`);
      }
      // Legacy flat: backup_YYYY-MM-DD.json en la raíz.
      const legacy = e.name.match(/^backup_(\d{4}-\d{2}-\d{2})\.json$/);
      if (legacy && legacy[1] < cutoff) removePaths.push(e.name);
    }
    if (removePaths.length > 0) {
      await supabaseServer.storage.from(BUCKET).remove(removePaths);
    }
  } catch (e) {
    console.error("[backup] cleanup error:", e instanceof Error ? e.message : String(e));
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, date: today, counts, path: objectPath, bytes: jsonBytes.length });
}
