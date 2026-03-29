import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("ventas_raw")
    .select("empresa, fecha")
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[ventas/v2/status]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Group by empresa, take latest fecha
  const latest: Record<string, { date: string; label: string }> = {};
  for (const row of data ?? []) {
    if (!latest[row.empresa]) {
      const d = new Date(row.fecha);
      latest[row.empresa] = {
        date: row.fecha,
        label: d.toLocaleDateString("es-PA", { day: "2-digit", month: "short", year: "numeric" }),
      };
    }
  }

  return NextResponse.json(latest);
}
