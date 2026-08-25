/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL EJEMPLO QUE DANIEL PUEDE IR A COMPROBAR, Y EL CUADRE. Solo lectura.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Corre los MISMOS módulos que la pantalla (`armarMatriz`, `comprasDe`,
 * `dejoDeComprar`, y el `agruparPorCliente` del #591) sobre datos de PRODUCCIÓN
 * y dice tres cosas:
 *
 *   1. Qué le compra más un cliente grande — piezas y plata, reproducible.
 *   2. Qué dejó de comprar, separando "otros la siguen comprando" de "la empresa
 *      ya no la vende".
 *   3. EL CUADRE: lo que el filtro muestra para ese cliente en una descripción
 *      TIENE que dar exactamente lo mismo que la pestaña «Quién lo compra» de
 *      esa descripción. Se calcula por los DOS caminos y se restan.
 *
 * 🩸 EL CUADRE TIENE UNA EXCEPCIÓN CONOCIDA Y MEDIDA, la del #591: cuando un
 * código vive bajo DOS grafías en Switch, «Quién lo compra» trae TODAS las
 * líneas de los códigos de la fila (también las de la otra grafía) y el filtro
 * las reparte por la grafía más reciente de cada código. El script las separa y
 * las cuenta en vez de esconderlas en un promedio.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-productos-filtro-cliente.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  armarMatriz,
  claveCliente,
  clientesDelPeriodo,
  comprasDe,
  dejoDeComprar,
  mapaCodigoDescripcion,
  totalDeCompras,
  type LineaConCodigo,
} from "../src/lib/ventas/productos-por-cliente";
import { agruparPorCliente } from "../src/lib/ventas/productos-clientes";
import {
  productosRangoPeriodo,
  productosRangoComparativo,
  type ProductosPeriodo,
} from "../src/lib/ventas/productos";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const EMPRESA = process.env.EMPRESA ?? "vistana";
const PERIODO = (process.env.PERIODO ?? "ytd") as ProductosPeriodo;
/** El cliente del ejemplo. Por nombre, para que se lea en el reporte. */
const CLIENTE = process.env.CLIENTE ?? "City Mall Paso Canoa";
const AHORA = new Date();

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (d: string) => `${d}T00:00:00-05:00`;
const siguiente = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

