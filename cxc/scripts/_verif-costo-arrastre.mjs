/**
 * SOLO LECTURA. ¿La fila de mil millones de switch_costo_diario ARRASTRA algo?
 * Snapshot de todos los consumidores conocidos de la tabla. Se corre ANTES y
 * DESPUÉS de borrarla: si nada cambia, la fila no alimentaba ninguna pantalla.
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function get(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) return { _error: `${r.status} ${await r.text()}` };
  return r.json();
}
async function rpc(name, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) return { _error: `${r.status} ${(await r.text()).slice(0, 200)}` };
  return r.json();
}

console.log("=== A. LA FILA EN LA TABLA ===");
console.log(JSON.stringify(await get("switch_costo_diario?select=*&empresa_key=eq.confecciones_boston&fecha=eq.2026-07-14")));

console.log("\n=== B. switch_costo_unificado_vw (la que alimenta TODO lo visible) ===");
console.log(JSON.stringify(await get("switch_costo_unificado_vw?select=*&empresa_key=eq.confecciones_boston&mes=gte.2026-05-01&order=mes.asc")));

console.log("\n=== C. ventas_rollup_mensual_mv (boston 2026) ===");
console.log(JSON.stringify(await get("ventas_rollup_mensual_mv?select=empresa_key,mes,ventas_netas,costo_total,utilidad&empresa_key=eq.confecciones_boston&anio=eq.2026&order=mes.asc")));

console.log("\n=== D. RPC ventas_dashboard_summary(2026) — boston ===");
{
  const d = await rpc("ventas_dashboard_summary", { p_anio: 2026 });
  if (d?._error) console.log(d._error);
  else {
    const rows = Array.isArray(d) ? d : (d.rows ?? d);
    const b = (Array.isArray(rows) ? rows : []).filter((r) => r.empresa === "confecciones_boston");
    console.log(JSON.stringify(b));
  }
}

console.log("\n=== E. RPC ventas_dashboard_prev_same_period(2026) — boston (ÚNICO lector real) ===");
{
  const d = await rpc("ventas_dashboard_prev_same_period", { p_year: 2026 });
  if (d?._error) console.log(d._error);
  else {
    const rows = d?.rows ?? d;
    const b = (Array.isArray(rows) ? rows : []).filter((r) => r.empresa === "confecciones_boston");
    console.log(`es_periodo_parcial=${d?.es_periodo_parcial} fecha_corte=${d?.fecha_corte}`);
    console.log(JSON.stringify(b));
  }
}

console.log("\n=== F. Suma cruda de switch_costo_diario por empresa×mes (control) ===");
{
  const all = await get("switch_costo_diario?select=empresa_key,fecha,costo_total&empresa_key=eq.confecciones_boston&order=fecha.asc");
  const porMes = new Map();
  for (const r of all) {
    const m = String(r.fecha).slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + Number(r.costo_total));
  }
  for (const [m, v] of [...porMes.entries()].sort()) console.log(`  ${m}  ${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
}
