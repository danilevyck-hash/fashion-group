/**
 * Diagnóstico READ-ONLY del mayor contable contra producción.
 *
 * Responde tres preguntas antes de tocar Vista General:
 *   1. ¿Qué empresas/meses tiene `mayor_lineas`?
 *   2. ¿Cuál es el último mes CERRADO de cada empresa?
 *   3. ¿Cuánto da el gasto (grupo 6, débito − crédito) de ese mes?
 *
 * Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-mayor-vista-general.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const esCierre = (desc: string, mes: string) => {
  const m = /^ASIENTO\b.*?(\d{4}-\d{2})$/i.exec(desc.trim().replace(/\s+/g, " "));
  return m !== null && m[1] === mes;
};

async function main() {
  const { count, error: e0 } = await db
    .from("mayor_lineas")
    .select("id", { count: "exact", head: true });
  if (e0) {
    console.log("mayor_lineas NO accesible:", e0.code, e0.message);
    return;
  }
  console.log(`mayor_lineas: ${count} filas`);

  // Importaciones (coberturas)
  const { data: imps } = await db
    .from("mayor_importaciones")
    .select("empresa_key, rango_desde, rango_hasta, lineas_total, lineas_gasto, origen")
    .order("empresa_key");
  console.log(`\nmayor_importaciones: ${imps?.length ?? 0} filas`);
  for (const i of imps ?? []) {
    console.log(
      `  ${i.empresa_key.padEnd(20)} ${i.rango_desde} → ${i.rango_hasta}  ${i.lineas_total} líneas (${i.lineas_gasto} gasto) [${i.origen}]`,
    );
  }

  // Asientos de cierre → último mes cerrado por empresa
  const cierres = new Map<string, string>();
  let desde = 0;
  for (;;) {
    const { data, error } = await db
      .from("mayor_lineas")
      .select("empresa_key, mes, descripcion")
      .ilike("descripcion", "ASIENTO%")
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const bucket = String(r.mes).slice(0, 7);
      if (!esCierre(r.descripcion ?? "", bucket)) continue;
      const prev = cierres.get(r.empresa_key);
      if (!prev || bucket > prev) cierres.set(r.empresa_key, bucket);
    }
    if (!data || data.length < 1000) break;
    desde += 1000;
  }
  console.log("\nÚltimo mes CERRADO por empresa:");
  for (const [k, v] of [...cierres.entries()].sort()) console.log(`  ${k.padEnd(20)} ${v}`);

  // Gasto del último mes cerrado de cada empresa (grupo 6, débito − crédito)
  console.log("\nGasto del último mes cerrado (grupo 6, débito − crédito):");
  for (const [empresa, mes] of [...cierres.entries()].sort()) {
    let cent = 0;
    let filas = 0;
    let off = 0;
    for (;;) {
      const { data, error } = await db
        .from("mayor_lineas")
        .select("debito, credito, cuenta")
        .eq("empresa_key", empresa)
        .eq("mes", `${mes}-01`)
        .like("cuenta", "6.%")
        .order("id")
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        cent += Math.round(Number(r.debito) * 100) - Math.round(Number(r.credito) * 100);
        filas++;
      }
      if (!data || data.length < 1000) break;
      off += 1000;
    }
    console.log(
      `  ${empresa.padEnd(20)} ${mes}  $${(cent / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}  (${filas} líneas)`,
    );
  }

  // Meses distintos por empresa
  console.log("\nMeses presentes por empresa (todos, cerrados o no):");
  const meses = new Map<string, Set<string>>();
  let off2 = 0;
  for (;;) {
    const { data, error } = await db
      .from("mayor_lineas")
      .select("empresa_key, mes")
      .order("id")
      .range(off2, off2 + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const s = meses.get(r.empresa_key) ?? new Set<string>();
      s.add(String(r.mes).slice(0, 7));
      meses.set(r.empresa_key, s);
    }
    if (!data || data.length < 1000) break;
    off2 += 1000;
  }
  for (const [k, v] of [...meses.entries()].sort()) {
    console.log(`  ${k.padEnd(20)} ${[...v].sort().join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
