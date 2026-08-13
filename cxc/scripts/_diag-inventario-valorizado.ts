/**
 * Diagnóstico READ-ONLY del inventario valorizado (`switch_articulo_info`).
 *
 * No escribe nada. Pagina la tabla entera (db-max-rows = 1000 corta en
 * silencio) y mide, por empresa: unidades, valor al costo, valor a precio de
 * etiqueta, cuántos artículos tienen existencia sin costo, y la frescura.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-inventario-valorizado.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

interface Fila {
  empresa_key: string;
  codigo: string;
  existencia: number | string | null;
  costo_api: number | string | null;
  precio_etiqueta: number | string | null;
  synced_at: string;
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};

async function main() {
  const PAGE = 1000;
  const filas: Fila[] = [];
  let desde = 0;
  let total: number | null = null;
  for (;;) {
    const q = db
      .from("switch_articulo_info")
      .select("empresa_key, codigo, existencia, costo_api, precio_etiqueta, synced_at",
        desde === 0 ? { count: "exact" } : {})
      .order("empresa_key", { ascending: true })
      .order("codigo", { ascending: true })
      .range(desde, desde + PAGE - 1);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    if (desde === 0) total = count ?? null;
    const lote = (data ?? []) as Fila[];
    filas.push(...lote);
    if (lote.length < PAGE) break;
    desde += PAGE;
    if (desde > 200_000) throw new Error("cota de seguridad");
  }
  console.log(`filas leídas: ${filas.length} · count exacto: ${total}`);
  if (total !== null && total !== filas.length) {
    console.log("🔴 TRUNCADO: lo leído no cuadra con el count");
  }

  interface Acc {
    articulos: number;
    conStock: number;
    unidades: number;
    costo: number;
    precio: number;
    sinCosto: number;
    sinCostoUnidades: number;
    sinPrecio: number;
    unidadesNeg: number;
    maxSynced: string;
    minSynced: string;
  }
  const por = new Map<string, Acc>();
  for (const f of filas) {
    const a = por.get(f.empresa_key) ?? {
      articulos: 0, conStock: 0, unidades: 0, costo: 0, precio: 0,
      sinCosto: 0, sinCostoUnidades: 0, sinPrecio: 0, unidadesNeg: 0,
      maxSynced: "", minSynced: "",
    };
    a.articulos += 1;
    const e = n(f.existencia);
    const c = n(f.costo_api);
    const p = n(f.precio_etiqueta);
    if (e !== null && e > 0) {
      a.conStock += 1;
      a.unidades += e;
      if (c !== null) a.costo += e * c;
      else { a.sinCosto += 1; a.sinCostoUnidades += e; }
      if (p !== null) a.precio += e * p;
      else a.sinPrecio += 1;
    } else if (e !== null && e < 0) {
      a.unidadesNeg += e;
    }
    const s = String(f.synced_at);
    if (!a.maxSynced || s > a.maxSynced) a.maxSynced = s;
    if (!a.minSynced || s < a.minSynced) a.minSynced = s;
    por.set(f.empresa_key, a);
  }

  const fmt = (x: number) => x.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let tU = 0, tC = 0, tP = 0, tSin = 0, tSinU = 0;
  console.log("\nempresa           artíc  conStock   unidades          al costo           a precio  sinCosto");
  for (const [k, a] of [...por.entries()].sort((x, y) => y[1].costo - x[1].costo)) {
    tU += a.unidades; tC += a.costo; tP += a.precio; tSin += a.sinCosto; tSinU += a.sinCostoUnidades;
    console.log(
      `${k.padEnd(18)}${String(a.articulos).padStart(5)}${String(a.conStock).padStart(10)}` +
      `${fmt(a.unidades).padStart(12)}${fmt(a.costo).padStart(18)}${fmt(a.precio).padStart(19)}` +
      `${String(a.sinCosto).padStart(10)} (${fmt(a.sinCostoUnidades)} u)`
    );
    console.log(`   synced: ${a.minSynced} → ${a.maxSynced}   negativas: ${fmt(a.unidadesNeg)}`);
  }
  console.log(`${"TOTAL".padEnd(33)}${fmt(tU).padStart(12)}${fmt(tC).padStart(18)}${fmt(tP).padStart(19)}${String(tSin).padStart(10)} (${fmt(tSinU)} u)`);

  const faltan = ["confecciones_boston", "american_classic"].filter((k) => !por.has(k));
  console.log(`\nempresas SIN una sola fila en la tabla: ${faltan.join(", ") || "(ninguna)"}`);

  // Detalle de los que tienen stock y no tienen costo
  const sinCosto = filas.filter((f) => {
    const e = n(f.existencia); return e !== null && e > 0 && n(f.costo_api) === null;
  });
  console.log(`\nartículos con stock y SIN costo: ${sinCosto.length}`);
  for (const f of sinCosto.slice(0, 20)) {
    console.log(`   ${f.empresa_key} · ${f.codigo} · ${f.existencia} u · precio ${f.precio_etiqueta ?? "—"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
