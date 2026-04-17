import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const body = await req.json();
  const { periodo_id, fecha, descripcion, proveedor, nro_factura, empresa, subtotal, itbms, total } = body;
  const responsable = normalizeStr(body.responsable || "");
  const categoria = normalizeStr(body.categoria || "") || "Varios";

  if (!subtotal || Number(subtotal) <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });

  if (!periodo_id) return NextResponse.json({ error: "Falta el período" }, { status: 400 });
  if (!fecha || typeof fecha !== "string") return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });

  const empresaRaw = typeof empresa === "string" ? empresa.trim() : "";
  if (!empresaRaw || empresaRaw === "—") return NextResponse.json({ error: "La empresa es obligatoria." }, { status: 400 });

  const proveedorRaw = typeof proveedor === "string" ? proveedor.trim() : "";
  if (!proveedorRaw || proveedorRaw === "—") return NextResponse.json({ error: "El proveedor es obligatorio." }, { status: 400 });

  if (!responsable) return NextResponse.json({ error: "El responsable es obligatorio." }, { status: 400 });

  // Panama is UTC-5 year-round (no DST). "Today" in Panama as YYYY-MM-DD.
  const hoyPanama = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  if (fecha > hoyPanama) return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });

  const { data: periodo } = await supabaseServer
    .from("caja_periodos")
    .select("estado, deleted")
    .eq("id", periodo_id)
    .maybeSingle();
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 400 });
  if (periodo.estado !== "abierto") return NextResponse.json({ error: "No se pueden agregar gastos a un período cerrado." }, { status: 400 });

  const roundedItbms = Math.round((Number(itbms) || 0) * 100) / 100;
  const roundedTotal = Math.round((Number(total) || 0) * 100) / 100;

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({
      periodo_id, fecha,
      descripcion: descripcion || "",
      proveedor: proveedorRaw,
      nro_factura: nro_factura || "",
      responsable,
      categoria,
      empresa: empresaRaw,
      subtotal, itbms: roundedItbms, total: roundedTotal,
      // Keep old fields populated for backwards compat
      nombre: descripcion || "",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
