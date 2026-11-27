// Despachos › Pedidos › «Facturados» — quitar y devolver (27-nov-2026,
// `FACTURADOS_QUITAR_2026_11`). Solo admin y secretaria, decidido AQUÍ.
// NO toca `switch_facturas`: anota en `guias_facturas_quitadas`.
//   POST  { empresa_key, secuencial, fecha }  → quitar (sin motivo)
//   PATCH { id }                              → devolver (soft delete firmado, nunca DELETE)

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { empresasQueVe } from "@/lib/guias/pedidos-bultos";
import { FACTURADOS_QUITAR_2026_11, ROLES_QUITAR_FACTURADOS } from "@/lib/ui/facturados-quitar-2026-11";

export const dynamic = "force-dynamic";

const apagado = () => NextResponse.json({ error: "Apagado" }, { status: 404 });
const malo = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: NextRequest) {
  if (!FACTURADOS_QUITAR_2026_11) return apagado();
  const auth = requireRole(req, [...ROLES_QUITAR_FACTURADOS]);
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json().catch(() => null)) as { empresa_key?: unknown; secuencial?: unknown; fecha?: unknown } | null;
  const empresa = typeof b?.empresa_key === "string" ? b.empresa_key : "";
  const secuencial = typeof b?.secuencial === "string" ? b.secuencial.trim() : "";
  const fecha = typeof b?.fecha === "string" ? b.fecha.slice(0, 10) : "";
  if (!secuencial || secuencial.length > 40 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return malo("Factura inválida");
  if (!empresasQueVe(auth.userName, auth.role).includes(empresa)) return malo("Empresa inválida");

  const { error } = await supabaseServer.from("guias_facturas_quitadas").insert({
    empresa_key: empresa,
    secuencial,
    fecha_factura: fecha,
    quitada_por: auth.userName,
  });
  // Ya estaba quitada (índice único de la activa): da lo mismo, queda fuera.
  if (error && error.code !== "23505") return NextResponse.json({ error: "No se pudo quitar la factura" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!FACTURADOS_QUITAR_2026_11) return apagado();
  const auth = requireRole(req, [...ROLES_QUITAR_FACTURADOS]);
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return malo("Falta la factura");

  const { data, error } = await supabaseServer
    .from("guias_facturas_quitadas")
    .update({ deleted: true, devuelta_por: auth.userName, devuelta_en: new Date().toISOString() })
    .eq("id", id)
    .eq("deleted", false)
    .in("empresa_key", [...empresasQueVe(auth.userName, auth.role)])
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudo devolver la factura" }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Ya estaba devuelta" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
