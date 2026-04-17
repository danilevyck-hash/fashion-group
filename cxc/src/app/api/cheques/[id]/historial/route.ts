import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHEQUES_ROLES = ["admin", "secretaria", "director"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CHEQUES_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // activity_logs.details es TEXT con JSON stringified. logActivity escribe
  // { chequeId, from, to, cliente, user_name }. Filtro por substring del
  // chequeId en details + entity_type para reducir falsos positivos.
  const { data, error } = await supabaseServer
    .from("activity_logs")
    .select("id, user_role, action, details, created_at")
    .eq("entity_type", "cheques")
    .ilike("details", `%"chequeId":"${params.id}"%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data || []);
}
