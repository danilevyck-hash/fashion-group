// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/productos/codigos?empresa=&year=&mes=&descripcion=
//
// Nivel 2 (drill-down): códigos de UNA descripción, con cantidad/venta/margen.
// Lazy-load al expandir una fila del tab Productos. Mismo rango que el nivel 1.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PRODUCTOS_EMPRESA_KEYS,
  productosRange,
  type ProductoCodigo,
} from "@/lib/ventas/productos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const year = parseInt(sp.get("year") ?? "", 10);
  const mesRaw = sp.get("mes");
  const mes = mesRaw != null && mesRaw !== "" ? parseInt(mesRaw, 10) : null;
  const descripcion = sp.get("descripcion") ?? "";

  if (!PRODUCTOS_EMPRESA_KEYS.includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }
  if (!descripcion) {
    return NextResponse.json({ error: "descripcion requerida" }, { status: 400 });
  }

  const { desde, hasta } = productosRange(year, mes);

  const { data, error } = await supabaseServer.rpc("switch_articulos_por_descripcion", {
    p_empresa_key: empresa,
    p_desde: desde,
    p_hasta: hasta,
    p_descripcion: descripcion,
  });
  if (error) {
    console.error("[api/ventas/productos/codigos]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const codigos = ((data ?? []) as ProductoCodigo[]).map(c => ({
    codigo: c.codigo,
    descripcion: c.descripcion,
    cantidad: Number(c.cantidad ?? 0),
    venta: Number(c.venta ?? 0),
    costo: Number(c.costo ?? 0),
    margen: c.margen != null ? Number(c.margen) : null,
  }));

  return NextResponse.json({ codigos });
}
