import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { getCompany } from "@/lib/companies";
import { construirFilaCheque } from "@/lib/cheques-fila";

const CHEQUES_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !CHEQUES_ROLES.includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { data, error } = await supabaseServer
    .from("cheques")
    .select("*")
    .eq("deleted", false)
    .order("fecha_deposito", { ascending: true });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

/**
 * La fecha de depósito es OBLIGATORIA en la pantalla pero el servidor no la
 * miraba: un POST sin ella (o con basura) entraba igual y dejaba el cheque sin
 * vencimiento — invisible para el calendario, para los avisos de "vence hoy" y
 * para el cron que alerta los vencimientos. Se exige el mismo formato que
 * produce el `<input type="date">`.
 */
function fechaValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  // Descarta fechas con forma correcta pero inexistentes (2026-02-31).
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !CHEQUES_ROLES.includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { cliente, empresa, numero_cheque, monto, fecha_deposito, notas, vendedor, cliente_codigo } = body;

  if (typeof cliente !== "string" || !cliente.trim()) return NextResponse.json({ error: "cliente requerido" }, { status: 400 });
  if (!fechaValida(fecha_deposito)) return NextResponse.json({ error: "fecha de depósito requerida" }, { status: 400 });
  if (!monto || monto <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
  if (typeof vendedor !== "string" || !vendedor.trim()) return NextResponse.json({ error: "vendedor requerido" }, { status: 400 });
  if (typeof empresa !== "string" || !getCompany(empresa)) return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  if (typeof numero_cheque !== "string" || !numero_cheque.trim()) return NextResponse.json({ error: "numero_cheque requerido" }, { status: 400 });

  // La fila se arma en `@/lib/cheques-fila`, no acá: `cheques.banco` es NOT NULL
  // sin default y el formulario no lo captura — dejarlo fuera del INSERT es lo
  // que rompió el guardado durante 3 meses y medio (23502). Ver el encabezado
  // de ese archivo.
  // Historia (ago-2026): `cliente_codigo` era la columna nueva y, si el INSERT
  // fallaba nombrándola (PGRST204/42703), se reintentaba SIN el vínculo y se
  // avisaba con `_falta_migracion_codigo`. Tolerancia retirada el 3-sep-2026: la
  // columna existe desde 20260808190000_cheques_cliente_codigo.sql (verificado en
  // producción). Hoy un error es un error: guardar el cheque sin su cliente y
  // seguir sería registrar plata a nombre de nadie sin que nadie se entere.
  const { data, error } = await supabaseServer
    .from("cheques")
    .insert(construirFilaCheque({ cliente, empresa, numero_cheque, monto, fecha_deposito, notas, vendedor, cliente_codigo }))
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
