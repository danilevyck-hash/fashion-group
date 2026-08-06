/**
 * VERIFICACIÓN READ-ONLY del diccionario articulo_id → MARCA (Multifashion).
 *
 * Corre el MISMO camino de lectura que `syncArticuloMarca` —barrido de
 * `/apiarticulos/lista` + un `/apiarticulos/info` por marcaId nuevo— pero NO
 * ESCRIBE NADA. Sirve para dos cosas:
 *
 *   1. medir la COBERTURA real: de los artículos que se vendieron, ¿a cuántos
 *      se les puede poner marca?
 *   2. mostrar el ranking por marca que la pestaña va a dibujar, calculado con
 *      el MISMO módulo puro (`agregarProductos`) — así lo que se reporta acá y
 *      lo que se ve en pantalla no pueden contradecirse.
 *
 *   npx tsx scripts/_verif-articulo-marca.ts            → mes en curso
 *   MES=2026-06 npx tsx scripts/_verif-articulo-marca.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EMPRESA = "american_classic";

const hoy = new Date().toISOString().slice(0, 7);
const [YEAR, MES] = (process.env.MES ?? hoy).split("-").map(Number);
const dd = (n: number) => String(n).padStart(2, "0");
const DESDE = `${YEAR}-${dd(MES)}-01`;
const HASTA = `${YEAR}-${dd(MES)}-${dd(new Date(Date.UTC(YEAR, MES, 0)).getUTCDate())}`;

async function main() {
  const { createSwitchClient } = await import("../src/lib/switch-api/client");
  const { agregarProductos } = await import("../src/lib/multifashion/productos");
  const cli = createSwitchClient(EMPRESA);

  // ── 1. Barrido del catálogo (mismo corte que el sync: página VACÍA) ────────
  const catalogo: { id: number; codigo: string; marcaId: number | null; codigoBarra: string | null }[] = [];
  const representante = new Map<number, string>();
  for (let p = 1; p <= 400; p++) {
    const r = await cli.getArticulos({ porPagina: 50, paginaActual: p });
    const lote = r?.articulos ?? [];
    if (lote.length === 0) break;
    for (const a of lote) {
      catalogo.push({ id: a.id, codigo: a.codigo, marcaId: a.marcaId ?? null, codigoBarra: a.codigoBarra ?? null });
      if (a.marcaId != null && a.codigoBarra && !representante.has(a.marcaId)) {
        representante.set(a.marcaId, a.codigoBarra);
      }
    }
  }
  const conMarcaId = catalogo.filter(a => a.marcaId != null).length;
  console.log(`catálogo de Switch: ${catalogo.length} artículos · con marcaId: ${conMarcaId} (${((conMarcaId / catalogo.length) * 100).toFixed(1)}%) · marcaId distintos: ${representante.size}`);

  // ── 2. Nombre de cada marca (/apiarticulos/info, uno por marcaId) ──────────
  const nombres = new Map<number, string>();
  for (const [marcaId, cb] of representante) {
    try {
      const info = await cli.getArticuloInfo(cb);
      const nom = (info?.articulo?.marca ?? "").trim();
      if (nom) nombres.set(marcaId, nom);
    } catch { /* una marca sin nombre no tumba el barrido */ }
  }
  console.log(`nombres resueltos: ${nombres.size}/${representante.size}`);
  console.log(`marcas: ${[...nombres.entries()].sort((a, b) => a[0] - b[0]).map(([id, n]) => `${id}=${n}`).join(" · ")}`);

  // ── 3. Ventas del mes (paginado, igual que la ruta) ────────────────────────
  const filas: Record<string, unknown>[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await db
      .from("switch_articulo_diario")
      .select("articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total")
      .eq("empresa_key", EMPRESA).gte("fecha", DESDE).lte("fecha", HASTA)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }

  // ── 4. Cobertura y ranking, con el MISMO módulo puro que la ruta ───────────
  const mapa = catalogo
    .filter(a => a.marcaId != null)
    .map(a => ({ articulo_id: a.id, marca_id: a.marcaId, marca_nombre: nombres.get(a.marcaId!) ?? null }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = agregarProductos(filas as any, mapa, 50);
  const vendidos = new Set(filas.map(f => f.articulo_id as number));
  const cubiertos = [...vendidos].filter(id => mapa.some(m => m.articulo_id === id && m.marca_nombre)).length;

  console.log(`\n── ${DESDE} → ${HASTA} ──`);
  console.log(`filas: ${filas.length} · artículos vendidos distintos: ${vendidos.size}`);
  console.log(`con marca resuelta: ${cubiertos} (${((cubiertos / Math.max(1, vendidos.size)) * 100).toFixed(1)}%)`);
  console.log(`sin marca: ${r.sinMarca.articulos} artículos · $${r.sinMarca.venta.toLocaleString("en-US")}`);
  console.log(`total del mes: $${r.totales.venta.toLocaleString("en-US")} · ${r.totales.unidades} unidades`);

  console.log(`\nMÁS VENDIDO POR MARCA:`);
  for (const m of r.marcas.slice(0, 15)) {
    console.log(
      `  ${m.marca.padEnd(16)} ${String(m.unidades).padStart(6)} u  $${m.venta.toLocaleString("en-US").padStart(11)}  ` +
      `${((m.pct ?? 0) * 100).toFixed(1).padStart(5)}%  (${m.articulos} artículos)`,
    );
  }
  const suma = r.marcas.reduce((s, m) => s + m.venta, 0);
  console.log(`\ncontrol: la suma de las marcas (${Math.round(suma * 100) / 100}) vs el total (${r.totales.venta}) → diferencia ${Math.round((suma - r.totales.venta) * 100) / 100}`);
}

main().catch(e => { console.error(e); process.exit(1); });
