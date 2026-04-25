import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface StatusRow {
  empresa: string;
  last_fecha: string | null;
  last_uploaded: string | null;
  total_count: number;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer.rpc("ventas_status_summary");

  if (error) {
    console.error("[ventas/v2/status]", error.code, error.message);
    return NextResponse.json(
      { error: "Error al cargar status de ventas", detail: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as StatusRow[];
  const result: Record<string, { date: string; label: string; count: number }> = {};

  for (const row of rows) {
    const fechaStr = row.last_fecha ?? "";
    const d = fechaStr ? new Date(fechaStr) : null;
    const mes = d ? d.toLocaleDateString("es-PA", { month: "short", timeZone: "America/Panama" }).replace(".", "") : "";
    const año = d ? d.getFullYear() : "";
    result[row.empresa] = {
      date: row.last_uploaded || row.last_fecha || "",
      label: d ? `${mes} ${año}` : "",
      count: Number(row.total_count) || 0,
    };
  }

  return NextResponse.json(result);
}
