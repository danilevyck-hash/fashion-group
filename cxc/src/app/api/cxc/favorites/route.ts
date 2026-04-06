import { NextRequest, NextResponse } from "next/server";
import { requireRole, SessionPayload } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/cxc/favorites
 * Returns the list of favorited client names for the current user.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const session = auth as SessionPayload;
  const userId = session.userId || session.userName || "default";

  const { data, error } = await supabaseServer
    .from("cxc_favorites")
    .select("nombre_normalized")
    .eq("user_id", userId);

  if (error) {
    console.error("cxc_favorites GET error:", error);
    return NextResponse.json({ error: "Error al cargar favoritos" }, { status: 500 });
  }

  const names = (data || []).map((r: { nombre_normalized: string }) => r.nombre_normalized);
  return NextResponse.json({ favorites: names });
}

/**
 * POST /api/cxc/favorites
 * Toggle a favorite for a client. Body: { clientName: string }
 * If already favorited, removes it. If not, adds it.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const session = auth as SessionPayload;
  const userId = session.userId || session.userName || "default";

  let body: { clientName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const clientName = body.clientName?.trim();
  if (!clientName) {
    return NextResponse.json({ error: "clientName requerido" }, { status: 400 });
  }

  // Check if already favorited
  const { data: existing } = await supabaseServer
    .from("cxc_favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("nombre_normalized", clientName)
    .maybeSingle();

  if (existing) {
    // Remove favorite
    const { error } = await supabaseServer
      .from("cxc_favorites")
      .delete()
      .eq("id", existing.id);

    if (error) {
      console.error("cxc_favorites DELETE error:", error);
      return NextResponse.json({ error: "Error al quitar favorito" }, { status: 500 });
    }
    return NextResponse.json({ action: "removed", clientName });
  } else {
    // Add favorite
    const { error } = await supabaseServer
      .from("cxc_favorites")
      .insert({ user_id: userId, nombre_normalized: clientName });

    if (error) {
      console.error("cxc_favorites INSERT error:", error);
      return NextResponse.json({ error: "Error al guardar favorito" }, { status: 500 });
    }
    return NextResponse.json({ action: "added", clientName });
  }
}
