/**
 * SOLO LECTURA. Busca HUECOS: errores reales que NO produjeron alerta.
 * Cruza switch_sync_log (errores) contra cron_email_errors (rastro de alerta).
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function q(path) {
  const out = []; let from = 0;
  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json(); out.push(...rows);
    if (rows.length < 1000) break; from += 1000;
  }
  return out;
}

const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
const log = await q(`switch_sync_log?select=empresa_key,sync_type,status,started_at,error_message&started_at=gte.${desde}&order=started_at.asc`);
const cee = await q(`cron_email_errors?select=tipo,error_message,created_at&created_at=gte.${desde}&order=created_at.asc`);

const errores = log.filter((r) => r.status === "error");

// ¿Hubo alguna fila en cron_email_errors dentro de ±20 min del error?
function huboRastro(e) {
  const t = new Date(e.started_at).getTime();
  return cee.some((c) => {
    const ct = new Date(c.created_at).getTime();
    return Math.abs(ct - t) <= 20 * 60e3;
  });
}

console.log("=== ERRORES DE SYNC SIN NINGÚN RASTRO EN cron_email_errors ===");
console.log("(ni siquiera persistido: nadie se enteró, ni en silencio)\n");
const sinRastro = errores.filter((e) => !huboRastro(e));
console.log(`${sinRastro.length} de ${errores.length} errores NO dejaron rastro\n`);
const porClase = new Map();
for (const e of sinRastro) {
  const m = e.error_message ?? "";
  const c = /statement timeout/i.test(m) ? "statement timeout (BASE)"
    : /Error de red en/i.test(m) ? "Error de red"
    : /atascado/i.test(m) ? "run atascado en running"
    : /sin token/i.test(m) ? "auth 200 sin token"
    : /LICENCIA/i.test(m) ? "LICENCIA"
    : "OTRO: " + m.split("\n")[0].slice(0, 60);
  if (!porClase.has(c)) porClase.set(c, []);
  porClase.get(c).push(e);
}
for (const [c, arr] of [...porClase.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(arr.length).padStart(3)}×  ${c}`);
  for (const e of arr.slice(0, 4)) {
    console.log(`        [${e.started_at.slice(0, 16)}] ${e.empresa_key}/${e.sync_type}`);
  }
}

console.log("\n=== EL statement timeout: detalle completo ===");
for (const e of errores.filter((e) => /statement timeout/i.test(e.error_message ?? ""))) {
  console.log(`  [${e.started_at}] ${e.empresa_key}/${e.sync_type}`);
  console.log(`     msg: ${(e.error_message ?? "").slice(0, 200)}`);
  console.log(`     ¿rastro en cron_email_errors ±20min? ${huboRastro(e) ? "SÍ" : "NO ← HUECO"}`);
  // ¿el par ya tenía éxito ese día antes?
  const dia = e.started_at.slice(0, 10);
  const previos = log.filter((r) => r.empresa_key === e.empresa_key && r.sync_type === e.sync_type
    && r.status === "success" && r.started_at.slice(0, 10) === dia && r.started_at < e.started_at);
  console.log(`     éxitos previos del par ESE MISMO DÍA: ${previos.length}${previos.length ? " ← por eso el watchdog no lo ve" : ""}`);
}

console.log("\n=== ¿La base se cayó? Ventanas sin NINGUNA corrida registrada ===");
const times = log.map((r) => new Date(r.started_at).getTime()).sort((a, b) => a - b);
for (let i = 1; i < times.length; i++) {
  const gap = (times[i] - times[i - 1]) / 3600e3;
  if (gap > 5) {
    console.log(`  hueco de ${gap.toFixed(1)}h: ${new Date(times[i - 1]).toISOString().slice(0, 16)} → ${new Date(times[i]).toISOString().slice(0, 16)}`);
  }
}

console.log("\n=== cron_heartbeats: estado actual de cada cron ===");
const hb = await q(`cron_heartbeats?select=cron_name,last_success_at&order=last_success_at.desc`);
const ahora = Date.now();
for (const h of hb) {
  const horas = (ahora - new Date(h.last_success_at).getTime()) / 3600e3;
  const flag = horas > 26 ? "  ← STALE >26h" : "";
  console.log(`  ${h.cron_name.padEnd(38)} ${horas.toFixed(1)}h${flag}`);
}
