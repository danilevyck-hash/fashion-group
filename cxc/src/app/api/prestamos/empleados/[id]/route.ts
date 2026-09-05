import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";
import { PRESTAMOS_ADMIN_ROLES, PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { filterEmpleadoMovimientos } from "@/lib/prestamos-helpers";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const COLS =
  "*, prestamos_movimientos(id, empleado_id, fecha, concepto, monto, notas, estado, deleted, cuenta, origen_pago, created_at)";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("prestamos_empleados").select(COLS).eq("id", params.id).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!data) return NextResponse.json(data);

  // 🔴 El nombre, la empresa y el sueldo salen de ASISTENCIA cuando la ficha
  // está atada. Daniel: «deberías de usar el nombre de asistencia para que todo
  // tenga coherencia». La ficha guarda su copia, pero quien manda es Asistencia.
  const ficha = filterEmpleadoMovimientos(data) as Record<string, unknown> & {
    empleado_codigo?: string | null;
  };
  const cod = String(ficha.empleado_codigo ?? "").trim();
  let persona: { nombre: string | null; empresa: string | null; salario_mensual: number | string | null; activo: boolean | null; fecha_salida: string | null } | null = null;
  if (cod) {
    const { data: p } = await supabaseServer
      .from("asistencia_personas")
      .select("nombre, empresa, salario_mensual, activo, fecha_salida")
      .eq("empleado_codigo", cod)
      .maybeSingle();
    persona = p ?? null;
  }
  return NextResponse.json({
    ...ficha,
    nombre: persona?.nombre ?? ficha.nombre,
    empresa: persona?.empresa ? (EMPRESA_KEY_TO_NAME[persona.empresa] ?? persona.empresa) : ficha.empresa,
    salario_mensual: persona?.salario_mensual ?? null,
    trabaja: persona ? persona.activo !== false && !(persona.fecha_salida && persona.fecha_salida < new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)) : false,
  });
}

/**
 * Editar la ficha: las DOS cuotas y —esto es nuevo— **el código de la persona**.
 *
 * 🔴 `empleado_codigo` PASA A PODER EDITARSE (5-sep-2026). Hasta hoy no se podía
 * desde ningún lado y el aviso ámbar de la planilla decía que sí. Se valida
 * contra `asistencia_personas`: se manda el CÓDIGO de alguien real, nunca un
 * nombre parecido.
 *
 * ⚠️ `activo` ya NO se acepta: la bandera se retiró (ver la migración
 * 20260925120000). Archivar y reactivar dejaron de existir — el saldo dice lo
 * que la bandera intentaba decir.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.deduccion_quincenal !== undefined) {
    const v = Number(body.deduccion_quincenal);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "La cuota de préstamo no puede ser negativa." }, { status: 400 });
    }
    update.deduccion_quincenal = v;
  }
  if (body.deduccion_dano !== undefined) {
    const v = Number(body.deduccion_dano);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "La cuota de daño no puede ser negativa." }, { status: 400 });
    }
    update.deduccion_dano = v;
  }
  if (body.notas !== undefined) update.notas = body.notas;

  if (body.empleado_codigo !== undefined) {
    const cod = String(body.empleado_codigo ?? "").trim();
    if (!cod) {
      return NextResponse.json({ error: "Elige a la persona de la lista." }, { status: 400 });
    }
    const { data: persona } = await supabaseServer
      .from("asistencia_personas")
      .select("empleado_codigo, nombre, empresa")
      .eq("empleado_codigo", cod)
      .maybeSingle();
    if (!persona) {
      return NextResponse.json(
        { error: "Esa persona no está en Asistencia. Elige a alguien de la lista." },
        { status: 400 },
      );
    }
    const { data: otra } = await supabaseServer
      .from("prestamos_empleados")
      .select("id")
      .eq("empleado_codigo", cod)
      .neq("id", params.id)
      .or("deleted.is.null,deleted.eq.false")
      .limit(1);
    if (otra && otra.length > 0) {
      return NextResponse.json(
        { error: `${persona.nombre} ya tiene una ficha de préstamo.` },
        { status: 409 },
      );
    }
    update.empleado_codigo = cod;
    // El nombre y la empresa vienen con la persona: son suyos, no de la ficha.
    update.nombre = persona.nombre;
    update.empresa = persona.empresa ? (EMPRESA_KEY_TO_NAME[persona.empresa] ?? persona.empresa) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No hay nada que guardar." }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("prestamos_empleados").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  await logActivity(auth.role, "prestamo_empleado_update", "prestamos", { empleadoId: params.id, fields: Object.keys(update) }, auth.userName);
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...PRESTAMOS_ADMIN_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const { data: existing } = await supabaseServer
    .from("prestamos_empleados").select("id, nombre").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  // Soft delete. La bandera `activo` ya no se toca: no la lee nadie.
  const { error } = await supabaseServer
    .from("prestamos_empleados").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  await logActivity(auth.role, "prestamo_empleado_delete", "prestamos", { empleadoId: params.id, nombre: existing.nombre }, auth.userName);
  return NextResponse.json({ ok: true });
}
