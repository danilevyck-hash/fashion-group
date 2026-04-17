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

  const roundedItbms = Math.round((Number(itbms) || 0) * 100) / 100;
  const roundedTotal = Math.round((Number(total) || 0) * 100) / 100;

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({
      periodo_id, fecha,
      descripcion: descripcion || "",
      proveedor: proveedor || "",
      nro_factura: nro_factura || "",
      responsable,
      categoria,
      empresa: empresa || "",
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
