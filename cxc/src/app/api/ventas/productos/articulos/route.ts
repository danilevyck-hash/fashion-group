// GET /api/ventas/productos/articulos?empresa=<key|todas>&desde=&hasta=
//
// 🔴 PRODUCTOS_FILTROS_2026_10: los códigos vendidos en la ventana y los que
// tienen existencia, con departamento · género · descripción, existencia y
// «vendió en 90 días». La pantalla filtra y suma en el navegador.
// Con UNA empresa trae también el cuadre de siempre (UNA SOLA VENTA): sin
// filtro, el total es el del Resumen. Solo admin.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { PRODUCTOS_EMPRESA_KEYS } from "@/lib/ventas/productos";
import { leerRango } from "@/lib/multifashion/productos-ranking";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { leerArticulos } from "@/lib/ventas/productos-articulos-server";
import { cuadreProductos } from "@/lib/ventas/una-sola-venta-server";
import { UNA_SOLA_VENTA } from "@/lib/ventas/una-sola-venta";
import { PRODUCTOS_FILTROS_2026_10, type ArticuloVendido } from "@/lib/productos/filtros";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!PRODUCTOS_FILTROS_2026_10) return NextResponse.json({ error: "no disponible" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const empresas = empresa === "todas" ? PRODUCTOS_EMPRESA_KEYS : PRODUCTOS_EMPRESA_KEYS.includes(empresa) ? [empresa] : null;
  if (!empresas) return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  const rango = leerRango(sp.get("desde"), sp.get("hasta"));
  if (!rango) return NextResponse.json({ error: "faltan desde/hasta" }, { status: 400 });
  if ("error" in rango) return NextResponse.json({ error: rango.error }, { status: 400 });

  try {
    const hoy = hoyPanama();
    const articulos: ArticuloVendido[] = [];
    // De a una empresa: lecturas grandes de a una contra compute Micro.
    for (const e of empresas) {
      const filas = await leerArticulos(e, rango.desde, rango.hasta, hoy);
      for (const a of filas) articulos.push({ ...a, campos: { ...a.campos, empresa: nombreCortoEmpresa(e) } });
    }
    let cuadre = null;
    if (UNA_SOLA_VENTA && empresas.length === 1) {
      const listado = articulos.reduce((s, a) => s + a.venta, 0);
      cuadre = await cuadreProductos({ empresa: empresas[0], desde: rango.desde, hasta: rango.hasta, listado });
    }
    return NextResponse.json({ desde: rango.desde, hasta: rango.hasta, hoy, articulos, cuadre });
  } catch (e) {
    console.error("[api/ventas/productos/articulos]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "no se pudo leer" }, { status: 500 });
  }
}
