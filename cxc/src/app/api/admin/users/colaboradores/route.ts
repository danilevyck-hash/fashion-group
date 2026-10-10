// GET → las fichas ACTIVAS de Asistencia, para el campo «Colaborador» de
// Usuarios › Nuevo / Editar usuario. Solo administrador, solo lee. Cuáles ya
// tienen usuario lo sabe la pantalla (la lista de usuarios trae el vínculo).
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { hoyPanama } from "@/lib/fecha-panama";
import { deBajaElDia } from "@/lib/asistencia/alta-colaborador";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from("asistencia_personas")
    .select("empleado_codigo, nombre, empresa, fecha_salida")
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  const hoy = hoyPanama();
  const filas = (data ?? []) as { empleado_codigo: string; nombre: string | null; empresa: string | null; fecha_salida: string | null }[];
  return NextResponse.json(
    filas
      .filter((f) => !deBajaElDia(f.fecha_salida, hoy))
      .map((f) => ({ codigo: String(f.empleado_codigo), nombre: f.nombre, empresa: f.empresa })),
  );
}
