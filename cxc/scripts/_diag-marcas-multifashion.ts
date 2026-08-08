/**
 * DIAGNÓSTICO READ-ONLY de las MARCAS de Multifashion (american_classic).
 *
 * NO ESCRIBE NADA. Mide, contra producción, lo que hace falta para el filtro de
 * marca de "Multifashion › Productos":
 *
 *   1. El catálogo REAL de `switch_articulo_marca`: qué nombres distintos hay
 *      (los "departamentos" de Switch: TH MENSWEAR, CK JEANS, …).
 *   2. La venta / utilidad de 12 meses agrupada por ese nombre.
 *   3. La misma venta agrupada por GRUPO DE MARCA (el mapa de prefijos).
 *   4. Cuánta venta queda sin entrada en el diccionario ("sin marca").
 *   5. Cardinalidades y PESO del payload que agregaría el filtro.
 *   6. Si los montos de la tabla tienen más de 2 decimales (rounding).
 *
 *   npx tsx scripts/_diag-marcas-multifashion.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { agregarRanking, rango12Meses, type FilaArticuloDiario } from "../src/lib/multifashion/productos-ranking";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EMPRESA = "american_classic";

const PREFIJOS: Record<string, string> = {
  TH: "Tommy Hilfiger",
  CK: "Calvin Klein",
  KL: "Karl Lagerfeld",
  RBK: "Reebok",
  JOYBEES: "Joybees",
};

const EQUIV: Record<string, string> = {
  "TH ACCESORIES": "TH ACCESSORIES",
  "TH MEN": "TH MENSWEAR",
  "TH OTHERS": "TH OTHER",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

async function paginar<T>(tabla: string, sel: string, orden: string, extra: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const paso = 1000;
  for (let ini = 0; ; ini += paso) {
    const q = extra(db.from(tabla).select(sel)).order(orden, { ascending: true }).range(ini, ini + paso - 1);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < paso) break;
  }
  return out;
}

async function main() {
  const ahora = new Date();
  const v = rango12Meses(ahora);
  console.log(`Ventana de 12 meses (rango12Meses): ${v.desde} → ${v.hasta}\n`);

  const filas = await paginar<FilaArticuloDiario & { fecha: string }>(
    "switch_articulo_diario",
    "id, articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total",
    "id",
    q => q.eq("empresa_key", EMPRESA).gte("fecha", v.desde).lte("fecha", v.hasta),
  );
  console.log(`filas leídas: ${filas.length}`);

  const dicc = await paginar<{ articulo_id: number; marca_id: number | null; marca_nombre: string | null }>(
    "switch_articulo_marca",
    "articulo_id, marca_id, marca_nombre",
    "articulo_id",
    q => q.eq("empresa_key", EMPRESA),
  );
  console.log(`diccionario: ${dicc.length} artículos`);

  const marcaDe = new Map<number, string>();
  for (const d of dicc) marcaDe.set(d.articulo_id, (d.marca_nombre ?? "").trim());
  const nombres = new Set([...marcaDe.values()].filter(Boolean));
  console.log(`nombres distintos en el diccionario: ${nombres.size}\n`);

  // ── 2. Por nombre de Switch (departamento) ────────────────────────────────
  const global = agregarRanking(filas, "categoria");
  console.log(`TOTAL 12m — venta ${fmt(global.totales.venta)} · costo ${fmt(global.totales.costo)} · utilidad ${fmt(global.totales.utilidad)} · margen ${pct(global.totales.margen)} · unidades ${global.totales.unidades}\n`);

  const porNombre = new Map<string, FilaArticuloDiario[]>();
  const SIN = "(sin entrada en el diccionario)";
  for (const f of filas) {
    const n = marcaDe.get(f.articulo_id) || SIN;
    const arr = porNombre.get(n);
    if (arr) arr.push(f);
    else porNombre.set(n, [f]);
  }

  console.log("── Departamentos de Switch (lo que Switch llama 'marca') ─────────");
  const filasNombre = [...porNombre.entries()]
    .map(([n, fs2]) => ({ n, r: agregarRanking(fs2, "categoria").totales }))
    .sort((a, b) => b.r.venta - a.r.venta);
  for (const x of filasNombre) {
    console.log(`${x.n.padEnd(28)} venta ${fmt(x.r.venta).padStart(13)}  util ${fmt(x.r.utilidad).padStart(12)}  margen ${pct(x.r.margen).padStart(7)}  u ${x.r.unidades}`);
  }
  console.log(`\n(${filasNombre.length} nombres con ventas)\n`);

  // ── 3. Por GRUPO DE MARCA ─────────────────────────────────────────────────
  const grupoDe = (nombre: string): string => {
    const canon = EQUIV[nombre.toUpperCase()] ?? nombre.toUpperCase();
    const primera = canon.split(/\s+/)[0] ?? "";
    return PREFIJOS[primera] ? primera : "OTROS";
  };

  const porGrupo = new Map<string, FilaArticuloDiario[]>();
  for (const f of filas) {
    const n = marcaDe.get(f.articulo_id) || "";
    const g = n ? grupoDe(n) : "OTROS";
    const arr = porGrupo.get(g);
    if (arr) arr.push(f);
    else porGrupo.set(g, [f]);
  }

  console.log("── GRUPOS DE MARCA (la tabla de control) ─────────────────────────");
  const filasGrupo = [...porGrupo.entries()]
    .map(([g, fs2]) => ({ g, r: agregarRanking(fs2, "categoria").totales }))
    .sort((a, b) => b.r.venta - a.r.venta);
  let sumaVenta = 0;
  for (const x of filasGrupo) {
    sumaVenta += x.r.venta;
    const share = global.totales.venta > 0 ? x.r.venta / global.totales.venta : null;
    console.log(`${(PREFIJOS[x.g] ?? "Otros").padEnd(18)} venta ${fmt(x.r.venta).padStart(13)}  ${pct(share).padStart(7)}  margen ${pct(x.r.margen).padStart(7)}  util ${fmt(x.r.utilidad).padStart(12)}`);
  }
  console.log(`suma de grupos: ${fmt(sumaVenta)}  vs total ${fmt(global.totales.venta)}  → diff ${fmt(sumaVenta - global.totales.venta)}\n`);

  // ── 4. Sin entrada en el diccionario ──────────────────────────────────────
  const sinFilas = porNombre.get(SIN) ?? [];
  if (sinFilas.length) {
    const r = agregarRanking(sinFilas, "categoria").totales;
    console.log(`SIN entrada en el diccionario: ${sinFilas.length} filas · venta ${fmt(r.venta)} (${pct(r.venta / global.totales.venta)})\n`);
  } else {
    console.log("SIN entrada en el diccionario: 0 filas\n");
  }

  // ── 5. Cardinalidades y peso del payload ──────────────────────────────────
  const globalCod = agregarRanking(filas, "codigo");
  console.log("── Cardinalidades ────────────────────────────────────────────────");
  console.log(`categorías (global): ${global.filas.length} · códigos (global): ${globalCod.filas.length}`);

  let partCat = 0, partCod = 0;
  const codigosPorGrupo = new Map<string, Set<string>>();
  for (const [g, fs2] of porGrupo) {
    const c = agregarRanking(fs2, "categoria");
    const k = agregarRanking(fs2, "codigo");
    partCat += c.filas.length;
    partCod += k.filas.length;
    codigosPorGrupo.set(g, new Set(k.filas.map(f => f.clave)));
  }
  console.log(`categorías particionadas: ${partCat} · códigos particionados: ${partCod}`);

  // ¿Hay códigos que caen en más de un grupo?
  const cuenta = new Map<string, number>();
  for (const set of codigosPorGrupo.values()) for (const c of set) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  const multi = [...cuenta.entries()].filter(([, n]) => n > 1);
  console.log(`códigos en MÁS DE UN grupo: ${multi.length}${multi.length ? ` → ${multi.slice(0, 5).map(m => m[0]).join(", ")}` : ""}`);

  // Peso: payload actual vs el que agrega el filtro (filas livianas)
  const actual = JSON.stringify({ categorias: global.filas, codigos: globalCod.filas });
  const ligeras: unknown[] = [];
  for (const [g, fs2] of porGrupo) {
    for (const f of agregarRanking(fs2, "categoria").filas) ligeras.push({ g, c: f.clave, u: f.unidades, v: f.venta, k: f.costo, a: f.articulos });
    for (const f of agregarRanking(fs2, "codigo").filas) ligeras.push({ g, c: f.clave, u: f.unidades, v: f.venta, k: f.costo, a: f.articulos });
  }
  const extra = JSON.stringify(ligeras);
  console.log(`payload actual (2 arreglos): ${(actual.length / 1024).toFixed(0)} KB crudo`);
  console.log(`payload extra (particiones livianas): ${(extra.length / 1024).toFixed(0)} KB crudo → +${((extra.length / actual.length) * 100).toFixed(0)}%\n`);

  // ── 6. Decimales de los montos ────────────────────────────────────────────
  let masDe2 = 0, masDe4u = 0;
  for (const f of filas) {
    for (const c of [f.venta_total, f.costo_total]) {
      const s = String(c ?? "");
      const dec = s.includes(".") ? s.split(".")[1].replace(/0+$/, "").length : 0;
      if (dec > 2) masDe2++;
    }
    const su = String(f.cantidad_total ?? "");
    const du = su.includes(".") ? su.split(".")[1].replace(/0+$/, "").length : 0;
    if (du > 4) masDe4u++;
  }
  console.log(`montos con más de 2 decimales: ${masDe2} de ${filas.length * 2} · unidades con más de 4: ${masDe4u}`);
}

main().catch(e => { console.error(e); process.exit(1); });
