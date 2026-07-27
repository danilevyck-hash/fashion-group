/**
 * SOLO LECTURA. Mide en switch_sync_log cuántas veces un run quedó atascado en
 * 'running' y lo cerró la corrida siguiente (error_message "Run previo
 * atascado…"), en los últimos 30 días, por (empresa_key, sync_type).
 * Además: filas 'running' vivas ahora y duración de las corridas de cada tipo.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function q(path) {
  const out = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

const todas = await q(
  `switch_sync_log?select=id,empresa_key,sync_type,status,started_at,finished_at,error_message,triggered_by&started_at=gte.${desde}&order=started_at.asc`,
);
console.log(`Total corridas 30d: ${todas.length}`);

const atascadas = todas.filter((r) => (r.error_message ?? "").includes("Run previo atascado"));
console.log(`\n=== CORRIDAS CERRADAS POR ATASCO (30d): ${atascadas.length} ===`);
const porPar = new Map();
for (const r of atascadas) {
  const k = `${r.empresa_key}/${r.sync_type}`;
  porPar.set(k, (porPar.get(k) ?? 0) + 1);
}
for (const [k, v] of [...porPar.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(40)} ${v}`);
}
// `triggered_by` es la PRUEBA de la causa raíz: los atascos de catalogo_tommy
// del 27-jul salieron todos de 'manual' (/api/admin/sync-now, maxDuration=300)
// contra un trabajo de 485 s; los del cron (maxDuration=800) salieron success.
console.log("\n  Fechas (UTC) y quién la disparó:");
for (const r of atascadas) {
  console.log(`   ${r.started_at}  ${r.empresa_key}/${r.sync_type}  by=${r.triggered_by ?? "?"}`);
}

// Nota: la fila cerrada por atasco es la VÍCTIMA (la que llegó después y se
// marcó error). El run que se atascó es el anterior del mismo par.
const running = await q(
  `switch_sync_log?select=id,empresa_key,sync_type,started_at&status=eq.running&order=started_at.asc`,
);
console.log(`\n=== FILAS 'running' AHORA: ${running.length} ===`);
for (const r of running) {
  const min = Math.round((Date.now() - Date.parse(r.started_at)) / 60000);
  console.log(`  ${r.id}  ${r.empresa_key}/${r.sync_type}  ${r.started_at}  (${min} min)`);
}

console.log(`\n=== DURACIÓN de corridas terminadas, por sync_type (30d) ===`);
const dur = new Map();
for (const r of todas) {
  if (!r.finished_at) continue;
  const s = (Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000;
  if (!Number.isFinite(s) || s < 0) continue;
  if (!dur.has(r.sync_type)) dur.set(r.sync_type, []);
  dur.get(r.sync_type).push(s);
}
for (const [t, arr] of [...dur.entries()].sort()) {
  arr.sort((a, b) => a - b);
  const p = (f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  console.log(
    `  ${t.padEnd(22)} n=${String(arr.length).padStart(5)}  p50=${p(0.5).toFixed(0)}s  p95=${p(0.95).toFixed(0)}s  max=${arr[arr.length - 1].toFixed(0)}s`,
  );
}

console.log(`\n=== catalogo_tommy: últimas 25 corridas ===`);
for (const r of todas.filter((r) => r.sync_type === "catalogo_tommy").slice(-25)) {
  const s = r.finished_at
    ? ((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000).toFixed(0) + "s"
    : "ABIERTA";
  console.log(
    `  ${r.started_at}  ${r.status.padEnd(8)} ${s.padStart(8)}  ${(r.error_message ?? "").slice(0, 70)}`,
  );
}
