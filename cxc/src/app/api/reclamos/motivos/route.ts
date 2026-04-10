import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

/**
 * Custom motivos for reclamos — stored in reclamo_custom_motivos table.
 * Table schema: id (uuid), motivo (text unique), created_at (timestamptz)
 *
 * If the table doesn't exist yet, run:
 *   CREATE TABLE reclamo_custom_motivos (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     motivo text UNIQUE NOT NULL,
 *     created_at timestamptz DEFAULT now()
 *   );
 */

// GET — list all custom motivos
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("reclamo_custom_motivos")
    .select("motivo")
    .order("created_at", { ascending: true });

  if (error) {
    // Table might not exist yet — return empty array as fallback
    console.error("reclamo_custom_motivos fetch error:", error.message);
    return NextResponse.json([]);
  }

  return NextResponse.json((data || []).map((r: { motivo: string }) => r.motivo));
}

// POST — add a new custom motivo
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const motivo = (body.motivo || "").trim();
  if (!motivo) return NextResponse.json({ error: "Motivo vacío" }, { status: 400 });

  const { error } = await supabaseServer
    .from("reclamo_custom_motivos")
    .upsert({ motivo }, { onConflict: "motivo" });

  if (error) {
    console.error("reclamo_custom_motivos insert error:", error.message);
    return NextResponse.json({ error: "No se pudo guardar el motivo" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
