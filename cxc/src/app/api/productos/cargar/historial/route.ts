import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const ALLOWED = ["admin", "secretaria"];

interface CargaPayload {
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
}

/** Lista el historial de cargas, más reciente primero. */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from("carga_history")
    .select("id, usuario, empresa, marca, cantidad_estilos, total_unidades, total_costo, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

/** Registra una carga (se llama al descargar la plantilla). */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: Partial<CargaPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Validación en el borde: no confiar en el cliente.
  const empresa = String(body.empresa ?? "").trim();
  const marca = String(body.marca ?? "").trim();
  const cantidad_estilos = Number(body.cantidad_estilos);
  const total_unidades = Number(body.total_unidades);
  const total_costo = Number(body.total_costo);

  if (
    !Number.isFinite(cantidad_estilos) || cantidad_estilos < 0 ||
    !Number.isFinite(total_unidades) || total_unidades < 0 ||
    !Number.isFinite(total_costo) || total_costo < 0
  ) {
    return NextResponse.json({ error: "Totales inválidos." }, { status: 400 });
  }

  const { error } = await supabaseServer.from("carga_history").insert({
    usuario: session.userName || session.role || "—",
    empresa,
    marca,
    cantidad_estilos: Math.round(cantidad_estilos),
    total_unidades: Math.round(total_unidades),
    total_costo,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo registrar la carga." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
