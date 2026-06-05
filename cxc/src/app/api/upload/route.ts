import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Frescura de CXC por empresa = última sincronización del API
// (switch_estadocuenta.synced_at). Server-side (service_role) porque la tabla
// tiene RLS y el cliente browser/anon no la lee. Shape compatible con CxcUpload
// (company_key + uploaded_at) que consume UploadFreshness.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]); if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select("empresa_key, synced_at")
    .order("synced_at", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const latest: Record<string, { company_key: string; uploaded_at: string }> = {};
  for (const r of (data ?? []) as { empresa_key: string; synced_at: string }[]) {
    if (!latest[r.empresa_key]) latest[r.empresa_key] = { company_key: r.empresa_key, uploaded_at: r.synced_at };
  }
  return NextResponse.json(Object.values(latest));
}
