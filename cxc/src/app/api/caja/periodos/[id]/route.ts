import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { abrirPeriodo } from "@/lib/caja/abrir-periodo";
import { saldoDelPeriodo } from "@/lib/caja/dinero";
import { pegarResponsables } from "@/lib/caja/responsable-lectura";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;

  const includeDeleted = req.nextUrl.searchParams.get("include_deleted") === "1";

  const { data, error } = await supabaseServer
    .from("caja_periodos").select("*, caja_gastos(*)").eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  // Un período eliminado no se consulta por id: mismo 404 que uno inexistente.
  if (!data || data.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 404 });

  if (data?.caja_gastos) {
    type RawGasto = {
      id?: string;
      deleted?: boolean;
      fecha: string;
      created_at: string;
      deleted_at?: string | null;
      deleted_by?: string | null;
    };
    const active: RawGasto[] = [];
    const removed: RawGasto[] = [];
    for (const g of data.caja_gastos as RawGasto[]) {
      if (g.deleted) removed.push(g);
      else active.push(g);
    }
    active.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
    data.caja_gastos = await pegarFotos(active);

    if (includeDeleted) {
      removed.sort((a, b) => (b.deleted_at || "").localeCompare(a.deleted_at || ""));

      const uuids = Array.from(new Set(removed.map((g) => g.deleted_by).filter((v): v is string => !!v)));
      const userMap: Record<string, string> = {};
      if (uuids.length > 0) {
        const { data: users } = await supabaseServer
          .from("fg_users")
          .select("id, name")
          .in("id", uuids);
        for (const u of users || []) userMap[u.id] = u.name;
      }

      data.deleted_gastos = removed.map((g) => ({
        ...g,
        deleted_by_name: g.deleted_by ? (userMap[g.deleted_by] || null) : null,
      }));
    }
  }

  const [conResponsable] = await pegarResponsables([data as Record<string, unknown>]);
  return NextResponse.json(conResponsable);
}

/**
 * Cuántas fotos tiene cada gasto. Solo el CONTEO: las fotos en sí se piden por
 * su propia ruta, con URL firmada y de a un gasto. Falla ABIERTA — mientras la
 * DDL 20261013120000 no corra, la tabla no existe y todos vuelven en 0.
 */
async function pegarFotos<T extends { id?: string }>(gastos: T[]): Promise<Array<T & { fotos: number }>> {
  const ids = gastos.map((g) => g.id).filter((v): v is string => !!v);
  if (ids.length === 0) return gastos.map((g) => ({ ...g, fotos: 0 }));
  const { data, error } = await supabaseServer
    .from("caja_gasto_fotos")
    .select("gasto_id")
    .in("gasto_id", ids)
    .eq("deleted", false);
  if (error) return gastos.map((g) => ({ ...g, fotos: 0 }));
  const cuenta = new Map<string, number>();
  for (const f of (data || []) as Array<{ gasto_id: string }>) {
    cuenta.set(f.gasto_id, (cuenta.get(f.gasto_id) || 0) + 1);
  }
  return gastos.map((g) => ({ ...g, fotos: (g.id && cuenta.get(g.id)) || 0 }));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  try { await req.json(); } catch { /* cuerpo vacío = cerrar el período */ }

  const session = getSession(req);

  // Default action: close the period WITH the saldo it has. El cierre real es
  // «queda poca plata» (criterio de la secretaria) y la reposición devuelve el
  // fondo a $200 — exigir saldo 0 aquí producía gastos de centavos inventados
  // para cuadrar (medido: $0.05 el 22-jul y $0.87 el 1-sep, creados y borrados
  // el día del cierre). Un saldo negativo tampoco bloquea: es un hecho.
  const { data: periodo } = await supabaseServer
    .from("caja_periodos")
    .select("fondo_inicial, estado, deleted")
    .eq("id", params.id)
    .maybeSingle();
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 404 });
  if (periodo.estado === "cerrado") return NextResponse.json({ error: "Este período ya está cerrado." }, { status: 400 });

  const { data: gastos } = await supabaseServer
    .from("caja_gastos")
    .select("total")
    .eq("periodo_id", params.id)
    .eq("deleted", false);
  const fondo = Number(periodo.fondo_inicial) || 0;
  // 🩸 El saldo se redondea a centavos ANTES de guardarse y de compararse: la
  // suma en coma flotante daba 200.00000000000003 y el período Nº2 se veía en
  // rojo con «−$0.00». La cuenta vive en `src/lib/caja/dinero.ts`, una sola vez.
  const saldo = saldoDelPeriodo(fondo, (gastos || []) as Array<{ total: number | null }>);

  const today = new Date().toISOString().slice(0, 10);
  // `saldo_cierre` congela la foto del cierre (DDL 20260920120000). Mientras
  // esa migración no corra, la columna no existe: se cierra igual, sin la foto.
  let { data, error } = await supabaseServer
    .from("caja_periodos")
    .update({ estado: "cerrado", fecha_cierre: today, saldo_cierre: saldo })
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    ({ data, error } = await supabaseServer
      .from("caja_periodos")
      .update({ estado: "cerrado", fecha_cierre: today })
      .eq("id", params.id)
      .select()
      .single());
  }
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // «Cerrar y abrir el N»: el fondo sigue vivo, así que el período siguiente
  // abre de una, con el mismo fondo (hoy siempre $200) y la misma responsable.
  // 🔴 `abrirPeriodo` NO abre si ya quedó otro abierto, y dice por qué: la caja
  // lleva un solo ciclo a la vez.
  const apertura = await abrirPeriodo(fondo, auth.userId ?? null, {
    responsableEmpleadoCodigo: (data as { responsable_empleado_codigo?: string | null })?.responsable_empleado_codigo ?? null,
    rol: session?.role,
    userName: session?.userName,
  });

  await logActivity(session?.role || "unknown", "caja_periodo_close", "caja", {
    periodoId: params.id,
    fecha_cierre: today,
    saldo_cierre: saldo,
    siguiente_id: apertura.periodo?.id ?? null,
    siguiente_numero: apertura.periodo?.numero ?? null,
  }, session?.userName);
  return NextResponse.json({
    ...data,
    saldo_cierre: saldo,
    siguiente: apertura.periodo,
    siguiente_motivo: apertura.motivo,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { data: existing } = await supabaseServer.from("caja_periodos").select("id, numero").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });

  // 🔴 UN PERÍODO CON GASTOS NO SE ELIMINA. Daniel: «no se debería eliminar un
  // período con gastos, no es normal». El aviso viejo decía «¿Eliminar este
  // período y todos sus gastos?» y era mentira: solo marcaba el período, y los
  // recibos quedaban vivos apuntando a un ciclo que ya no se podía abrir.
  const { count, error: errorCuenta } = await supabaseServer
    .from("caja_gastos")
    .select("id", { count: "exact", head: true })
    .eq("periodo_id", params.id)
    .eq("deleted", false);
  if (errorCuenta) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  const gastos = count ?? 0;
  if (gastos > 0) {
    return NextResponse.json({
      error: `Este período tiene ${gastos} ${gastos === 1 ? "gasto" : "gastos"}. Un período con gastos no se elimina: elimina primero los gastos, o déjalo cerrado.`,
    }, { status: 400 });
  }

  const { error } = await supabaseServer.from("caja_periodos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_periodo_delete", "caja", { periodoId: params.id, numero: existing.numero }, session?.userName);
  return NextResponse.json({ ok: true });
}
