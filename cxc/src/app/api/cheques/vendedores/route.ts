// GET / POST /api/cheques/vendedores
//
// La lista de vendedores del formulario de Cheques — quién ENTREGÓ el cheque.
// Vivía en `localStorage` (`fg_cheque_vendedores`), o sea distinta en cada
// dispositivo y perdible al limpiar el navegador. Ver el porqué completo y por
// qué NO se reusan `vendedores` (espejo de Switch) ni `fg_users` en
// `supabase/migrations/20260727160000_cheque_vendedores.sql`.
//
// Historia (jul-2026): FALLABA BLANDA mientras el DDL no corriera — el GET
// respondía los de siempre con `fuente: "local"` sin loguear nada, y el POST un
// 503 "todavía no está activa". Tolerancia retirada el 3-sep-2026: la tabla
// existe desde 20260727160000_cheque_vendedores.sql (verificado en producción).
//
// Lo que SE CONSERVA es la invariante del formulario: **un error de base no
// puede dejar un cheque sin poder guardarse** (el vendedor es obligatorio), así
// que el GET sigue devolviendo los de siempre con `fuente: "local"` ante
// CUALQUIER error — pero ahora SIEMPRE lo loguea. El POST responde 500 con el
// mensaje de siempre; el cliente ya trata todo `!res.ok` igual (guarda local).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  TABLA_CHEQUE_VENDEDORES as TABLE,
  VENDEDORES_POR_DEFECTO,
} from "@/lib/cheques-vendedores";

export const dynamic = "force-dynamic";

const CHEQUES_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = getSession(req);
  if (!session || !CHEQUES_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from(TABLE)
    .select("nombre")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    // Un error de base no puede dejar el formulario sin poder guardar: el
    // vendedor es obligatorio. Se devuelven los de siempre — y se dice en el log.
    console.error("[api/cheques/vendedores] GET:", error.message);
    return NextResponse.json({ vendedores: VENDEDORES_POR_DEFECTO, fuente: "local" });
  }

  const nombres = (data ?? [])
    .map((r) => (r as { nombre: string }).nombre?.trim())
    .filter((n): n is string => Boolean(n));

  return NextResponse.json({ vendedores: nombres, fuente: "db" });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = getSession(req);
  if (!session || !CHEQUES_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) return NextResponse.json({ error: "Escribe el nombre del vendedor." }, { status: 400 });
  if (nombre.length > 80) return NextResponse.json({ error: "El nombre es demasiado largo." }, { status: 400 });

  const { error } = await supabaseServer.from(TABLE).insert({ nombre });

  if (error) {
    // 23505 = ya existe (índice único sobre upper(btrim(nombre))). No es un
    // error para el usuario: el vendedor que quería ya está en la lista.
    if (error.code === "23505") return NextResponse.json({ ok: true, nombre, yaExistia: true });
    console.error("[api/cheques/vendedores] POST:", error.message);
    return NextResponse.json({ error: "No se pudo agregar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nombre });
}
