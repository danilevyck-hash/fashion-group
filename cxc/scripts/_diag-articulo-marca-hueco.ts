/**
 * DIAGNÓSTICO READ-ONLY del hueco de `switch_articulo_marca` (7-ago-2026).
 *
 * NO ESCRIBE NADA. Mide, contra producción:
 *   A. qué hay guardado (filas, marcas, rango de articulo_id)
 *   B. qué dejó (o no dejó) en switch_sync_log
 *   C. el catálogo REAL de Switch, página por página y CON TIEMPOS
 *   D. la cobertura contra las ventas de los últimos 12 meses
 *
 *   FASE=a npx tsx scripts/_diag-articulo-marca-hueco.ts   → solo base (barato)
 *   FASE=c npx tsx scripts/_diag-articulo-marca-hueco.ts   → barrido de Switch
 *   FASE=d npx tsx scripts/_diag-articulo-marca-hueco.ts   → cobertura 12m
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
const FASE = (process.env.FASE ?? "a").toLowerCase();

async function faseA() {
  console.log("── A. Lo que hay guardado ──────────────────────────────────");
  const { count } = await db
    .from("switch_articulo_marca")
    .select("articulo_id", { count: "exact", head: true })
    .eq("empresa_key", EMPRESA);
  console.log(`switch_articulo_marca(${EMPRESA}): ${count} filas`);

  const { data: minRow } = await db
    .from("switch_articulo_marca").select("articulo_id, codigo, synced_at")
    .eq("empresa_key", EMPRESA).order("articulo_id", { ascending: true }).limit(1);
  const { data: maxRow } = await db
    .from("switch_articulo_marca").select("articulo_id, codigo, synced_at")
    .eq("empresa_key", EMPRESA).order("articulo_id", { ascending: false }).limit(1);
  console.log(`articulo_id: ${minRow?.[0]?.articulo_id} … ${maxRow?.[0]?.articulo_id}`);
  console.log(`synced_at min=${minRow?.[0]?.synced_at} max=${maxRow?.[0]?.synced_at}`);

  const marcas = new Map<string, number>();
  for (let p = 0; p < 20; p++) {
    const { data } = await db
      .from("switch_articulo_marca").select("marca_id, marca_nombre")
      .eq("empresa_key", EMPRESA).order("articulo_id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    const lote = data ?? [];
    for (const r of lote) {
      const k = `${r.marca_id}=${r.marca_nombre ?? "(sin nombre)"}`;
      marcas.set(k, (marcas.get(k) ?? 0) + 1);
    }
    if (lote.length < 1000) break;
  }
  console.log(`marcas distintas: ${marcas.size}`);
  for (const [k, n] of [...marcas.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k} → ${n}`);

  console.log("\n── B. Rastro en switch_sync_log ────────────────────────────");
  const { count: nMarca } = await db
    .from("switch_sync_log").select("id", { count: "exact", head: true })
    .eq("sync_type", "articulo_marca");
  console.log(`filas con sync_type='articulo_marca': ${nMarca}`);

  const { data: delDia } = await db
    .from("switch_sync_log")
    .select("sync_type, status, started_at, finished_at, records_inserted, error_message")
    .eq("empresa_key", EMPRESA)
    .gte("started_at", "2026-08-07T08:00:00Z")
    .lte("started_at", "2026-08-07T10:00:00Z")
    .order("started_at", { ascending: true });
  console.log(`corridas de ${EMPRESA} entre 08:00 y 10:00 del 7-ago:`);
  for (const r of delDia ?? []) {
    console.log(`   ${r.started_at} → ${r.finished_at ?? "—"} ${r.sync_type}/${r.status} ins=${r.records_inserted} ${r.error_message ?? ""}`);
  }

  const { data: tipos } = await db
    .from("switch_sync_log").select("sync_type").order("started_at", { ascending: false }).limit(1000);
  console.log(`sync_type vistos en las últimas 1000 filas: ${[...new Set((tipos ?? []).map(t => t.sync_type))].sort().join(", ")}`);
}

async function faseC() {
  console.log("── C. El catálogo REAL de Switch, página por página ─────────");
  const { createSwitchClient } = await import("../src/lib/switch-api/client");
  const { logoutAllSwitchSessions } = await import("../src/lib/switch-api/client");
  const cli = createSwitchClient(EMPRESA);
  const t0 = Date.now();
  let total = 0;
  const tiempos: number[] = [];
  const ids: number[] = [];
  try {
    for (let p = 1; p <= 400; p++) {
      const ti = Date.now();
      const r = await cli.getArticulos({ porPagina: 50, paginaActual: p });
      const lote = r?.articulos ?? [];
      tiempos.push(Date.now() - ti);
      total += lote.length;
      for (const a of lote) ids.push(a.id);
      if (p <= 3 || (p >= 38 && p <= 43) || p % 25 === 0) {
        console.log(`   pág ${String(p).padStart(3)} → ${String(lote.length).padStart(3)} art · ${tiempos[tiempos.length - 1]} ms · acumulado ${total}`);
      }
      if (lote.length === 0) { console.log(`   pág ${p} VACÍA → corte`); break; }
    }
  } finally {
    await logoutAllSwitchSessions();
  }
  const seg = (Date.now() - t0) / 1000;
  const ms = tiempos.filter(t => t > 0).sort((a, b) => a - b);
  console.log(`\nTOTAL: ${total} artículos en ${tiempos.length} páginas · ${seg.toFixed(1)} s`);
  console.log(`ms por página: p50=${ms[Math.floor(ms.length / 2)]} p90=${ms[Math.floor(ms.length * 0.9)]} max=${ms[ms.length - 1]}`);
  console.log(`ids distintos: ${new Set(ids).size} · primeros 2000 ids: min=${Math.min(...ids.slice(0, 2000))} max=${Math.max(...ids.slice(0, 2000))}`);

  // ¿Los 2000 guardados son exactamente los 2000 PRIMEROS del barrido?
  const guardados = new Set<number>();
  for (let p = 0; p < 20; p++) {
    const { data } = await db
      .from("switch_articulo_marca").select("articulo_id")
      .eq("empresa_key", EMPRESA).order("articulo_id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    const lote = data ?? [];
    for (const r of lote) guardados.add(r.articulo_id as number);
    if (lote.length < 1000) break;
  }
  const primeros = ids.slice(0, guardados.size);
  const iguales = primeros.length === guardados.size && primeros.every(id => guardados.has(id));
  console.log(`¿los ${guardados.size} guardados == los ${guardados.size} primeros del barrido, en orden de página? ${iguales ? "SÍ" : "NO"}`);
  if (!iguales) {
    const faltan = primeros.filter(id => !guardados.has(id)).slice(0, 10);
    console.log(`   ejemplos del barrido que NO están guardados: ${faltan.join(", ")}`);
  }
}

async function faseD() {
  console.log("── D. Cobertura contra las ventas de 12 meses ───────────────");
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const desde = new Date(Date.UTC(hoy.getUTCFullYear() - 1, hoy.getUTCMonth(), hoy.getUTCDate())).toISOString().slice(0, 10);
  const ventas = new Map<number, number>(); // articulo_id → venta neta
  let filas = 0;
  for (let p = 0; p < 200; p++) {
    const { data, error } = await db
      .from("switch_articulo_diario")
      .select("articulo_id, tipo, venta_total")
      .eq("empresa_key", EMPRESA).gte("fecha", desde).lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas += lote.length;
    for (const r of lote) {
      const signo = String(r.tipo ?? "").toUpperCase().includes("NC") || String(r.tipo ?? "") === "03" ? -1 : 1;
      const id = r.articulo_id as number;
      ventas.set(id, (ventas.get(id) ?? 0) + signo * Number(r.venta_total ?? 0));
    }
    if (lote.length < 1000) break;
  }
  const conMarca = new Set<number>();
  for (let p = 0; p < 20; p++) {
    const { data } = await db
      .from("switch_articulo_marca").select("articulo_id, marca_nombre")
      .eq("empresa_key", EMPRESA).order("articulo_id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    const lote = data ?? [];
    for (const r of lote) if (r.marca_nombre) conMarca.add(r.articulo_id as number);
    if (lote.length < 1000) break;
  }
  const vendidos = [...ventas.keys()];
  const cubiertos = vendidos.filter(id => conMarca.has(id));
  const totalUSD = vendidos.reduce((s, id) => s + (ventas.get(id) ?? 0), 0);
  const cubUSD = cubiertos.reduce((s, id) => s + (ventas.get(id) ?? 0), 0);
  console.log(`ventana ${desde} → ${hasta} · ${filas} filas de switch_articulo_diario`);
  console.log(`artículos vendidos distintos: ${vendidos.length}`);
  console.log(`con marca en el diccionario: ${cubiertos.length} (${((cubiertos.length / vendidos.length) * 100).toFixed(1)}%)`);
  console.log(`venta cubierta: $${cubUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} de $${totalUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${((cubUSD / totalUSD) * 100).toFixed(1)}%)`);
}

async function main() {
  if (FASE === "a") await faseA();
  else if (FASE === "c") await faseC();
  else if (FASE === "d") await faseD();
  else if (FASE === "e") await faseE();
  else { await faseA(); await faseC(); await faseD(); }
}
main().catch(e => { console.error(e); process.exit(1); });

// ── E. ¿DÓNDE aparecen los ids repetidos del catálogo? ──────────────────────
// Vuelve a barrer y guarda (posición, página, id) para ubicar el primer choque
// dentro de los lotes de 500 del upsert. READ-ONLY.
export async function faseE() {
  const { createSwitchClient, logoutAllSwitchSessions } = await import("../src/lib/switch-api/client");
  const cli = createSwitchClient(EMPRESA);
  const filas: { pos: number; pag: number; id: number; codigo: string; marcaId: number | null }[] = [];
  try {
    for (let p = 1; p <= 400; p++) {
      const r = await cli.getArticulos({ porPagina: 50, paginaActual: p });
      const lote = r?.articulos ?? [];
      if (lote.length === 0) break;
      for (const a of lote) filas.push({ pos: filas.length, pag: p, id: a.id, codigo: a.codigo, marcaId: a.marcaId ?? null });
    }
  } finally { await logoutAllSwitchSessions(); }

  const conMarca = filas.filter(f => f.marcaId != null);
  console.log(`barrido: ${filas.length} renglones · ${new Set(filas.map(f => f.id)).size} ids distintos · con marcaId: ${conMarca.length}`);

  // El upsert arma `filas` (solo con marcaId) y las manda en lotes de 500.
  const visto = new Map<number, number>();
  let primerChoque: { lote: number; pos: number; id: number; antes: number } | null = null;
  const choquesPorLote = new Map<number, number>();
  for (let i = 0; i < conMarca.length; i++) {
    const lote = Math.floor(i / 500) + 1;
    const id = conMarca[i].id;
    const anterior = visto.get(id);
    if (anterior !== undefined && Math.floor(anterior / 500) === Math.floor(i / 500)) {
      choquesPorLote.set(lote, (choquesPorLote.get(lote) ?? 0) + 1);
      if (!primerChoque) primerChoque = { lote, pos: i, id, antes: anterior };
    }
    visto.set(id, i);
  }
  console.log(`lotes de 500 del upsert: ${Math.ceil(conMarca.length / 500)}`);
  console.log(`primer lote con un id REPETIDO DENTRO del mismo lote: ${primerChoque ? `lote ${primerChoque.lote} (renglón ${primerChoque.pos}, id ${primerChoque.id}, ya visto en ${primerChoque.antes})` : "ninguno"}`);
  console.log(`choques por lote: ${[...choquesPorLote.entries()].map(([l, n]) => `L${l}=${n}`).join(" ")}`);

  const repes = [...new Map<number, number>(
    conMarca.reduce((m, f) => m.set(f.id, (m.get(f.id) ?? 0) + 1), new Map<number, number>()),
  ).entries()].filter(([, n]) => n > 1);
  console.log(`ids repetidos en TODO el barrido: ${repes.length}`);
  for (const [id] of repes.slice(0, 5)) {
    const donde = conMarca.filter(f => f.id === id).map(f => `pág ${f.pag}/pos ${f.pos}`);
    console.log(`   id ${id} (${conMarca.find(f => f.id === id)!.codigo}) → ${donde.join(" · ")}`);
  }
  fs.writeFileSync("/tmp/catalogo-ac.json", JSON.stringify(filas));
  console.log("(dump en /tmp/catalogo-ac.json)");
}
