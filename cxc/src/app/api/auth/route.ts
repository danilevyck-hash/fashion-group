import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const roles: Record<string, string> = {};
  if (process.env.ADMIN_PASSWORD) roles[process.env.ADMIN_PASSWORD] = "admin";
  if (process.env.DIRECTOR_PASSWORD) roles[process.env.DIRECTOR_PASSWORD] = "director";
  if (process.env.DAVID_PASSWORD) roles[process.env.DAVID_PASSWORD] = "david";
  if (process.env.UPLOAD_PASSWORD) roles[process.env.UPLOAD_PASSWORD] = "upload";
  if (process.env.CONTABILIDAD_PASSWORD) roles[process.env.CONTABILIDAD_PASSWORD] = "contabilidad";
  if (process.env.VENDEDOR_PASSWORD) roles[process.env.VENDEDOR_PASSWORD] = "vendedor";
  if (process.env.CLIENTE_PASSWORD) roles[process.env.CLIENTE_PASSWORD] = "cliente";

  const role = roles[password];
  if (!role) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  // Check if role is active (skip check if table doesn't exist yet)
  try {
    const { data } = await supabaseServer
      .from("role_permissions")
      .select("activo")
      .eq("role", role)
      .single();

    if (data && data.activo === false) {
      return NextResponse.json({ error: "Este acceso ha sido desactivado" }, { status: 403 });
    }
  } catch {
    // Table may not exist yet — allow login
  }

  return NextResponse.json({ role });
}
