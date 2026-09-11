import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { centavos } from "@/lib/caja/dinero";

// Solo columnas REALES de caja_gastos. Aquí estuvieron "metodo_pago" y
// "numero_factura", que no existen (la real es nro_factura): si un cliente las
// mandaba, el update reventaba con 500.
//
// 🔴 `responsable` y `responsable_id` SALIERON de esta lista el 7-sep-2026: el
// gasto ya no lleva responsable (es del PERÍODO). Las columnas se quedan en la
// base, sin escritores.
const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "nro_factura"];

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function pick(body: Record<string, unknown>, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) result[f] = body[f]; }
  return result;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  // 🔴 RESTAURAR UN GASTO BORRADO (11-sep-2026).
  //
  // 🩸 El aviso de eliminar prometía *«Podrás restaurarlo desde Gastos
  // eliminados si es un error»* y esa pantalla era de SOLO LECTURA desde el
  // 7-sep: el botón se había retirado por cero usos, y el aviso se quedó
  // diciendo lo que ya no era cierto. Daniel, textual: *«a) vuelve
  // Restaurar»*. El soft delete ya existía (`deleted`, `deleted_by`,
  // `deleted_at`): lo único que faltaba era la puerta de vuelta.
  //
  // 🔴 Va en su propia rama y NO por `ALLOWED_FIELDS`: `deleted` no es un campo
  // que se edite junto con la fecha o el monto. Y solo con el período ABIERTO,
  // igual que borrar: devolver un gasto a un período cerrado le cambiaría el
  // total a algo que ya se imprimió.
  if (body?.restaurar === true) {
    const { data: fila } = await supabaseServer
      .from("caja_gastos")
      .select("id, descripcion, total, deleted, caja_periodos(estado, deleted)")
      .eq("id", params.id)
      .maybeSingle();
    if (!fila) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    const per = Array.isArray(fila.caja_periodos) ? fila.caja_periodos[0] : fila.caja_periodos;
    if (!per || per.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 400 });
    if (per.estado !== "abierto") {
      return NextResponse.json(
        { error: "El período ya está cerrado: no se puede devolver un gasto." },
        { status: 400 },
      );
    }
    // Restaurar algo que no está borrado no es un error: no se escribe y listo.
    if (fila.deleted !== true) return NextResponse.json({ ok: true });

    const { error } = await supabaseServer
      .from("caja_gastos")
      .update({ deleted: false, deleted_by: null, deleted_at: null })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: "Error al restaurar gasto" }, { status: 500 });

    await logActivity(auth.role, "caja_gasto_restore", "caja", {
      gastoId: params.id,
      descripcion: fila.descripcion,
      total: fila.total,
    }, auth.userName);
    return NextResponse.json({ ok: true });
  }

  const fields = pick(body, ALLOWED_FIELDS);

  // Validate the gasto belongs to an open, non-deleted period before touching it.
  const { data: owning } = await supabaseServer
    .from("caja_gastos")
    .select("id, caja_periodos(estado, deleted)")
    .eq("id", params.id)
    .maybeSingle();
  if (!owning) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
  const periodo = Array.isArray(owning.caja_periodos) ? owning.caja_periodos[0] : owning.caja_periodos;
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 400 });
  if (periodo.estado !== "abierto") return NextResponse.json({ error: "No se pueden editar gastos de un período cerrado." }, { status: 400 });

  if (typeof fields.fecha === "string" && fields.fecha) {
    const hoyPanama = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    if (fields.fecha > hoyPanama) return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });
  }

  if (typeof fields.categoria === "string") fields.categoria = normalizeStr(fields.categoria) || "Varios";

  if ("proveedor" in fields) {
    const raw = typeof fields.proveedor === "string" ? fields.proveedor.trim() : "";
    if (!raw || raw === "—") return NextResponse.json({ error: "El proveedor es obligatorio." }, { status: 400 });
    fields.proveedor = raw;
  }

  if (fields.itbms !== undefined) fields.itbms = centavos(fields.itbms as number);
  if (fields.total !== undefined) fields.total = centavos(fields.total as number);
  const { data, error } = await supabaseServer.from("caja_gastos").update(fields).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error al actualizar gasto" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_gasto_update", "caja", { gastoId: params.id, fields: Object.keys(fields) }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const { data: existing } = await supabaseServer
    .from("caja_gastos")
    .select("id, descripcion, total, categoria, fecha, proveedor, nro_factura")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });

  const { error } = await supabaseServer
    .from("caja_gastos")
    .update({ deleted: true, deleted_by: auth.userId, deleted_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error al eliminar gasto" }, { status: 500 });

  await logActivity(auth.role, "caja_gasto_delete", "caja", {
    gastoId: params.id,
    descripcion: existing.descripcion,
    total: existing.total,
    categoria: existing.categoria,
    fecha: existing.fecha,
    proveedor: existing.proveedor,
    nro_factura: existing.nro_factura,
  }, auth.userName);

  return NextResponse.json({ ok: true });
}
