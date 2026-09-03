// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/productos/por-cliente?empresa=&year=&periodo=&ventana=&cliente=
//
// EL CAMINO INVERSO del #591: no "quién compra este producto" sino "qué me
// compra este cliente" — y "qué me dejó de comprar".
//
// UNA sola forma de respuesta, `{ filas, sinDescripcion }`, y dos usos:
//
//   ventana=actual              → la matriz (cliente × descripción) del período.
//                                 Llena el desplegable «Cliente» y filtra la
//                                 tabla. Se pide UNA vez por empresa+período.
//   ventana=previa&cliente=ID   → lo que ESE cliente compraba en la ventana
//                                 comparativa. Es lo que alimenta «Dejó de
//                                 comprar» y la columna de cambio del filtro.
//
// 🔴 EL RANGO LO RESUELVE ESTA RUTA CON LAS MISMAS FUNCIONES QUE EL NIVEL 1
// (`productosRangoPeriodo` / `productosRangoComparativo`). Si el cliente
// rearmara las fechas, el filtro y la tabla que filtra podrían mirar días
// distintos sin que nadie se entere.
//
// 🔴 ACÁ NO HAY MARGEN. `switch_factura_lineas` no trae costo, así que no
// existe —ni puede existir— un margen por cliente. Sólo piezas y venta.
//
// ⚠️ `switch_factura_lineas` sólo tiene Facturas y Notas de Crédito: las
// TRANSACCIONES de mostrador no tienen endpoint de detalle en Switch (~1% de la
// venta). La pantalla ya lo dice en el pie y lo sigue diciendo con el filtro
// puesto.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  PRODUCTOS_EMPRESA_KEYS,
  esProductosPeriodo,
  productosRangoPeriodo,
  productosRangoComparativo,
} from "@/lib/ventas/productos";
import { matrizPorCliente } from "@/lib/ventas/productos-por-cliente-server";
import { ultimoDiaArticuloDiario } from "@/lib/ventas/ultimo-dia-cargado";

export const dynamic = "force-dynamic";

/** Las dos ventanas que esta ruta sabe contestar. */
const VENTANAS = ["actual", "previa"] as const;
type Ventana = (typeof VENTANAS)[number];

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
  const periodo = sp.get("periodo") ?? "ytd";
  if (!esProductosPeriodo(periodo)) {
    return NextResponse.json({ error: "periodo inválido" }, { status: 400 });
  }
  const ventanaRaw = sp.get("ventana") ?? "actual";
  if (!(VENTANAS as readonly string[]).includes(ventanaRaw)) {
    return NextResponse.json({ error: "ventana inválida" }, { status: 400 });
  }
  const ventana = ventanaRaw as Ventana;

  // 🔴 LA VENTANA ANTERIOR SIEMPRE VA CON UN CLIENTE. Sin ese filtro sería
  // traerse el período entero por segunda vez para contestar una lista de
  // media pantalla — en una base en compute Micro eso no se regala.
  const clienteRaw = sp.get("cliente");
  const cliente = clienteRaw != null && clienteRaw !== "" ? Number(clienteRaw) : null;
  if (clienteRaw != null && clienteRaw !== "" && !Number.isInteger(cliente)) {
    return NextResponse.json({ error: "cliente inválido" }, { status: 400 });
  }
  if (ventana === "previa" && cliente == null) {
    return NextResponse.json({ error: "la ventana previa necesita un cliente" }, { status: 400 });
  }

  const ahora = new Date();
  const actual = productosRangoPeriodo(periodo, year, mes, ahora);

  try {
    // 🩸 La ventana previa corta donde corta la columna Δ del nivel 1: en el
    // último día CARGADO de `switch_articulo_diario`, no en hoy. Mismo dato,
    // misma función (`ultimoDiaArticuloDiario` + `productosRangoComparativo`).
    const { desde, hasta } = ventana === "previa"
      ? productosRangoComparativo(periodo, year, mes, ahora, await ultimoDiaArticuloDiario(empresa, actual.desde, actual.hasta))
      : actual;
    const matriz = await matrizPorCliente(empresa, desde, hasta, cliente);
    return NextResponse.json({
      empresa,
      periodo,
      ventana,
      desde,
      hasta,
      filas: matriz.filas,
      // Líneas cuyo código no está en `switch_articulo_diario` de la ventana.
      // Se cuentan y se dicen; no se les inventa una descripción.
      sinDescripcion: matriz.sinDescripcion,
    });
  } catch (e) {
    console.error("[api/ventas/productos/por-cliente]:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "no se pudo leer" }, { status: 500 });
  }
}
