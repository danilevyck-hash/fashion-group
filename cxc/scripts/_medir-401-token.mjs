/**
 * SOLO LECTURA. Mide 401 / token-errors en switch_sync_log para el antes/después
 * del cambio de refresh por new_token. Clasifica por código de Switch:
 *   0005 TOKEN EXPIRADO   → el que el new_token debe eliminar
 *   0006 TOKEN INVALIDO   → sesión robada (otro login mató el nuestro)
 *   0011 / 0008           → token basura / ausente
 * Uso: node scripts/_medir-401-token.mjs [dias]
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

const dias = Number(process.argv[2] ?? 30);
const desde = new Date(Date.now() - dias * 86400e3).toISOString();
const rows = await q(
  `switch_sync_log?select=empresa_key,sync_type,status,started_at,error_message&started_at=gte.${desde}&order=started_at.asc`,
);

const err = rows.filter((r) => r.status === "error" && r.error_message);
const tok = err.filter((r) => /401|TOKEN|0005|0006|0008|0011/i.test(r.error_message));

const porCodigo = {};
for (const r of tok) {
  const m = r.error_message.match(/\b(0005|0006|0008|0011)\b/);
  const k = m ? m[1] : (/401/.test(r.error_message) ? "401-sin-code" : "otro");
  (porCodigo[k] ??= []).push(r);
}

console.log(`\n=== switch_sync_log últimos ${dias} días ===`);
console.log(`corridas totales : ${rows.length}`);
console.log(`con error        : ${err.length}`);
console.log(`token/401        : ${tok.length}`);
console.log(`\n--- token/401 por código ---`);
for (const [k, v] of Object.entries(porCodigo).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(14)} ${String(v.length).padStart(4)}`);
}
console.log(`\n--- token/401 por empresa ---`);
const porEmp = {};
for (const r of tok) (porEmp[r.empresa_key] ??= []).push(r);
for (const [k, v] of Object.entries(porEmp).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(20)} ${String(v.length).padStart(4)}`);
}
console.log(`\n--- muestra de mensajes (10) ---`);
for (const r of tok.slice(-10)) {
  console.log(`  ${r.started_at.slice(0, 16)} ${r.empresa_key}/${r.sync_type}: ${r.error_message.slice(0, 120)}`);
}
