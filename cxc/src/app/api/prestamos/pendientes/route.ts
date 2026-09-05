/* ─────────────────────────────────────────────────────────────────────────────
 * LOS PRÉSTAMOS QUE ESPERAN A DANIEL.
 *
 * Un préstamo que deja a la persona debiendo más de un sueldo mensual no se
 * entrega solo: se guarda pendiente, sale un Telegram al chat privado de Daniel
 * y él aprueba o rechaza acá.
 *
 * ── 🔴 QUIÉN APRUEBA ES UNA PERSONA, NO UN ROL ───────────────────────────────
 * `puedeAprobarPrestamo` pide rol admin **y** que el usuario sea `daniel`. Hay
 * DOS admins en producción. Contabilidad y David lo VEN —el GET es para todo el
 * módulo— pero no lo pueden tocar: ver no es decidir, y esconderlo sería el
 * error que este módulo ya cometió una vez.
 *
 * ── 🔴 LO QUE ESPERA NO SUMA AL SALDO, PERO SE VE ────────────────────────────
 * 🩸 Los $700 de LUIS ADRIAN ARROYO estuvieron 22 días escondidos en
 * `pendiente_aprobacion` con el saldo en $0. Por eso el GET existe, por eso la
 * ficha muestra la línea gris «Esperando aprobación», y por eso caduca solo a
 * los 7 días: lo que espera para siempre es lo que se esconde.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { PRESTAMOS_ROLES, puedeAprobarPrestamo } from "@/lib/prestamos-roles";
import { ESTADO_PENDIENTE } from "@/lib/prestamos-saldo";
import { desdeCuandoEspera } from "@/lib/prestamos-tope";
import { hoyPanamaYmd } from "@/lib/prestamos-quincena";

export const dynamic = "force-dynamic";

export interface PendienteEnPantalla {
  id: string;
  empleadoId: string;
  nombre: string;
  empresa: string | null;
  monto: number;
  fecha: string;
  notas: string | null;
  espera: string;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id, empleado_id, fecha, concepto, monto, notas, prestamos_empleados(nombre, empresa)")
    .eq("estado", ESTADO_PENDIENTE)
    .or("deleted.is.null,deleted.eq.false")
    .order("fecha", { ascending: true });

  if (error) {
    console.error("[prestamos/pendientes]", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const hoy = hoyPanamaYmd();
  const items: PendienteEnPantalla[] = (data ?? []).map((m) => {
    const ficha = (m as unknown as { prestamos_empleados: { nombre: string | null; empresa: string | null } | null }).prestamos_empleados;
    return {
      id: String(m.id),
      empleadoId: String(m.empleado_id),
      nombre: String(ficha?.nombre ?? "Sin nombre"),
      empresa: ficha?.empresa ?? null,
      monto: Number(m.monto) || 0,
      fecha: String(m.fecha).slice(0, 10),
      notas: m.notas ?? null,
      espera: desdeCuandoEspera(String(m.fecha).slice(0, 10), hoy),
    };
  });

  return NextResponse.json({ items, puedeDecidir: puedeAprobarPrestamo(auth) });
}

/**
 * Aprobar → el préstamo pasa a ser plata: suma al saldo y **entra al descuento
 * de la quincena en curso aunque ya haya empezado** (el saldo no mira fechas y
 * la cuota se calcula sobre él).
 * Rechazar → se elimina (soft delete, con registro).
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  if (!puedeAprobarPrestamo(auth)) {
    return NextResponse.json(
      { error: "Solo Daniel puede aprobar o rechazar un préstamo sobre el tope." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  const accion = String(body?.accion ?? "").trim();
  if (!id || (accion !== "aprobar" && accion !== "rechazar")) {
    return NextResponse.json({ error: "Falta qué movimiento y qué hacer con él." }, { status: 400 });
  }

  const { data: mov } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id, empleado_id, concepto, monto, estado, deleted")
    .eq("id", id)
    .maybeSingle();
  if (!mov || mov.deleted === true) {
    return NextResponse.json({ error: "Ese préstamo ya no está." }, { status: 404 });
  }
  if (mov.estado !== ESTADO_PENDIENTE) {
    return NextResponse.json({ error: "Ese préstamo ya no está esperando." }, { status: 409 });
  }

  const update = accion === "aprobar" ? { estado: "aprobado" } : { deleted: true };
  const { error } = await supabaseServer.from("prestamos_movimientos").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  await logActivity(
    auth.role,
    accion === "aprobar" ? "prestamo_aprobado" : "prestamo_rechazado",
    "prestamos",
    { movimientoId: id, empleadoId: mov.empleado_id, monto: Number(mov.monto) },
    auth.userName,
  );

  return NextResponse.json({ ok: true, accion });
}
