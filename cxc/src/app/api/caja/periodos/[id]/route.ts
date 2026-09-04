import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { abrirPeriodo } from "@/lib/caja/abrir-periodo";

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
    data.caja_gastos = active;

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
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = close period */ }

  const session = getSession(req);

  if (body.action === "repuesto") {
    const { error } = await supabaseServer.from("caja_periodos").update({ repuesto: true, repuesto_at: new Date().toISOString() }).eq("id", params.id);
    if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
    await logActivity(session?.role || "unknown", "caja_periodo_repuesto", "caja", { periodoId: params.id }, session?.userName);
    return NextResponse.json({ ok: true });
  }

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
  const totalGastos = (gastos || []).reduce((s: number, g: { total: number | null }) => s + (Number(g.total) || 0), 0);
  const fondo = Number(periodo.fondo_inicial) || 0;
  const saldo = Math.round((fondo - totalGastos) * 100) / 100;

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
  // abre de una, con el mismo fondo (hoy siempre $200). Mismo camino que el
  // botón «+ Nuevo período».
  const siguiente = await abrirPeriodo(fondo, auth.userId ?? null);

  await logActivity(session?.role || "unknown", "caja_periodo_close", "caja", {
    periodoId: params.id,
    fecha_cierre: today,
    saldo_cierre: saldo,
    siguiente_id: siguiente?.id ?? null,
    siguiente_numero: siguiente?.numero ?? null,
  }, session?.userName);
  return NextResponse.json({ ...data, saldo_cierre: saldo, siguiente });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { data: existing } = await supabaseServer.from("caja_periodos").select("id, numero").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("caja_periodos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_periodo_delete", "caja", { periodoId: params.id, numero: existing.numero }, session?.userName);
  return NextResponse.json({ ok: true });
}
