/**
 * SOLO LECTURA. Inventario de alertas reales de los últimos 30 días.
 * Lee cron_email_errors y agrupa por tipo + firma del mensaje.
 * Uso: node scripts/_diag-alertas-30d.mjs
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
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + 999}`,
        Prefer: "count=exact",
      },
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
  `cron_email_errors?select=id,tipo,error_message,created_at,cheque_context&created_at=gte.${desde}&order=created_at.asc`,
);

console.log(`TOTAL filas cron_email_errors últimos 30 días: ${rows.length}`);
console.log(`Rango: ${rows[0]?.created_at} → ${rows.at(-1)?.created_at}\n`);

// ¿Cuáles de estas SÍ mandaron Telegram? No hay columna. Se infiere por el
// texto: los que logCronError persiste con {telegram:false} llevan prefijos
// conocidos.
const NO_TELEGRAM_PAT = /^fallo transitorio \(1ra corrida, sin alerta\)|^fallo repetido \(/;

const porTipo = new Map();
for (const r of rows) {
  const k = r.tipo;
  if (!porTipo.has(k)) porTipo.set(k, []);
  porTipo.get(k).push(r);
}

function firma(msg) {
  if (!msg) return "(vacío)";
  return msg
    .split(/\r?\n/)[0]
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?\b/g, "<fecha>")
    .replace(/\b\d+\b/g, "N")
    .replace(/[a-z_]+\/(facturas|estadocuenta|costo|recibos|utilidad|articulos|catalogo_\w+)/g, "<empresa>/$1")
    .slice(0, 130);
}

console.log("=== POR TIPO ===");
for (const [tipo, rs] of [...porTipo.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const conTg = rs.filter((r) => !NO_TELEGRAM_PAT.test(r.error_message ?? ""));
  console.log(`\n## ${tipo} — ${rs.length} filas (≈${conTg.length} con Telegram)`);
  const sig = new Map();
  for (const r of rs) {
    const f = firma(r.error_message);
    sig.set(f, (sig.get(f) ?? 0) + 1);
  }
  for (const [f, n] of [...sig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`   ${String(n).padStart(3)}× ${f}`);
  }
}

// Distribución por día
console.log("\n=== POR DÍA (todas) ===");
const porDia = new Map();
for (const r of rows) {
  const d = r.created_at.slice(0, 10);
  porDia.set(d, (porDia.get(d) ?? 0) + 1);
}
for (const [d, n] of [...porDia.entries()].sort()) console.log(`  ${d}  ${n}`);

// Ejemplos crudos de mensajes largos / HTML
console.log("\n=== MENSAJES CON HTML CRUDO ===");
const html = rows.filter((r) => /<!DOCTYPE|<html|<body|<br\s*\/?>/i.test(r.error_message ?? ""));
console.log(`  ${html.length} filas`);
for (const r of html.slice(0, 3)) {
  console.log(`  [${r.created_at}] ${r.tipo}: ${(r.error_message ?? "").slice(0, 220)}`);
}

// Mensajes que llegarían a Telegram literalmente (los que NO son telegram:false)
console.log("\n=== MUESTRA DE TEXTO QUE LE LLEGÓ A DANIEL (últimos 25 con telegram) ===");
const conTg = rows.filter((r) => !NO_TELEGRAM_PAT.test(r.error_message ?? ""));
console.log(`TOTAL con Telegram estimado: ${conTg.length} en 30 días = ${(conTg.length / 30 * 7).toFixed(1)}/semana`);
for (const r of conTg.slice(-25)) {
  console.log(`  [${r.created_at.slice(0, 16)}] ${r.tipo} :: ${(r.error_message ?? "").split("\n")[0].slice(0, 160)}`);
}
