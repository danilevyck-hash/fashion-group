import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer.from("caja_categorias").select("nombre").order("nombre");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json((data || []).map(c => c.nombre));
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.isOwner) return NextResponse.json({ error: "Solo el dueño puede crear categorías." }, { status: 403 });

  const { nombre } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const { error } = await supabaseServer.from("caja_categorias").insert({ nombre: nombre.trim() });
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.isOwner) return NextResponse.json({ error: "Solo el dueño puede eliminar categorías." }, { status: 403 });

  const { nombre } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !nombre.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const target = nombre.trim();

  // Zero-usage check: reject if any active gasto still references this categoría
  const { count, error: countError } = await supabaseServer
    .from("caja_gastos")
    .select("id", { count: "exact", head: true })
    .eq("categoria", target)
    .eq("deleted", false);
  if (countError) { console.error(countError); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  if ((count || 0) > 0) {
    return NextResponse.json({
      error: `La categoría "${target}" está en uso en ${count} gasto${count === 1 ? "" : "s"} activo${count === 1 ? "" : "s"}. No se puede eliminar.`,
    }, { status: 400 });
  }

  const { error } = await supabaseServer.from("caja_categorias").delete().eq("nombre", target);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
