import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]); if (auth instanceof NextResponse) return auth;
  // Get latest fecha per empresa from ventas_raw
  // Paginate to ensure all empresas are covered
  const latest: Record<string, { date: string; label: string; count: number }> = {};
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ventas_raw")
      .select("empresa, fecha, uploaded_at")
      .order("fecha", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("[ventas/v2/status]", error.code, error.message);
      break;
    }

    for (const row of data ?? []) {
      if (!latest[row.empresa]) {
        const d = new Date(row.fecha);
        const mes = d.toLocaleDateString("es-PA", { month: "short" });
        const año = d.getFullYear();
        latest[row.empresa] = {
          date: row.uploaded_at || row.fecha,
          label: `${mes} ${año}`,
          count: 0,
        };
      }
      latest[row.empresa].count++;
    }

    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  return NextResponse.json(latest);
}
