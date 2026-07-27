/**
 * SOLO LECTURA. switch_sync_log últimos 30 días: cuántos errores, de qué tipo,
 * y CUÁNTOS SE RECUPERARON SOLOS (hubo un success posterior del mismo par
 * dentro de las N horas siguientes).
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

const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
const rows = await q(
  `switch_sync_log?select=empresa_key,sync_type,status,started_at,error_message&started_at=gte.${desde}&order=started_at.asc`,
);
console.log(`switch_sync_log 30d: ${rows.length} corridas`);

const errores = rows.filter((r) => r.status === "error");
console.log(`  errores: ${errores.length}`);

function clase(m) {
  if (!m) return "(sin mensaje)";
  if (/LICENCIA/i.test(m)) return "LICENCIA NO ACTIVA (negocio - real)";
  if (/Error de red en/i.test(m)) return "Error de red";
  if (/Timeout >\d+ms/i.test(m)) return "Timeout";
  if (/HTTP 5\d\d/.test(m)) return "HTTP 5xx";
  if (/HTTP 40[13]|TOKEN INVALIDO|TOKEN EXPIRADO/i.test(m)) return "401/token";
  if (/statement timeout/i.test(m)) return "statement timeout (BASE)";
  if (/sin token/i.test(m)) return "auth 200 sin token (HTML crudo)";
  return "OTRO: " + m.split("\n")[0].slice(0, 70);
}

const porClase = new Map();
for (const e of errores) {
  const c = clase(e.error_message);
  porClase.set(c, (porClase.get(c) ?? 0) + 1);
}
console.log("\n=== ERRORES POR CLASE ===");
for (const [c, n] of [...porClase.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}×  ${c}`);
}

// ¿Se recuperó solo? = hay un success del MISMO par posterior, dentro de 24h.
const successPorPar = new Map();
for (const r of rows) {
  if (r.status !== "success") continue;
  const k = `${r.empresa_key}|${r.sync_type}`;
  if (!successPorPar.has(k)) successPorPar.set(k, []);
  successPorPar.get(k).push(new Date(r.started_at).getTime());
}
for (const arr of successPorPar.values()) arr.sort((a, b) => a - b);

function recuperadoEn(e, horas) {
  const k = `${e.empresa_key}|${e.sync_type}`;
  const t = new Date(e.started_at).getTime();
  const arr = successPorPar.get(k) ?? [];
  return arr.some((s) => s > t && s <= t + horas * 3600e3);
}

console.log("\n=== ¿SE RECUPERÓ SOLO? (success del mismo par después) ===");
for (const h of [3, 6, 12, 24]) {
  const n = errores.filter((e) => recuperadoEn(e, h)).length;
  console.log(`  en ≤${String(h).padStart(2)}h: ${n}/${errores.length} (${(n / errores.length * 100).toFixed(0)}%)`);
}

console.log("\n=== POR CLASE: recuperados en ≤12h ===");
for (const [c] of [...porClase.entries()].sort((a, b) => b[1] - a[1])) {
  const de = errores.filter((e) => clase(e.error_message) === c);
  const rec = de.filter((e) => recuperadoEn(e, 12)).length;
  console.log(`  ${c}: ${rec}/${de.length} recuperados ≤12h`);
}

// Los NO recuperados en 24h = problemas reales sostenidos
console.log("\n=== NO recuperados en 24h (candidatos a SEÑAL real) ===");
const malos = errores.filter((e) => !recuperadoEn(e, 24));
for (const e of malos) {
  console.log(`  [${e.started_at.slice(0, 16)}] ${e.empresa_key}/${e.sync_type}: ${clase(e.error_message)}`);
}

// Racha: errores consecutivos del mismo par
console.log("\n=== errores por día ===");
const porDia = new Map();
for (const e of errores) {
  const d = e.started_at.slice(0, 10);
  porDia.set(d, (porDia.get(d) ?? 0) + 1);
}
for (const [d, n] of [...porDia.entries()].sort()) console.log(`  ${d}  ${n}`);
