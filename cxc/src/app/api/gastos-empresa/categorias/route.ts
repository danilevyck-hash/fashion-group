import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Catálogo de categorías de gastos: crear (POST) y editar (PATCH).

const COLS = "id, nombre, orden, es_fijo, activo";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    const nombre = body && typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json({ error: "El nombre de la categoría es obligatorio." }, { status: 400 });
    }
    const esFijo = body && typeof body.es_fijo === "boolean" ? body.es_fijo : true;

    // orden = máximo existente + 10 (la nueva queda al final de la lista).
    const { data: maxRow, error: maxErr } = await supabaseServer
      .from("gastos_categorias")
      .select("orden")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new Error(`gastos_categorias (max orden): ${maxErr.message}`);
    const orden = (maxRow?.orden ?? 0) + 10;

    const { data, error } = await supabaseServer
      .from("gastos_categorias")
      .insert({ nombre, es_fijo: esFijo, orden })
      .select(COLS)
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
      }
      throw new Error(`gastos_categorias (insert): ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[gastos-empresa/categorias POST]", err);
    return NextResponse.json(
      { error: "No se pudo crear la categoría. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    const id = body && typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Falta la categoría a editar." }, { status: 400 });
    }

    const updates: { nombre?: string; es_fijo?: boolean; activo?: boolean } = {};
    if (body.nombre !== undefined) {
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
      if (!nombre) {
        return NextResponse.json({ error: "El nombre de la categoría no puede quedar vacío." }, { status: 400 });
      }
      updates.nombre = nombre;
    }
    if (body.es_fijo !== undefined) {
      if (typeof body.es_fijo !== "boolean") {
        return NextResponse.json({ error: "Fijo/variable inválido." }, { status: 400 });
      }
      updates.es_fijo = body.es_fijo;
    }
    if (body.activo !== undefined) {
      if (typeof body.activo !== "boolean") {
        return NextResponse.json({ error: "Activo/inactivo inválido." }, { status: 400 });
      }
      updates.activo = body.activo;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay cambios que guardar." }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("gastos_categorias")
      .update(updates)
      .eq("id", id)
      .select(COLS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
      }
      throw new Error(`gastos_categorias (update): ${error.message}`);
    }
    if (!data) {
      return NextResponse.json({ error: "Esa categoría ya no existe. Recarga la página." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[gastos-empresa/categorias PATCH]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la categoría. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
