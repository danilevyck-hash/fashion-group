// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/productos?empresa=&year=&mes=
//
// Nivel 1 del tab Productos: top por descripción + totales + meses con data.
// Lee RPCs sobre switch_articulo_diario (RLS service_role → server-only).
//   - switch_top_descripciones: una fila por descripción (sin límite; el cliente
//     pagina con Top 20 + "Mostrar más"). La suma = total certificado del período.
//   - switch_articulo_margen_mensual: de ahí salen los meses con data (selector).
// Totales se computan sumando el nivel 1 (0 filas con descripción/código NULL →
// cuadra al centavo con margen_mensual, la fuente validada).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PRODUCTOS_EMPRESA_KEYS,
  productosRange,
  type ProductoNivel1,
  type ProductosResponse,
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

  if (!PRODUCTOS_EMPRESA_KEYS.includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  const { desde, hasta } = productosRange(year, mes);

  const [nivel1Res, margenRes] = await Promise.all([
    supabaseServer.rpc("switch_top_descripciones", {
      p_empresa_key: empresa,
      p_desde: desde,
      p_hasta: hasta,
    }),
    supabaseServer.rpc("switch_articulo_margen_mensual", {
      p_empresa_key: empresa,
      p_year: year,
    }),
  ]);

  if (nivel1Res.error) {
    console.error("[api/ventas/productos] nivel1:", nivel1Res.error.message);
    return NextResponse.json({ error: nivel1Res.error.message }, { status: 500 });
  }
  if (margenRes.error) {
    console.error("[api/ventas/productos] meses:", margenRes.error.message);
    return NextResponse.json({ error: margenRes.error.message }, { status: 500 });
  }

  const productos = ((nivel1Res.data ?? []) as ProductoNivel1[]).map(p => ({
    descripcion: p.descripcion,
    num_codigos: Number(p.num_codigos ?? 0),
    cantidad: Number(p.cantidad ?? 0),
    venta: Number(p.venta ?? 0),
    costo: Number(p.costo ?? 0),
    margen: p.margen != null ? Number(p.margen) : null,
  }));

  // Totales = suma del nivel 1 (cuadra con la fuente certificada).
  const ventaTotal = productos.reduce((s, p) => s + p.venta, 0);
  const costoTotal = productos.reduce((s, p) => s + p.costo, 0);
  const margenTotal = ventaTotal > 0 ? (ventaTotal - costoTotal) / ventaTotal : null;

  // Meses con data (venta neta != 0) para el selector de período.
  const meses = ((margenRes.data ?? []) as { mes: number; venta: number }[])
    .filter(m => Number(m.venta ?? 0) !== 0)
    .map(m => Number(m.mes))
    .sort((a, b) => a - b);

  const body: ProductosResponse = {
    empresa,
    year,
    mes,
    desde,
    hasta,
    meses,
    totales: { venta: ventaTotal, costo: costoTotal, margen: margenTotal },
    productos,
  };
  return NextResponse.json(body);
}
