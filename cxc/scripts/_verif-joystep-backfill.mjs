/**
 * SOLO LECTURA. Foto de las 8 empresas para comparar ANTES vs DESPUÉS del
 * backfill de joystep. No toca Switch: lee nuestra base.
 *
 *   node scripts/_verif-joystep-backfill.mjs antes|despues
 *
 * Guarda el resultado en /tmp/_joystep-<etiqueta>.json y, cuando corre como
 * "despues", imprime el diff contra "antes" — la prueba de que no se movió ni un
 * número de las otras 7 empresas.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const EMPRESAS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
  "american_classic",
];
const JUL_INI = "2026-07-01";
const JUL_FIN = "2026-08-01";
const f2 = (n) => Number(n).toFixed(2);

/** Lee TODO con paginación (db-max-rows = 1000 corta en silencio). */
async function todo(tabla, cols, filtros) {
  const out = [];
  let esperadas = null;
  for (let p = 0; p < 200; p++) {
    let q = sb.from(tabla).select(cols, p === 0 ? { count: "exact" } : {});
    q = filtros(q);
    const { data, error, count } = await q.order("id", { ascending: true }).range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    if (esperadas != null && out.length >= esperadas) break;
  }
  if (esperadas != null && out.length !== esperadas) {
    throw new Error(`${tabla}: lectura incompleta (${out.length} vs ${esperadas})`);
  }
  return out;
}

async function foto() {
  const r = {};
  for (const e of EMPRESAS) {
    // Recibos de julio 2026 (fecha es date YYYY-MM-DD en switch_recibos).
    const recJul = await todo("switch_recibos", "id,fecha,total,cliente_codigo", (q) =>
      q.eq("empresa_key", e).gte("fecha", JUL_INI).lt("fecha", JUL_FIN),
    );
    const { count: recTotal } = await sb
      .from("switch_recibos")
      .select("*", { count: "exact", head: true })
      .eq("empresa_key", e);
    // Ventas de julio 2026 (borde de mes en hora Panamá, UTC-5).
    const fac = await todo("switch_facturas", "id,tipo_comprobante,subtotal_descuento", (q) =>
      q.eq("empresa_key", e).gte("fecha", `${JUL_INI}T05:00:00Z`).lt("fecha", `${JUL_FIN}T05:00:00Z`),
    );
    const ventas = fac.reduce((a, f) => {
      const s = Number(f.subtotal_descuento) || 0;
      return a + (/cr[eé]dito/i.test(f.tipo_comprobante || "") ? -Math.abs(s) : s);
    }, 0);
    // Cartera abierta.
    // Firma de signo: la misma de switch_estadocuenta_aging_mv.
    const RESTAN = new Set(["Nota de Crédito", "Recibo", "Recibo Saldo Anterior"]);
    const ec = await todo("switch_estadocuenta", "id,tipo_comprobante,saldo", (q) =>
      q.eq("empresa_key", e).neq("saldo", 0),
    );
    const cartera = ec.reduce((a, d) => {
      const s = Number(d.saldo) || 0;
      return a + (RESTAN.has(d.tipo_comprobante) ? -Math.abs(s) : Math.abs(s));
    }, 0);
    const { count: util } = await sb
      .from("switch_factura_utilidad")
      .select("*", { count: "exact", head: true })
      .eq("empresa_key", e);
    const { count: ultPago } = await sb
      .from("switch_ultimo_pago_cliente_v2")
      .select("*", { count: "exact", head: true })
      .eq("empresa_key", e);
    const { data: com } = await sb.rpc("comision_b2b_v5", { p_empresa_key: e, p_year: 2026, p_mes: 7 });

    r[e] = {
      recibos_total_filas: recTotal,
      recibos_julio_n: recJul.length,
      recibos_julio_monto: Number(recJul.reduce((a, x) => a + (Number(x.total) || 0), 0).toFixed(2)),
      ventas_julio: Number(ventas.toFixed(2)),
      cartera_abierta: Number(cartera.toFixed(2)),
      cartera_docs: ec.length,
      utilidad_filas: util,
      clientes_con_ultimo_pago: ultPago,
      comision_julio: com ?? null,
    };
  }
  return r;
}

const etiqueta = process.argv[2] === "despues" ? "despues" : "antes";
const f = await foto();
fs.writeFileSync(`/tmp/_joystep-${etiqueta}.json`, JSON.stringify(f, null, 2));

console.log(`FOTO "${etiqueta}" — ${new Date().toISOString()}\n`);
console.log(
  "empresa".padEnd(22) +
    "recibos".padStart(9) +
    "jul n".padStart(7) +
    "jul $".padStart(13) +
    "ventas jul".padStart(13) +
    "cartera".padStart(14) +
    "util".padStart(6) +
    "últ.pago".padStart(10),
);
for (const e of EMPRESAS) {
  const x = f[e];
  console.log(
    e.padEnd(22) +
      String(x.recibos_total_filas).padStart(9) +
      String(x.recibos_julio_n).padStart(7) +
      f2(x.recibos_julio_monto).padStart(13) +
      f2(x.ventas_julio).padStart(13) +
      f2(x.cartera_abierta).padStart(14) +
      String(x.utilidad_filas).padStart(6) +
      String(x.clientes_con_ultimo_pago).padStart(10),
  );
}

console.log("\nComisión julio 2026 (total por empresa):");
for (const e of EMPRESAS) {
  const v = f[e].comision_julio?.vendedores;
  if (!Array.isArray(v) || v.length === 0) {
    console.log(`  ${e.padEnd(22)} 0 vendedores / $0.00`);
    continue;
  }
  const tot = v.reduce((a, x) => a + (Number(x.comision_total) || 0), 0);
  const cob = v.reduce((a, x) => a + (Number(x.comision_cobro) || 0), 0);
  console.log(`  ${e.padEnd(22)} ${v.length} vendedor(es)  total ${f2(tot)}  (de cobro ${f2(cob)})`);
}

if (etiqueta === "despues" && fs.existsSync("/tmp/_joystep-antes.json")) {
  const antes = JSON.parse(fs.readFileSync("/tmp/_joystep-antes.json", "utf8"));
  console.log("\n=== DIFF antes → después ===");
  let sinCambios = [];
  for (const e of EMPRESAS) {
    const difs = [];
    for (const k of Object.keys(f[e])) {
      if (k === "comision_julio") {
        const a = JSON.stringify(antes[e][k]);
        const b = JSON.stringify(f[e][k]);
        if (a !== b) difs.push(`${k}: cambió`);
        continue;
      }
      if (antes[e][k] !== f[e][k]) difs.push(`${k}: ${antes[e][k]} → ${f[e][k]}`);
    }
    if (difs.length === 0) sinCambios.push(e);
    else console.log(`${e}:\n  ` + difs.join("\n  "));
  }
  console.log(`\nSIN NINGÚN CAMBIO (${sinCambios.length}): ${sinCambios.join(", ")}`);
}
