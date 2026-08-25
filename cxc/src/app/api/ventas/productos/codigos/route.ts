// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/productos/codigos?empresa=&year=&mes=&periodo=&descripcion=
//
// Nivel 2 (drill-down): lo que hay ADENTRO de una descripción. Dos cosas, y las
// dos sirven:
//   · `codigos`  — los códigos (los colores/tallas de ese modelo), con
//                  cantidad/venta/margen. Es lo que ya se veía acá.
//   · `clientes` — QUIÉN LO COMPRA, del que más al que menos. Es lo que pidió
//                  Daniel el 24-ago-2026: *"quién compra más una descripción"*.
//
// Lazy-load al expandir una fila del tab Productos. Mismo rango que el nivel 1:
// resuelve el período con LA MISMA función, así los códigos de adentro nunca
// suman un rango distinto del que muestra la fila de arriba.
//
// 🔑 LOS CLIENTES SE CRUZAN POR CÓDIGO, NO POR EL TEXTO DE LA DESCRIPCIÓN, y
// los códigos son EXACTAMENTE los que devuelve el bloque de arriba. Las dos
// tablas nombran distinto al mismo producto ("Men-Shirts / Woven Tops L/S" en
// `switch_articulo_diario` contra "Men-Shirts Woven Tops L/S" en
// `switch_factura_lineas`): cruzando por texto, 39 de 136 descripciones de
// vistana quedaban sin un solo cliente — $184.164,23, el 7,66% de la pantalla.
// Cruzando por código quedan 11 ($11.435,32 = 0,48%) y la cobertura es 99,47%.
//
// ⚠️ `switch_factura_lineas` sólo tiene Facturas y Notas de Crédito: las
// TRANSACCIONES de mostrador no tienen endpoint de detalle en Switch, así que
// no están. Son ~1% de la venta (medido: 0,37%–1,66% según la empresa) y por
// eso la lista de clientes suma un poco menos que la fila de arriba. La
// pantalla lo DICE en vez de dejar que se descubra sumando.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PRODUCTOS_EMPRESA_KEYS,
  esProductosPeriodo,
  productosRangoPeriodo,
  type ProductoCodigo,
} from "@/lib/ventas/productos";
import { clientesDeCodigos } from "@/lib/ventas/productos-clientes-server";
import type { ClienteDeProducto } from "@/lib/ventas/productos-clientes";

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
  const periodo = sp.get("periodo") ?? "ytd";
  if (!esProductosPeriodo(periodo)) {
    return NextResponse.json({ error: "periodo inválido" }, { status: 400 });
  }

  const { desde, hasta } = productosRangoPeriodo(periodo, year, mes, new Date());

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

  // Quién compra esta descripción. Los códigos ya están: no se vuelve a
  // resolver la descripción, se le pasa la MISMA lista al lector de clientes —
  // así los dos bloques del desplegable hablan del mismo conjunto de artículos.
  //
  // Que esto falle NO puede llevarse los códigos: son dos preguntas distintas y
  // la de arriba ya está contestada. Se devuelve `clientes: null`, que la
  // pantalla lee como "no se pudo" (distinto de `[]`, que es "no hay").
  let clientes: ClienteDeProducto[] | null = null;
  try {
    clientes = await clientesDeCodigos(empresa, desde, hasta, codigos.map(c => c.codigo));
  } catch (e) {
    console.error("[api/ventas/productos/codigos] clientes:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ codigos, clientes });
}
