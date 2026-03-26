import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import * as XLSX from "xlsx";
import { buildReclamoSheet } from "@/lib/excel-reclamo";

export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "No IDs" }, { status: 400 });

  const { data: reclamos, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wb = XLSX.utils.book_new();

  for (const rec of reclamos || []) {
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const ws = buildReclamoSheet(rec, items);
    const name = (rec.nro_reclamo || "Reclamo").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Reclamos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
