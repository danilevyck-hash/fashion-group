import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  // Get latest fecha per empresa from ventas_raw
  // Use a limited query to avoid full table scan
  const { data, error } = await supabaseServer
    .from("ventas_raw")
    .select("empresa, fecha, uploaded_at")
    .order("fecha", { ascending: false })
    .limit(500);

  if (error) {
    // Table may not exist yet (42P01) — return empty
    console.error("[ventas/v2/status]", error.code, error.message);
    if (error.code === "42P01") return NextResponse.json({});
    return NextResponse.json({});
  }

  // Group by empresa, take latest fecha
  const latest: Record<string, { date: string; label: string }> = {};
  for (const row of data ?? []) {
    if (!latest[row.empresa]) {
      const d = new Date(row.fecha);
      const mes = d.toLocaleDateString("es-PA", { month: "short" });
      const año = d.getFullYear();
      latest[row.empresa] = {
        date: row.uploaded_at || row.fecha,
        label: `${mes} ${año}`,
      };
    }
  }

  return NextResponse.json(latest);
}
