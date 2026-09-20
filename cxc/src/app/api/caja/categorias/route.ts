import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { claveCategoria, normalizarCategoria } from "@/lib/caja/categorias";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

/**
 * 🔴 LAS CATEGORÍAS SON DEL EQUIPO (20-sep-2026). Daniel: «que los que tengan
 * el módulo las puedan crear para siempre en todos los usuarios». Crear es de
 * cualquiera con el módulo; QUITAR sigue siendo del dueño.
 *
 * 🔴 SOFT DELETE FIRMADO, NUNCA DELETE, y única solo entre ACTIVAS (DDL
 * 20261212120000). Falla ABIERTA: mientras esa migración no corra, la lista se
 * lee y se crea igual que hoy.
 */

/** Las categorías vivas. Falla ABIERTA si la columna `deleted` no existe. */
async function leerCategorias(): Promise<{ nombres: string[] | null }> {
  const conFiltro = await supabaseServer
    .from("caja_categorias")
    .select("nombre")
    .eq("deleted", false)
    .order("nombre");
  if (!conFiltro.error) return { nombres: (conFiltro.data || []).map((c) => c.nombre) };

  const plano = await supabaseServer.from("caja_categorias").select("nombre").order("nombre");
  if (plano.error) { console.error(plano.error); return { nombres: null }; }
  return { nombres: (plano.data || []).map((c) => c.nombre) };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { nombres } = await leerCategorias();
  if (!nombres) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json(nombres);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { nombre } = await req.json().catch(() => ({ nombre: "" }));
  const limpio = normalizarCategoria(typeof nombre === "string" ? nombre : "");
  if (!limpio) return NextResponse.json({ error: "Escribe el nombre de la categoría." }, { status: 400 });
  if (limpio.length > 40) {
    return NextResponse.json({ error: "El nombre es muy largo: usa 40 letras o menos." }, { status: 400 });
  }

  // 🔴 La repetida se rechaza por CLAVE EXACTA (minúsculas y sin acentos),
  // jamás por parecido: «Materiales» y «Material» son dos categorías.
  const { nombres } = await leerCategorias();
  if (nombres) {
    const clave = claveCategoria(limpio);
    const yaEsta = nombres.find((c) => claveCategoria(c) === clave);
    if (yaEsta) return NextResponse.json({ error: `«${yaEsta}» ya está en la lista.` }, { status: 400 });
  }

  // Si estaba quitada con el mismo nombre, se REVIVE esa fila en vez de dejar
  // dos: el histórico de quién la quitó se conserva en el registro.
  const revivida = await supabaseServer
    .from("caja_categorias")
    .update({ deleted: false, deleted_at: null, deleted_by: null })
    .eq("nombre", limpio)
    .eq("deleted", true)
    .select("nombre");
  if (!revivida.error && (revivida.data || []).length > 0) {
    await logActivity(auth.role, "caja_categoria_create", "caja", { nombre: limpio, revivida: true }, auth.userName);
    return NextResponse.json({ ok: true, nombre: limpio });
  }

  const fila: Record<string, unknown> = { nombre: limpio, created_by: auth.userName || auth.role };
  let { error } = await supabaseServer.from("caja_categorias").insert(fila);
  if (error) {
    // Falla ABIERTA: sin la DDL 20261212120000 la columna `created_by` no
    // existe y la categoría se crea igual, como hoy.
    delete fila.created_by;
    ({ error } = await supabaseServer.from("caja_categorias").insert(fila));
  }
  if (error) { console.error(error); return NextResponse.json({ error: "No se pudo crear la categoría." }, { status: 500 }); }

  await logActivity(auth.role, "caja_categoria_create", "caja", { nombre: limpio }, auth.userName);
  return NextResponse.json({ ok: true, nombre: limpio });
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

  // 🔴 SOFT DELETE FIRMADO. Falla ABIERTA: sin la DDL 20261212120000 la columna
  // no existe y se quita como hasta hoy, con un DELETE.
  const suave = await supabaseServer
    .from("caja_categorias")
    .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: auth.userName || auth.role })
    .eq("nombre", target)
    .eq("deleted", false);
  if (suave.error) {
    const duro = await supabaseServer.from("caja_categorias").delete().eq("nombre", target);
    if (duro.error) { console.error(duro.error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  }

  await logActivity(auth.role, "caja_categoria_delete", "caja", { nombre: target }, auth.userName);
  return NextResponse.json({ ok: true });
}
