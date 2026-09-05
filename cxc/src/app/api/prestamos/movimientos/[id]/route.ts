import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { CONCEPTO_PAGO, ORIGEN_POR_DEFECTO, esOrigenPago } from "@/lib/prestamos-conceptos";
import {
  CUENTA_DANO,
  CUENTA_PRESTAMO,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
import { hoyPanamaYmd } from "@/lib/prestamos-quincena";

const COLS_MOV = "id, fecha, concepto, monto, estado, deleted, cuenta, origen_pago";

/**
 * Editar un movimiento: fecha, monto, nota y —si es un pago— de dónde salió.
 *
 * ⚠️ EL `estado` YA NO SE ACEPTA ACÁ. Aprobar o rechazar un préstamo que pasa el
 * tope es otra acción, con otra puerta y otro permiso: `/api/prestamos/pendientes`,
 * donde el guard es «rol admin **y** que sea Daniel». Dejarlo también acá sería
 * una segunda puerta a la misma decisión.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));

  const { data: mov } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id, concepto, monto, estado, empleado_id, cuenta, origen_pago")
    .eq("id", params.id)
    .maybeSingle();
  if (!mov) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });

  // El concepto es inmutable: cambiarlo cambiaría el signo de una plata ya
  // registrada, y el saldo se movería sin que nadie registrara nada.
  if (body.concepto !== undefined && body.concepto !== mov.concepto) {
    return NextResponse.json({ error: "El tipo de movimiento no se puede cambiar después de creación" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.monto !== undefined) {
    const v = Number(body.monto);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: "El monto debe ser positivo" }, { status: 400 });
    }
    update.monto = v;
  }
  if (body.fecha !== undefined) {
    const f = String(body.fecha);
    // El PUT no validaba la fecha futura y el POST sí. Misma regla en los dos.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f > hoyPanamaYmd()) {
      return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });
    }
    update.fecha = f;
  }
  if (body.notas !== undefined) {
    update.notas = typeof body.notas === "string" && body.notas.trim() ? body.notas.trim() : null;
  }
  if (body.origen_pago !== undefined && mov.concepto === CONCEPTO_PAGO) {
    const o = body.origen_pago ?? ORIGEN_POR_DEFECTO;
    if (!esOrigenPago(o)) {
      return NextResponse.json({ error: "Elige de dónde salió el pago." }, { status: 400 });
    }
    update.origen_pago = o;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No hay nada que guardar." }, { status: 400 });
  }

  // Subir el monto de un pago no puede dejar SU cuenta en negativo. Se mira la
  // cuenta del movimiento, no el total: pagar de más el daño no se compensa con
  // lo que se deba de préstamo.
  if (update.monto !== undefined && mov.concepto === CONCEPTO_PAGO && mov.empleado_id) {
    const { data: otros } = await supabaseServer
      .from("prestamos_movimientos")
      .select(COLS_MOV)
      .eq("empleado_id", mov.empleado_id)
      .neq("id", params.id)
      .or("deleted.is.null,deleted.eq.false");
    const saldo = calcularSaldoPrestamo((otros ?? []) as MovimientoParaSaldo[]);
    const cuenta = cuentaDeMovimiento(mov as MovimientoParaSaldo);
    const disponible = saldo.cuentas[cuenta].saldo;
    if (Number(update.monto) > disponible) {
      const nombreCuenta = cuenta === CUENTA_DANO ? "daño de mercancía" : "préstamo";
      return NextResponse.json(
        { error: `El pago excede lo que debe de ${nombreCuenta}: $${disponible.toFixed(2)}` },
        { status: 400 },
      );
    }
    if (cuenta !== CUENTA_PRESTAMO && cuenta !== CUENTA_DANO) {
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  }

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  await logActivity(auth.role, "prestamo_mov_update", "prestamos", { movimientoId: params.id, fields: Object.keys(update) }, auth.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const { data: existing } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id, concepto, monto, empleado_id, deleted")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
  if (existing.deleted) return NextResponse.json({ error: "El movimiento ya fue eliminado" }, { status: 400 });

  const { error } = await supabaseServer.from("prestamos_movimientos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  await logActivity(auth.role, "prestamo_mov_delete", "prestamos", { movimientoId: params.id, concepto: existing.concepto, monto: existing.monto, empleado_id: existing.empleado_id }, auth.userName);

  return NextResponse.json({ ok: true });
}
