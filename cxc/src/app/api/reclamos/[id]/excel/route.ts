import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import XLSX from "xlsx-js-style";
import { buildReclamoSheet } from "@/lib/excel-reclamo";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Not found" }, { status: 500 });

  const items = (data.reclamo_items || []) as Record<string, unknown>[];
  const ws = buildReclamoSheet(data, items);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reclamo");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Reclamo-${data.nro_reclamo}.xlsx"`,
    },
  });
}
