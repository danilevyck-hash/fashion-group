import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const CAJA_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .select("*, caja_gastos(total)")
    .eq("deleted", false)
    .order("numero", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const result = (data || []).map((p) => ({
    ...p,
    total_gastado: (p.caja_gastos || []).reduce((s: number, g: { total: number }) => s + (g.total || 0), 0),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  let fondo = 200;
  try {
    const body = await req.json();
    if (body.fondo_inicial && !isNaN(Number(body.fondo_inicial))) {
      fondo = Number(body.fondo_inicial);
    }
  } catch { /* empty body = default fondo */ }

  const { data: last } = await supabaseServer
    .from("caja_periodos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (last?.numero || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .insert({ numero, fecha_apertura: today, fondo_inicial: fondo, estado: "abierto" })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
