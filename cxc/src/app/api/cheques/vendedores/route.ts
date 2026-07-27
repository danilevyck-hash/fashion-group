// GET / POST /api/cheques/vendedores
//
// La lista de vendedores del formulario de Cheques — quién ENTREGÓ el cheque.
// Vivía en `localStorage` (`fg_cheque_vendedores`), o sea distinta en cada
// dispositivo y perdible al limpiar el navegador. Ver el porqué completo y por
// qué NO se reusan `vendedores` (espejo de Switch) ni `fg_users` en
// `supabase/migrations/20260727160000_cheque_vendedores.sql`.
//
// FALLA BLANDA A PROPÓSITO. El DDL lo corre Daniel a mano, así que mientras la
// tabla no exista esta ruta NO puede romper el formulario:
//   * GET  → 200 con los valores por defecto y `fuente: "local"`. El cliente
//            sabe que tiene que seguir usando localStorage como hasta hoy.
//   * POST → 503 con un mensaje claro; el cliente cae a localStorage solo.
// Corrido el SQL, las dos pasan a `fuente: "db"` sin tocar una línea de código.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  TABLA_CHEQUE_VENDEDORES as TABLE,
  VENDEDORES_POR_DEFECTO,
  tablaAusente,
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
    if (tablaAusente(error)) {
      return NextResponse.json({ vendedores: VENDEDORES_POR_DEFECTO, fuente: "local" });
    }
    console.error("[api/cheques/vendedores] GET:", error.message);
    // Tampoco un error de base puede dejar el formulario sin poder guardar: el
    // vendedor es obligatorio. Se devuelven los de siempre.
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
    if (tablaAusente(error)) {
      return NextResponse.json(
        { error: "La lista compartida de vendedores todavía no está activa.", fuente: "local" },
        { status: 503 },
      );
    }
    // 23505 = ya existe (índice único sobre upper(btrim(nombre))). No es un
    // error para el usuario: el vendedor que quería ya está en la lista.
    if (error.code === "23505") return NextResponse.json({ ok: true, nombre, yaExistia: true });
    console.error("[api/cheques/vendedores] POST:", error.message);
    return NextResponse.json({ error: "No se pudo agregar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nombre });
}
