// Endpoint de lectura para el catálogo canónico de transportistas (Sprint 1).
// Lo consume el form de guías para llenar el select cuando el modo es
// "transportista". Devuelve solo los activos, ordenados por nombre.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const GUIAS_ROLES = ["admin", "secretaria", "bodega", "director", "vendedor"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("transportistas")
    .select("id, nombre, activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error("[/api/transportistas] GET error:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}
