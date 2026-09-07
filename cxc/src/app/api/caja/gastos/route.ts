import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { centavos } from "@/lib/caja/dinero";

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Alta de un gasto de caja menuda.
 *
 * 🔴 EL GASTO NO LLEVA RESPONSABLE (7-sep-2026). Daniel: «no debería de haber
 * responsable, ya la responsable es Angela la dueña del período… no deberían de
 * haber 2 nombres en un gasto, solo uno». La responsable vive en el PERÍODO,
 * amarrada por `empleado_codigo` de Asistencia. Las columnas `responsable` y
 * `responsable_id` quedan en la base, sin escritores — no se dropean.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const body = await req.json();
  const { periodo_id, fecha, descripcion, proveedor, nro_factura, subtotal, itbms, total } = body;
  const categoria = normalizeStr(body.categoria || "") || "Varios";

  if (!subtotal || Number(subtotal) <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });

  if (!periodo_id) return NextResponse.json({ error: "Falta el período" }, { status: 400 });
  if (!fecha || typeof fecha !== "string") return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });

  const proveedorRaw = typeof proveedor === "string" ? proveedor.trim() : "";
  if (!proveedorRaw || proveedorRaw === "—") return NextResponse.json({ error: "El proveedor es obligatorio." }, { status: 400 });

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

  const roundedItbms = centavos(itbms);
  const roundedTotal = centavos(total);

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({
      periodo_id, fecha,
      descripcion: descripcion || "",
      proveedor: proveedorRaw,
      nro_factura: nro_factura || "",
      categoria,
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
