// Faltas justificadas, por RANGO de fechas.
//
// 🩸 Idea de Daniel y la que más trabajo ahorra: se marca el día que pasa, no
// al cerrar la quincena — para entonces nadie recuerda quién fue al doctor el
// día 14. También se pueden cargar retroactivas.
//
// Es un RANGO y no un día suelto: unas vacaciones son UNA fila, no diez.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  let q = supabaseServer
    .from("asistencia_justificaciones")
    .select("id, empleado_codigo, desde, hasta, motivo, nota, registrado_por, created_at")
    .order("desde", { ascending: false })
    .limit(500);
  const desde = sp.get("desde"), hasta = sp.get("hasta");
  // Se solapa con el rango pedido, no "está contenido en": unas vacaciones que
  // arrancan antes del rango igual cubren días de adentro.
  if (desde && hasta) q = q.lte("desde", hasta).gte("hasta", desde);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ justificaciones: data ?? [], motivos: MOTIVOS_JUSTIFICACION });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  let b: { codigo?: string; desde?: string; hasta?: string; motivo?: string; nota?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const codigo = (b.codigo ?? "").trim();
  const desde = (b.desde ?? "").trim();
  const hasta = (b.hasta ?? desde).trim();
  const motivo = (b.motivo ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "Falta la persona" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  // Un rango al revés no cubriría ningún día: sería una justificación que no
  // justifica nada, y en silencio.
  if (hasta < desde) return NextResponse.json({ error: "La fecha final es anterior a la inicial" }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: "Falta el motivo" }, { status: 400 });

  const { error } = await supabaseServer.from("asistencia_justificaciones").insert({
    empleado_codigo: codigo, desde, hasta, motivo,
    nota: (b.nota ?? "").trim() || null,
    registrado_por: auth.userName ?? auth.role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const { error } = await supabaseServer.from("asistencia_justificaciones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
