import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { MOV_CONCEPTOS } from "@/app/prestamos/components/types";
import { getQuincenaRangePanama } from "@/lib/prestamos-quincena";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !["admin", "contabilidad"].includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const empleadoId = req.nextUrl.searchParams.get("empleado_id");

  let query = supabaseServer
    .from("prestamos_movimientos")
    .select("*")
    .or("deleted.is.null,deleted.eq.false")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (empleadoId) {
    query = query.eq("empleado_id", empleadoId);
  }

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !["admin", "contabilidad"].includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { empleado_id, fecha, concepto, monto, notas } = body;

  if (!empleado_id || !fecha || !concepto || !monto) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }
  if (Number(monto) <= 0) {
    return NextResponse.json({ error: "El monto debe ser positivo" }, { status: 400 });
  }
  if (typeof concepto !== "string" || !MOV_CONCEPTOS.includes(concepto)) {
    return NextResponse.json({ error: "Concepto inválido" }, { status: 400 });
  }
  // Panamá es UTC-5 todo el año (sin DST). La fecha no puede ser futura.
  const hoyPanama = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  if (typeof fecha !== "string" || fecha > hoyPanama) {
    return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });
  }

  // Validate payment does not exceed pending balance
  const PAGO_CONCEPTOS = ["Pago", "Abono extra", "Pago de responsabilidad"];
  if (PAGO_CONCEPTOS.includes(concepto)) {
    const { data: movs } = await supabaseServer
      .from("prestamos_movimientos")
      .select("concepto, monto, estado")
      .eq("empleado_id", empleado_id)
      .eq("estado", "aprobado")
      .or("deleted.is.null,deleted.eq.false");

    const rows = movs || [];
    const prestado = rows.filter(m => m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño").reduce((s, m) => s + Number(m.monto), 0);
    const pagado = rows.filter(m => PAGO_CONCEPTOS.includes(m.concepto)).reduce((s, m) => s + Number(m.monto), 0);
    const saldo = prestado - pagado;

    if (Number(monto) > saldo) {
      return NextResponse.json({ error: `El pago excede el saldo pendiente de $${saldo.toFixed(2)}` }, { status: 400 });
    }
  }

  // Dedup de deducción quincenal: el guard del cliente (hasDeduccionEnQuincena)
  // no protege contra retries / otra pestaña. Bloqueamos una SEGUNDA deducción
  // quincenal del mismo empleado en la quincena vigente. Solo aplica al pago
  // marcado como "Deducción quincenal" (no a abonos/pagos manuales).
  if (concepto === "Pago" && typeof notas === "string" && notas.startsWith("Deducción quincenal")) {
    const { start, end } = getQuincenaRangePanama();
    const tolStart = new Date(Date.parse(start + "T00:00:00Z") - 3 * 86400000).toISOString().slice(0, 10);
    const tolEnd = new Date(Date.parse(end + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10);
    const { data: yaDed } = await supabaseServer
      .from("prestamos_movimientos")
      .select("id")
      .eq("empleado_id", empleado_id)
      .eq("estado", "aprobado")
      .eq("concepto", "Pago")
      .ilike("notas", "Deducción quincenal%")
      .gte("fecha", tolStart)
      .lte("fecha", tolEnd)
      .or("deleted.is.null,deleted.eq.false")
      .limit(1);
    if (yaDed && yaDed.length > 0) {
      return NextResponse.json({ error: "Este empleado ya tiene la deducción quincenal registrada en esta quincena." }, { status: 409 });
    }
  }

  // Determine estado based on concepto and monto
  let estado = "aprobado";
  if ((concepto === "Préstamo" || concepto === "Responsabilidad por daño") && Number(monto) >= 500) {
    estado = "pendiente_aprobacion";
  }

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({
      empleado_id,
      fecha,
      concepto,
      monto: Number(monto),
      notas: notas || null,
      estado,
    })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const s = getSession(req);
  if (!s || !["admin"].includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { empleado_id } = body;

  if (!empleado_id) {
    return NextResponse.json({ error: "empleado_id requerido" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("prestamos_movimientos")
    .delete()
    .eq("empleado_id", empleado_id);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
