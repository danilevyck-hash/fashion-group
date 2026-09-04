#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — cuánto vale la fila de Rey Stoute Aguas en 2026 y cuánto baja
// el total pagable al esconderla. SOLO LECTURA contra producción: llama la
// RPC vigente (comision_b2b_v8, la misma que la pantalla) para las 6 empresas
// del grupo, mes por mes, y suma.
//
// Daniel, 3-sep-2026, textual: «esconder rey stoute. si capitiliza reynaldo.»
// Con el alias (v8) la grafía «AGUAS» llega como «REY STOUTE AGUAS» y la lista
// de la matriz —que comparaba «AGUAS» a secas— dejó de esconderla.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-comisiones-aguas-retirado.mjs
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY (DOTENV_CONFIG_PATH=.env.local)");
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const YEAR = 2026;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SIN_PAGO = new Set(["DEFAULT", "DANIEL LEVY"]);
const RETIRADOS = new Set(["REY STOUTE AGUAS", "AGUAS"]);
const clave = (s) => String(s ?? "").trim().toUpperCase();

async function rpc(empresa, mes) {
  const r = await fetch(`${U}/rpc/comision_b2b_v8`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ p_empresa_key: empresa, p_year: YEAR, p_mes: mes }),
  });
  if (!r.ok) throw new Error(`${empresa} ${mes}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Descuentos fijos activos (se restan del total en el servidor). Se miran
// solo para confirmar que ninguno es de Aguas.
const desc = await (await fetch(`${U}/comision_descuentos_fijos?select=vendedor_nombre,empresa_key,monto,activo`, { headers: H })).json();
const descAguas = (Array.isArray(desc) ? desc : []).filter((d) => RETIRADOS.has(clave(d.vendedor_nombre)));

const r2 = (n) => Math.round(n * 100) / 100;
const porPersona = new Map();
const aguasDetalle = [];
let totalPagableAntes = 0;
let filaAguas = 0;
let grafias = new Set();

for (const e of EMPRESAS) {
  for (const m of MESES) {
    const d = await rpc(e, m);
    for (const v of d.vendedores ?? []) {
      const k = clave(v.vendedor);
      grafias.add(v.vendedor);
      const t = Number(v.comision_total ?? 0);
      porPersona.set(k, (porPersona.get(k) ?? 0) + t);
      if (RETIRADOS.has(k)) {
        filaAguas += t;
        if (t !== 0 || Number(v.base ?? 0) !== 0 || Number(v.base_cobro ?? 0) !== 0) {
          aguasDetalle.push({ empresa: e, mes: m, vendedor: v.vendedor, base: v.base, base_cobro: v.base_cobro, comision_total: t });
        }
      }
      if (!SIN_PAGO.has(k)) totalPagableAntes += t;
    }
  }
}

const totalPagableDespues = totalPagableAntes - filaAguas;

console.log("Grafías que devuelve la v8 (2026, 6 empresas):", [...grafias].sort().join(" · "));
console.log("");
console.log("Renglones de Aguas con actividad:");
for (const x of aguasDetalle) console.log("  ", x);
console.log("Descuentos fijos a nombre de Aguas:", descAguas.length);
console.log("");
console.log("Fila Rey Stoute Aguas, 2026 (suma de comision_total, 6 empresas × 9 meses):", r2(filaAguas));
console.log("Total pagable 2026 ANTES (con Aguas en pantalla):", r2(totalPagableAntes));
console.log("Total pagable 2026 DESPUÉS (Aguas retirado):          ", r2(totalPagableDespues));
console.log("Diferencia:", r2(totalPagableAntes - totalPagableDespues), "= la fila, exacto:", r2(totalPagableAntes - totalPagableDespues) === r2(filaAguas));
console.log("");
console.log("Por persona (2026, neto sin descuentos fijos):");
for (const [k, v] of [...porPersona.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${r2(v).toFixed(2)}`);