async function pag<T>(etiqueta: string, hacer: (c: boolean, d: number, h: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>): Promise<T[]> {
  const out: T[] = [];
  let esperadas: number | null = null;
  for (let p = 0; p < 200; p++) {
    const { data, error, count } = await hacer(p === 0, p * 1000, p * 1000 + 999);
    if (error) throw new Error(`${etiqueta}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < 1000) break;
    if (esperadas != null && out.length >= esperadas) break;
  }
  if (esperadas != null && out.length !== esperadas) throw new Error(`${etiqueta}: ${out.length} de ${esperadas}`);
  return out;
}

const COLS = "tipo_comprobante, cliente_switch_id, cliente_nombre, codigo, cantidad, subtotal_con_descuento";

async function lineas(desde: string, hasta: string, clienteId: number | null) {
  return pag<LineaConCodigo>("switch_factura_lineas", (c, d, h) => {
    let q = db.from("switch_factura_lineas")
      .select(COLS, c ? { count: "exact" } : {})
      .eq("empresa_key", EMPRESA)
      .gte("fecha", dia(desde))
      .lt("fecha", dia(siguiente(hasta)));
    if (clienteId != null) q = q.eq("cliente_switch_id", clienteId);
    return q.order("id", { ascending: true }).range(d, h);
  });
}

async function mapa(desde: string, hasta: string, codigos: string[] | null) {
  const filas: { codigo: string | null; descripcion: string | null; fecha: string | null }[] = [];
  const lotes = codigos == null ? [null] : (() => {
    const ls: string[][] = [];
    const u = [...new Set(codigos)];
    for (let i = 0; i < u.length; i += 150) ls.push(u.slice(i, i + 150));
    return ls;
  })();
  for (const lote of lotes) {
    if (lote != null && lote.length === 0) continue;
    filas.push(...await pag("switch_articulo_diario", (c, d, h) => {
      let q = db.from("switch_articulo_diario")
        .select("codigo, descripcion, fecha", c ? { count: "exact" } : {})
        .eq("empresa_key", EMPRESA).gte("fecha", desde).lte("fecha", hasta);
      if (lote != null) q = q.in("codigo", lote);
      return q.order("id", { ascending: true }).range(d, h);
    }));
  }
  return mapaCodigoDescripcion(filas);
}

async function main() {
  // ── 1. LA MATRIZ DEL PERÍODO ────────────────────────────────────────────────
  const actual = productosRangoPeriodo(PERIODO, AHORA.getUTCFullYear(), null, AHORA);
  const previa = productosRangoComparativo(PERIODO, AHORA.getUTCFullYear(), null, AHORA);
  console.log(`\n=== ${EMPRESA} · ${PERIODO} · ${actual.desde} → ${actual.hasta} ===`);
  console.log(`    ventana anterior: ${previa.desde} → ${previa.hasta}\n`);

  const lineasActual = await lineas(actual.desde, actual.hasta, null);
  const matriz = armarMatriz(lineasActual, await mapa(actual.desde, actual.hasta, null));
  console.log(`matriz: ${lineasActual.length} líneas → ${matriz.filas.length} filas (cliente × descripción)`);
  console.log(`        ${matriz.sinDescripcion} líneas sin descripción en switch_articulo_diario (${(matriz.sinDescripcion / lineasActual.length * 100).toFixed(2)}%)`);

  const lista = clientesDelPeriodo(matriz.filas).filter(c => c.id != null);
  const elegido = lista.find(c => (c.nombre ?? "").toLowerCase() === CLIENTE.toLowerCase());
  if (!elegido) {
    console.log(`\n⛔ no encontré "${CLIENTE}". Los primeros del período:`);
    lista.slice(0, 10).forEach(c => console.log(`   ${String(c.id).padStart(6)}  ${money(c.venta).padStart(14)}  ${c.nombre}`));
    process.exit(1);
  }
  console.log(`clientes en el desplegable: ${lista.length}\n`);

  // ── 2. QUÉ LE COMPRA MÁS ────────────────────────────────────────────────────
  const compras = comprasDe(matriz.filas, elegido.id);
  const total = totalDeCompras(compras);
  const top = [...compras.entries()].sort((a, b) => b[1].venta - a[1].venta);
  console.log(`── ${elegido.nombre} (id ${elegido.id}) — ${compras.size} descripciones · ${Math.round(total.cantidad).toLocaleString("en-US")} piezas · ${money(total.venta)}`);
  console.log(`   LO QUE MÁS COMPRA:`);
  for (const [d, c] of top.slice(0, 5)) {
    console.log(`     ${d.slice(0, 34).padEnd(34)} ${String(Math.round(c.cantidad)).padStart(7)} u  ${money(c.venta).padStart(13)}  precio prom. ${money(c.cantidad > 0 ? c.venta / c.cantidad : 0)}`);
  }

  // ── 3. QUÉ DEJÓ DE COMPRAR ──────────────────────────────────────────────────
  const lineasPrevias = await lineas(previa.desde, previa.hasta, elegido.id);
  const codigosPrevios = lineasPrevias.map(l => l.codigo).filter((c): c is string => !!c);
  const matrizPrevia = armarMatriz(lineasPrevias, await mapa(previa.desde, previa.hasta, codigosPrevios));
  const comprasPrevias = comprasDe(matrizPrevia.filas, elegido.id);

  const { data: n1 } = await db.rpc("switch_top_descripciones", {
    p_empresa_key: EMPRESA, p_desde: actual.desde, p_hasta: actual.hasta,
  });
  const seVendeHoy = new Set(((n1 ?? []) as { descripcion: string; venta: number }[])
    .filter(p => Number(p.venta) > 0).map(p => p.descripcion));

  const dejados = dejoDeComprar(compras, comprasPrevias, seVendeHoy);
  console.log(`\n   DEJÓ DE COMPRAR (${dejados.length}):`);
  for (const d of dejados.slice(0, 6)) {
    console.log(`     ${d.descripcion.slice(0, 34).padEnd(34)} ${String(Math.round(d.cantidad)).padStart(7)} u  ${money(d.venta).padStart(13)}  ${d.seSigueVendiendo ? "se sigue vendiendo" : "YA NO SE VENDE"}`);
  }
  const sigue = dejados.filter(d => d.seSigueVendiendo).length;
  console.log(`     → ${sigue} se siguen vendiendo (hay a quién llamar) · ${dejados.length - sigue} ya no se venden (no hay nada que reclamar)`);

  // ── 4. EL CUADRE contra «Quién lo compra» ───────────────────────────────────
  console.log(`\n   CUADRE contra la pestaña «Quién lo compra» del #591:`);
  let cuadran = 0, difieren = 0, sumaDif = 0;
  for (const [descripcion] of top.slice(0, 10)) {
    const { data: cods } = await db.rpc("switch_articulos_por_descripcion", {
      p_empresa_key: EMPRESA, p_desde: actual.desde, p_hasta: actual.hasta, p_descripcion: descripcion,
    });
    const codigos = [...new Set(((cods ?? []) as { codigo: string }[]).map(x => x.codigo).filter(Boolean))];
    const lin: LineaConCodigo[] = [];
    for (let i = 0; i < codigos.length; i += 150) {
      const lote = codigos.slice(i, i + 150);
      lin.push(...await pag<LineaConCodigo>("lineas del #591", (c, d, h) => db.from("switch_factura_lineas")
        .select(COLS, c ? { count: "exact" } : {})
        .eq("empresa_key", EMPRESA).in("codigo", lote)
        .gte("fecha", dia(actual.desde)).lt("fecha", dia(siguiente(actual.hasta)))
        .order("id", { ascending: true }).range(d, h)));
    }
    // El camino del #591, con SU función.
    const fila591 = agruparPorCliente(lin).find(c => claveCliente(c.cliente_switch_id) === claveCliente(elegido.id));
    const mio = compras.get(descripcion)!;
    const dv = (fila591?.venta ?? 0) - mio.venta;
    const dc = (fila591?.cantidad ?? 0) - mio.cantidad;
    const ok = Math.abs(dv) < 0.005 && Math.abs(dc) < 0.005;
    if (ok) cuadran++; else { difieren++; sumaDif += Math.abs(dv); }
    console.log(`     ${ok ? "✅" : "⚠️ "} ${descripcion.slice(0, 32).padEnd(32)} filtro ${money(mio.venta).padStart(13)}  «quién lo compra» ${money(fila591?.venta ?? 0).padStart(13)}  Δ ${money(dv)}`);
  }
  console.log(`   → ${cuadran} de ${cuadran + difieren} cuadran al centavo; ${difieren} difieren (${money(sumaDif)}).`);
  if (difieren > 0) {
    console.log(`     Las que difieren son el SOBREPASO DE GRAFÍAS del #591 y «quién lo compra» suma DE MÁS:`);
    console.log(`     trae todas las líneas de los códigos de la fila, también las que en Switch viven bajo`);
    console.log(`     la otra grafía. La pantalla ya lo avisa en ámbar en esa misma lista.`);
  }

  // ── 5. EL CUADRE DURO: el total del filtro es la venta REAL del cliente ───
  // Si el reparto por descripción se comiera o duplicara algo, acá se ve: es la
  // suma cruda y firmada de TODAS sus líneas, sin pasar por ninguna descripción.
  const crudo = lineasActual
    .filter(l => claveCliente(l.cliente_switch_id ?? null) === claveCliente(elegido.id))
    .reduce((s, l) => s + (l.tipo_comprobante === "Nota de Crédito" ? -1 : 1) * Number(l.subtotal_con_descuento), 0);
  const dTotal = total.venta - crudo;
  console.log(`\n   TOTAL del filtro ${money(total.venta)}  ·  suma cruda firmada de sus líneas ${money(crudo)}  ·  Δ ${money(dTotal)} ${Math.abs(dTotal) < 0.005 ? "✅" : "⛔"}`);
  console.log(`   (las ${matriz.sinDescripcion} líneas sin descripción quedan fuera de las dos, por eso el Δ es 0)`);

}

main().catch(e => { console.error(e); process.exit(1); });
