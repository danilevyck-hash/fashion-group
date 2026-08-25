// ¿POR QUÉ LA LISTA DE CLIENTES PUEDE SUMAR MÁS QUE LA FILA?
//
// Medición del sobrepaso: un CÓDIGO puede estar bajo MÁS DE UNA descripción en
// switch_articulo_diario. La fila suma solo las filas de SU descripción; la
// lista de clientes trae TODAS las líneas de esos códigos. Cuando un código
// vive en dos descripciones, la lista se lleva de más lo que la otra fila ya
// contó — y al revés, esa otra fila queda corta.
//
// Solo lectura.  node scripts/_diag-productos-clientes-sobrepaso.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = {};
for (const l of readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signo = (t) => (t === "Nota de Crédito" ? -1 : 1);
async function pag(t, b) {
  const o = []; let e = null;
  for (let p = 0; p < 200; p++) {
    const { data, error, count } = await b(p === 0, p * 1000, p * 1000 + 999);
    if (error) throw new Error(t + ": " + error.message);
    if (p === 0) e = count;
    o.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    if (e != null && o.length >= e) break;
  }
  return o;
}

for (const [EMP, DESDE, HASTA] of [
  ["vistana", "2026-01-01", "2026-08-24"],
  ["fashion_shoes", "2025-09-01", "2026-08-24"],
  ["active_shoes", "2025-09-01", "2026-08-24"],
]) {
  const { data: n1 } = await sb.rpc("switch_top_descripciones", { p_empresa_key: EMP, p_desde: DESDE, p_hasta: HASTA });
  const ad = await pag("ad", (c, d, h) => sb.from("switch_articulo_diario")
    .select("tipo, descripcion, codigo, cantidad_total, venta_total", c ? { count: "exact" } : {})
    .eq("empresa_key", EMP).gte("fecha", DESDE).lte("fecha", HASTA).order("id").range(d, h));

  // ¿cuántos códigos viven en más de una descripción?
  const descsDeCodigo = new Map();
  for (const r of ad) {
    if (!r.codigo) continue;
    const s = descsDeCodigo.get(r.codigo) ?? new Set();
    s.add(r.descripcion ?? "(sin descripcion)");
    descsDeCodigo.set(r.codigo, s);
  }
  const multi = [...descsDeCodigo.entries()].filter(([, s]) => s.size > 1);

  const lin = await pag("lin", (c, d, h) => sb.from("switch_factura_lineas")
    .select("tipo_comprobante, codigo, cantidad, subtotal_con_descuento", c ? { count: "exact" } : {})
    .eq("empresa_key", EMP).gte("fecha", `${DESDE}T00:00:00-05:00`).lt("fecha", `${HASTA}T23:59:59-05:00`).order("id").range(d, h));

  // cobertura por descripción usando el cruce por código (como la pantalla)
  const codsPorDesc = new Map();
  for (const r of ad) {
    if (!r.codigo) continue;
    const dsc = r.descripcion ?? "(sin descripcion)";
    const s = codsPorDesc.get(dsc) ?? new Set();
    s.add(r.codigo);
    codsPorDesc.set(dsc, s);
  }
  const vPorCodigo = new Map();
  for (const l of lin) {
    if (!l.codigo) continue;
    vPorCodigo.set(l.codigo, (vPorCodigo.get(l.codigo) ?? 0) + signo(l.tipo_comprobante) * Number(l.subtotal_con_descuento));
  }

  let sobre = 0, corto = 0, ok = 0, vacias = 0;
  const peores = [];
  for (const p of n1) {
    const cods = codsPorDesc.get(p.descripcion) ?? new Set();
    let v = 0;
    for (const c of cods) v += vPorCodigo.get(c) ?? 0;
    const pct = Number(p.venta) > 0 ? v / Number(p.venta) * 100 : null;
    if (v === 0) vacias++;
    else if (pct > 101) { sobre++; peores.push({ d: p.descripcion, a: Number(p.venta), b: v, pct }); }
    else if (pct < 95) corto++;
    else ok++;
  }
  console.log(`\n=== ${EMP} (${DESDE} → ${HASTA}) ===`);
  console.log(`  códigos en MÁS DE UNA descripción: ${multi.length} de ${descsDeCodigo.size} (${(multi.length / descsDeCodigo.size * 100).toFixed(2)}%)`);
  console.log(`  descripciones: ${n1.length} · dentro de 95-101%: ${ok} · SOBREPASAN 101%: ${sobre} · por debajo de 95%: ${corto} · sin clientes: ${vacias}`);
  for (const x of peores.sort((a, b) => b.pct - a.pct).slice(0, 5)) {
    console.log(`     ${String(x.d).slice(0, 36).padEnd(36)} fila $${x.a.toFixed(2).padStart(11)}  lista $${x.b.toFixed(2).padStart(11)}  ${x.pct.toFixed(1)}%`);
  }
  if (multi.length) {
    console.log(`  ejemplos de código con dos descripciones:`);
    for (const [c, s] of multi.slice(0, 3)) console.log(`     ${c}: ${[...s].join("  |  ")}`);
  }
}
