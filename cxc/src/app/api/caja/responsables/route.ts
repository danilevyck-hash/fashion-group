import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  textoObligatorio,
  validarObligatorios,
} from "@/lib/campos-obligatorios";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  // `caja_responsables.nombre` es NOT NULL sin default. Sin esta validación un
  // body sin `nombre` llegaba como `undefined`, `JSON.stringify` borraba la
  // clave y Postgres devolvía 23502 — tapado por un 500 "Error interno".
  const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.caja_responsables);
  if (falta) return falta;

  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .insert({ nombre: textoObligatorio(body.nombre) })
    .select()
    .single();

  if (error) return respuestaErrorEscritura(error, { tabla: "caja_responsables", accion: "Caja Menuda › responsables" });
  return NextResponse.json(data);
}
