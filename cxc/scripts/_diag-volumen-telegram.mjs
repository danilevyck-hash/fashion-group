/**
 * SOLO LECTURA. Estima cuántos mensajes de Telegram recibe Daniel por semana,
 * por FUENTE, cruzando las tablas de negocio de los últimos 30 días.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function count(table, filtro) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=id&${filtro}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "0-0", Prefer: "count=exact" } });
  if (!res.ok) return `ERR ${res.status}`;
  return Number((res.headers.get("content-range") ?? "/0").split("/")[1]);
}

const d30 = new Date(Date.now() - 30 * 86400e3).toISOString();
const semana = (n) => typeof n === "number" ? (n / 30 * 7).toFixed(1) : n;

console.log("Fuente                                   30d    /semana");
const filas = [];

// Pedidos (cada uno = aviso de pedido + aviso "enviado a Switch")
for (const t of ["reebok_orders", "joybees_orders", "tommy_orders"]) {
  const n = await count(t, `created_at=gte.${d30}`);
  filas.push([`${t} (pedidos creados)`, n]);
}

// Guías despachadas
filas.push(["guia_transporte → Completada", await count("guia_transporte", `estado=eq.Completada&updated_at=gte.${d30}`)]);

// Cheques: días con al menos 1 cheque venciendo → 1 mensaje/día
const res = await fetch(`${URL_}/rest/v1/cheques?select=fecha_deposito&estado=eq.pendiente`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const ch = res.ok ? await res.json() : [];
filas.push(["cheques pendientes (total hoy)", ch.length]);

for (const [k, v] of filas) console.log(`${k.padEnd(40)} ${String(v).padStart(4)}   ${semana(v)}`);

console.log("\n=== RESÚMENES FIJOS (no dependen de datos) ===");
console.log("  acs-resumen-diario         1/día   = 7.0/semana");
console.log("  catalogos-fotos-resumen    1/lunes = 1.0/semana");
console.log("  grupo-resumen-mensual      1/mes   = 0.2/semana");
console.log("  cheques-alert              1/día SI hay cheques por vencer");
console.log("  db-salud                   11/día PERO solo alerta si cruza umbral");

console.log("\n=== ERRORES (medido antes): 19 filas cron_email_errors con Telegram en 30d = 4.4/sem ===");
