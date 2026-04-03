import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";

// Cart is keyed by user ID or session role (for legacy shared-password users)
function getCartKey(req: NextRequest): string | null {
  const session = getSession(req);
  if (!session) return null;
  return session.userId || `role:${session.role}`;
}

// GET — load cart items
export async function GET(req: NextRequest) {
  const key = getCartKey(req);
  if (!key) return NextResponse.json({ items: [] });

  try {
    const { data } = await supabaseServer
      .from("reebok_cart")
      .select("items")
      .eq("user_key", key)
      .single();
    return NextResponse.json({ items: data?.items || [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

// PUT — save cart items
export async function PUT(req: NextRequest) {
  const key = getCartKey(req);
  if (!key) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { items } = await req.json();

  try {
    await supabaseServer
      .from("reebok_cart")
      .upsert(
        { user_key: key, items: items || [], updated_at: new Date().toISOString() },
        { onConflict: "user_key" }
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Table may not exist yet — fail gracefully
    console.error("[reebok-cart] save error:", err);
    return NextResponse.json({ ok: false });
  }
}

// DELETE — clear cart
export async function DELETE(req: NextRequest) {
  const key = getCartKey(req);
  if (!key) return NextResponse.json({ ok: true });

  try {
    await supabaseServer.from("reebok_cart").delete().eq("user_key", key);
  } catch { /* table may not exist */ }
  return NextResponse.json({ ok: true });
}
