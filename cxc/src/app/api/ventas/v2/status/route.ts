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
  const result: Record<string, { date: string; label: string }> = {};

  // Mes corto manual para evitar shifts de timezone al parsear "YYYY-MM-DD"
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  for (const row of rows) {
    const fechaStr = row.last_fecha ?? "";
    let label = "Sin datos";
    if (fechaStr) {
      const [yyyy, mm, dd] = fechaStr.split("-");
      const mesIdx = parseInt(mm, 10) - 1;
      if (yyyy && dd && mesIdx >= 0 && mesIdx < 12) {
        label = `${dd}-${MESES[mesIdx]}-${yyyy}`;
      }
    }
    result[row.empresa] = {
      date: row.last_uploaded || row.last_fecha || "",
      label,
    };
  }

  return NextResponse.json(result);
}
