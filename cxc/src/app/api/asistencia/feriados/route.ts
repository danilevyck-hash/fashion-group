// Feriados y cierres. Van APARTE de las justificaciones y NO persona por
// persona: si el 3 de noviembre hubiera que justificarlo uno a uno, aparecerían
// 32 ausencias. Un feriado no es ausencia de nadie.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const anio = (req.nextUrl.searchParams.get("anio") ?? "").trim();
  let q = supabaseServer.from("asistencia_feriados").select("fecha, nombre").order("fecha");
  if (/^\d{4}$/.test(anio)) q = q.gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feriados: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  let b: { fecha?: string; nombre?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const fecha = (b.fecha ?? "").trim();
  const nombre = (b.nombre ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Ponle un nombre" }, { status: 400 });
  const { error } = await supabaseServer
    .from("asistencia_feriados")
    .upsert({ fecha, nombre }, { onConflict: "fecha" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const fecha = (req.nextUrl.searchParams.get("fecha") ?? "").trim();
  if (!fecha) return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  const { error } = await supabaseServer.from("asistencia_feriados").delete().eq("fecha", fecha);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
