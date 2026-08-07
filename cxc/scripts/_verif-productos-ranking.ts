/**
 * VERIFICACIÓN READ-ONLY de la pestaña Productos › Por categoría / Por artículo.
 *
 * ⚠️ NO ESCRIBE NADA. Solo `select`. Una sola lectura paginada de
 * `switch_articulo_diario` (american_classic) y toda la aritmética en memoria.
 *
 *   npx tsx scripts/_verif-productos-ranking.ts
 *
 * Qué mide:
 *   1. el tamaño real de la ventana de 12 meses (¿de verdad hay que paginar?)
 *   2. las cifras de control que dio Daniel (Women-Bags, Men-T-Shirts S/S, …)
 *      calculadas con la MISMA función pura que usa la app
 *   3. la firma del error de signo: cuánto INFLA sumar las NC en vez de restarlas
 *   4. cuántas descripciones siguen el patrón "Género-Categoría" y cuántas no
 *   5. si `codigo` y `articulo_id` son 1:1 (agrupar por código no puede fusionar
 *      dos artículos distintos sin que se sepa)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  agregarRanking,
  type FilaArticuloDiario,
} from "../src/lib/multifashion/productos-ranking";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EMPRESA = "american_classic";
const DESDE = process.env.DESDE ?? "2025-08-01";
const HASTA = process.env.HASTA ?? "2026-08-07";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (p: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);

interface Fila extends FilaArticuloDiario {
  id: number;
  fecha: string;
}

async function leerVentana(desde: string, hasta: string): Promise<Fila[]> {
  const filas: Fila[] = [];
  let esperadas: number | null = null;
  for (let p = 0; p < 200; p += 1) {
    const ini = p * 1000;
    const q = db
      .from("switch_articulo_diario")
      .select(
        "id, fecha, articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total",
        p === 0 ? { count: "exact" } : {},
      )
      .eq("empresa_key", EMPRESA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(ini, ini + 999);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    if (p === 0) esperadas = count ?? null;
    const lote = (data ?? []) as unknown as Fila[];
    filas.push(...lote);
    if (lote.length < 1000) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }
  console.log(`   COUNT exacto = ${esperadas} · leídas = ${filas.length}`);
  if (esperadas !== filas.length) throw new Error("lectura incompleta");
  return filas;
}

async function main() {
  console.log(`── Ventana ${DESDE} → ${HASTA} (${EMPRESA}) ────────────────────`);
  const filas = await leerVentana(DESDE, HASTA);

  // ── 1. ¿Hay que paginar? ───────────────────────────────────────────────────
  console.log(`\n1. TRUNCADO SILENCIOSO`);
  console.log(`   filas de la ventana: ${filas.length.toLocaleString("en-US")}`);
  console.log(`   sin paginar se leerían 1.000 → ${(100 - (1000 / filas.length) * 100).toFixed(1)}% invisible`);

  // ── 2. Cifras de control ───────────────────────────────────────────────────
  const cat = agregarRanking(filas, "categoria");
  const art = agregarRanking(filas, "codigo");
  console.log(`\n2. POR CATEGORÍA — top 10 por unidades`);
  console.log(`   TOTAL: ${cat.totales.unidades.toLocaleString("en-US")} u · ${money(cat.totales.venta)} · util ${money(cat.totales.utilidad)} · margen ${pct(cat.totales.margen)}`);
  for (const r of cat.filas.slice(0, 10)) {
    console.log(
      `   ${r.etiqueta.padEnd(26)} ${String(Math.round(r.unidades)).padStart(6)} u  ${money(r.venta).padStart(12)}  costo ${money(r.costo).padStart(12)}  util ${money(r.utilidad).padStart(12)}  ${pct(r.margen).padStart(7)}`,
    );
  }

  // ── Las cifras de control del brief y por qué NO coinciden ────────────────
  // 🩸 HALLAZGO (7-ago-2026): las tres cifras de control que venían en el
  // encargo —Women-Bags 1.446 u / $69.032— resultaron calculadas SIN restar las
  // notas de crédito. Se reproducen al centavo sumando a ciegas y no coinciden
  // con ninguna otra política. O sea que la referencia contra la que había que
  // verificar traía justamente el error que el encargo mandaba evitar.
  // Medido con la ventana 2025-08-01 → 2026-08-07, que es la del encargo: sus
  // tres conteos cuadran EXACTOS (21.709 filas, 4.094 códigos, 603
  // descripciones). En ese instante la suma ciega daba 1.446 u / $69.032,00 ·
  // 3.181 u / $67.150,00 · 2.833 u / $64.538,00 — CERO de diferencia contra el
  // encargo en las tres. La lectura neta daba 1.390 / 3.019 / 2.701.
  //
  // ⚠️ Volver a correr esto MÁS TARDE ya no da el cero: la venta del día en
  // curso sigue entrando (el cron `switch-articulos` corre a diario), así que la
  // ventana crece. Lo que no cambia es la RELACIÓN: la cifra del encargo sigue
  // pegada a la columna "ciega" y lejos de la "NETA".
  console.log(`\n   CIFRAS DE CONTROL del encargo — neta vs suma ciega`);
  const ciegoPorCat = new Map<string, { u: number; v: number; c: number }>();
  for (const f of filas) {
    const k = (f.descripcion ?? "").trim().replace(/\s+/g, " ");
    const a = ciegoPorCat.get(k) ?? { u: 0, v: 0, c: 0 };
    a.u += Number(f.cantidad_total ?? 0);
    a.v += Number(f.venta_total ?? 0);
    a.c += Number(f.costo_total ?? 0);
    ciegoPorCat.set(k, a);
  }
  for (const esperado of [
    { nombre: "Women-Bags", u: 1446, venta: 69032, margen: 33.2 },
    { nombre: "Men-T-Shirts S/S", u: 3181, venta: 67150, margen: 34.8 },
    { nombre: "Women-T-Shirts S/S", u: 2833, venta: 64538, margen: 37.9 },
  ]) {
    const r = cat.filas.find(x => x.etiqueta === esperado.nombre);
    const cg = ciegoPorCat.get(esperado.nombre);
    if (!r || !cg) { console.log(`   ⚠️ ${esperado.nombre}: NO APARECE`); continue; }
    const okCiego = Math.round(cg.u) === esperado.u && Math.abs(cg.v - esperado.venta) < 1;
    console.log(
      `   ${esperado.nombre.padEnd(20)}\n` +
      `      encargo   ${String(esperado.u).padStart(5)} u / $${esperado.venta}\n` +
      `      ciega     ${String(Math.round(cg.u)).padStart(5)} u / ${money(cg.v)}  ← el encargo se pega a ESTA (no restó las NC)${okCiego ? " · EXACTO" : ""}\n` +
      `      NETA (ok) ${String(Math.round(r.unidades)).padStart(5)} u / ${money(r.venta)} / ${pct(r.margen)}`,
    );
  }

  console.log(`\n   POR ARTÍCULO — top 5 por unidades`);
  for (const r of art.filas.slice(0, 5)) {
    console.log(`   ${r.etiqueta.padEnd(18)} ${(r.detalle ?? "").slice(0, 24).padEnd(24)} ${String(Math.round(r.unidades)).padStart(6)} u  ${money(r.venta).padStart(12)}  ${pct(r.margen).padStart(7)}`);
  }
  console.log(`   códigos distintos: ${art.filas.length.toLocaleString("en-US")}`);
  console.log(`   categorías distintas: ${cat.filas.length.toLocaleString("en-US")}`);

  // ── 3. La firma del error de signo ─────────────────────────────────────────
  const nc = filas.filter(f => String(f.tipo ?? "").trim().toUpperCase() === "NC");
  const ventaNC = nc.reduce((s, f) => s + Number(f.venta_total ?? 0), 0);
  const ciego = filas.reduce((s, f) => s + Number(f.venta_total ?? 0), 0);
  console.log(`\n3. SIGNO CONTABLE`);
  console.log(`   filas NC: ${nc.length.toLocaleString("en-US")} de ${filas.length.toLocaleString("en-US")} (${((nc.length / filas.length) * 100).toFixed(1)}%)`);
  console.log(`   venta de las NC (magnitud): ${money(ventaNC)}`);
  console.log(`   sumando a ciegas: ${money(ciego)}   ·   restando NC: ${money(cat.totales.venta)}`);
  console.log(`   diferencia: ${money(ciego - cat.totales.venta)}  = 2 × NC? ${Math.abs(ciego - cat.totales.venta - 2 * ventaNC) < 1 ? "SÍ (la firma del bug)" : "no"}`);

  // ── 4. Las descripciones NO son todas "Género-Categoría" ───────────────────
  const descs = [...new Set(filas.map(f => (f.descripcion ?? "").trim()).filter(Boolean))];
  const patron = descs.filter(d => /^(Men|Women|Kids|Boys|Girls|Unisex|Baby)-/i.test(d));
  console.log(`\n4. DESCRIPCIONES`);
  console.log(`   distintas: ${descs.length}   ·   patrón "Género-Categoría": ${patron.length}   ·   otras: ${descs.length - patron.length}`);
  console.log(`   ejemplos de "otras": ${descs.filter(d => !patron.includes(d)).slice(0, 6).join(" | ")}`);

  // ── 5. ¿codigo ↔ articulo_id es 1:1? ──────────────────────────────────────
  const porCodigo = new Map<string, Set<number>>();
  const porId = new Map<number, Set<string>>();
  for (const f of filas) {
    const c = (f.codigo ?? "").trim();
    if (!c) continue;
    if (!porCodigo.has(c)) porCodigo.set(c, new Set());
    porCodigo.get(c)!.add(f.articulo_id);
    if (!porId.has(f.articulo_id)) porId.set(f.articulo_id, new Set());
    porId.get(f.articulo_id)!.add(c);
  }
  const codigosConVariosIds = [...porCodigo.entries()].filter(([, s]) => s.size > 1);
  const idsConVariosCodigos = [...porId.entries()].filter(([, s]) => s.size > 1);
  console.log(`\n5. codigo ↔ articulo_id`);
  console.log(`   códigos con más de un articulo_id: ${codigosConVariosIds.length}`);
  console.log(`   articulo_id con más de un código: ${idsConVariosCodigos.length}`);
  if (codigosConVariosIds.length) console.log(`   ej: ${codigosConVariosIds.slice(0, 5).map(([c, s]) => `${c}→${[...s].join(",")}`).join(" | ")}`);

  // ── 6. Filas sin costo (el margen no se puede calcular) ────────────────────
  const sinCosto = filas.filter(f => Number(f.costo_total ?? 0) === 0 && Number(f.venta_total ?? 0) !== 0);
  console.log(`\n6. COSTO`);
  console.log(`   filas con venta ≠ 0 y costo = 0: ${sinCosto.length.toLocaleString("en-US")} (${((sinCosto.length / filas.length) * 100).toFixed(1)}%)`);
  console.log(`   venta de esas filas: ${money(sinCosto.reduce((s, f) => s + Number(f.venta_total ?? 0), 0))}`);
}

main().catch(e => { console.error(e); process.exit(1); });
