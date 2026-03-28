import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: reclamos } = await supabaseServer.from("reclamos").select("*, reclamo_items(*)").order("created_at", { ascending: false });
  const { data: cheques } = await supabaseServer.from("cheques").select("*").eq("estado", "pendiente");
  const { data: cajaPeriodo } = await supabaseServer.from("caja_periodos").select("*, caja_gastos(*)").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle();

  const backup = { date: today, timestamp: new Date().toISOString(), reclamos: reclamos || [], cheques: cheques || [], caja: cajaPeriodo || null };

  const { error } = await supabaseServer.storage.from("backups").upload(`${today}.json`, JSON.stringify(backup, null, 2), { contentType: "application/json", upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, records: { reclamos: reclamos?.length || 0, cheques: cheques?.length || 0 } });
}
