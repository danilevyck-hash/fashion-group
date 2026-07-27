/**
 * SOLO LECTURA. Cotejo recibo por recibo de joystep: lo que dice SWITCH contra
 * lo que quedó en nuestra base tras el backfill.
 *
 *   node scripts/_verif-joystep-vs-switch.mjs
 *
 * La fuente Switch es /tmp/_dryrun-joystep-recibos.json, capturado del API ANTES
 * de escribir nada — o sea, no es "mi propia escritura leída de vuelta".
 *
 * Como el endpoint de Switch NO devuelve id de recibo, el cotejo es por
 * MULTICONJUNTO de la terna (fechaCreacion, clienteId, total) — la misma llave
 * natural con la que se certificó el PR #315 hoy.
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

const FUENTE = process.argv[2] ?? "/tmp/_dryrun-joystep-recibos.json";
const f2 = (n) => Number(n).toFixed(2);
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ── Lado Switch ──────────────────────────────────────────────────────────────
const switchRows = JSON.parse(fs.readFileSync(FUENTE, "utf8"));
const llaveSwitch = (r) =>
  `${String(r.fechaCreacion ?? "").replace(" ", "T")}|${r.clienteId ?? ""}|${num(r.total).toFixed(4)}`;

// ── Lado nuestro (paginado: db-max-rows corta en 1000 sin avisar) ────────────
const nuestras = [];
let esperadas = null;
for (let p = 0; p < 200; p++) {
  const { data, error, count } = await sb
    .from("switch_recibos")
    .select("id,fecha,fecha_creacion,cliente_switch_id,total,es_retencion,vendedor_cartera", p === 0 ? { count: "exact" } : {})
    .eq("empresa_key", "joystep")
    .order("id", { ascending: true })
    .range(p * 1000, p * 1000 + 999);
  if (error) throw new Error(error.message);
  if (p === 0) esperadas = count;
  nuestras.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
  if (esperadas != null && nuestras.length >= esperadas) break;
}
if (nuestras.length !== esperadas) throw new Error(`lectura incompleta: ${nuestras.length} vs ${esperadas}`);

const llaveDb = (r) =>
  `${String(r.fecha_creacion ?? "").replace(" ", "T").slice(0, 19)}|${r.cliente_switch_id ?? ""}|${Number(r.total).toFixed(4)}`;

// ── Multiconjuntos ───────────────────────────────────────────────────────────
const bolsa = (rows, k) => {
  const m = new Map();
  for (const r of rows) m.set(k(r), (m.get(k(r)) ?? 0) + 1);
  return m;
};
const bs = bolsa(switchRows, llaveSwitch);
const bd = bolsa(nuestras, llaveDb);

const faltan = [];
const sobran = [];
for (const [k, n] of bs) {
  const d = (bd.get(k) ?? 0) - n;
  if (d < 0) faltan.push(`${k} ×${-d}`);
}
for (const [k, n] of bd) {
  const d = n - (bs.get(k) ?? 0);
  if (d > 0) sobran.push(`${k} ×${d}`);
}

const totSwitch = switchRows.reduce((a, r) => a + num(r.total), 0);
const totDb = nuestras.reduce((a, r) => a + Number(r.total), 0);

console.log("=== JOYSTEP: SWITCH contra NUESTRA BASE (recibo por recibo) ===");
console.log(`Fuente Switch: ${FUENTE}`);
console.log(`Switch:        ${switchRows.length} recibos · ${f2(totSwitch)}`);
console.log(`Nuestra base:  ${nuestras.length} recibos · ${f2(totDb)}`);
console.log(`Diferencia:    ${f2(totDb - totSwitch)}`);
console.log(`FALTAN en la base: ${faltan.length}${faltan.length ? "\n  " + faltan.join("\n  ") : ""}`);
console.log(`SOBRAN en la base: ${sobran.length}${sobran.length ? "\n  " + sobran.join("\n  ") : ""}`);

// ── Duplicados exactos dentro de nuestra base ───────────────────────────────
const dups = [...bd.entries()].filter(([, n]) => n > 1);
const dupsSwitch = [...bs.entries()].filter(([, n]) => n > 1);
console.log(`\nDuplicados en nuestra base: ${dups.length} llave(s)${dups.length ? " → " + dups.map(([k, n]) => `${k} ×${n}`).join(", ") : ""}`);
console.log(`(Switch mismo tiene ${dupsSwitch.length} llave(s) repetida(s): ${dupsSwitch.map(([k, n]) => `${k} ×${n}`).join(", ") || "ninguna"})`);

// ── Julio 2026 aparte ───────────────────────────────────────────────────────
const julS = switchRows.filter((r) => String(r.fechaCreacion ?? "").startsWith("2026-07"));
const julD = nuestras.filter((r) => String(r.fecha ?? "").startsWith("2026-07"));
console.log(
  `\nJulio 2026 — Switch: ${julS.length} / ${f2(julS.reduce((a, r) => a + num(r.total), 0))}` +
    ` · base: ${julD.length} / ${f2(julD.reduce((a, r) => a + Number(r.total), 0))}`,
);

// ── Retenciones y atribución ────────────────────────────────────────────────
const ret = nuestras.filter((r) => r.es_retencion);
console.log(`\nMarcados como retención de ITBMS: ${ret.length} (${f2(ret.reduce((a, r) => a + Number(r.total), 0))})`);
const porVend = new Map();
for (const r of nuestras) porVend.set(r.vendedor_cartera ?? "(vacío)", (porVend.get(r.vendedor_cartera ?? "(vacío)") ?? 0) + 1);
console.log("Atribución por vendedor:", [...porVend.entries()].map(([k, v]) => `${k}=${v}`).join(" · "));

// ── Último pago ─────────────────────────────────────────────────────────────
const { data: up } = await sb
  .from("switch_ultimo_pago_cliente_v2")
  .select("cliente_codigo,ultimo_pago_fecha,ultimo_pago_monto")
  .eq("empresa_key", "joystep")
  .order("ultimo_pago_fecha", { ascending: false });
console.log(`\nClientes de joystep con "último pago": ${up?.length ?? 0}`);
for (const c of (up ?? []).slice(0, 6)) console.log(`  ${c.cliente_codigo}  ${c.ultimo_pago_fecha}  ${f2(c.ultimo_pago_monto)}`);

const ok = faltan.length === 0 && sobran.length === 0 && Math.abs(totDb - totSwitch) < 0.005 && dups.length === dupsSwitch.length;
console.log(`\n${ok ? "✅ CUADRA: mismo conjunto de recibos, mismo total, sin duplicados ni huérfanos." : "❌ NO CUADRA — revisar arriba."}`);
process.exit(ok ? 0 : 1);
