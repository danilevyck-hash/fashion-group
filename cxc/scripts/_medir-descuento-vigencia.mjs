#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// El descuento de $1.573,08 de Reynaldo, ANTES y DESPUÉS de darle vigencia.
// SOLO LECTURA contra producción.
//
// 🩸 `comision_descuentos_fijos` no tenía NINGUNA columna de fecha, así que el
// descuento se restaba en TODOS los meses, para siempre y hacia atrás — también
// en los seis anteriores al 8-jul-2026, día en que las dos filas se crearon.
//
// Daniel, 6-sep-2026, textual: «pero el descuento es indefinido. No hay hasta.
// Ponlo desde enero que se le descuenta esos 1500 y pico.» → `desde =
// 2026-01-01`, `hasta` en NULL.
//
// 🔴 LO QUE ESTE SCRIPT TIENE QUE DEMOSTRAR: que **NINGÚN mes de 2026 cambia de
// número**. Si algo se mueve, es un defecto.
//
// 🔑 El mecanismo no es para esta fila: es para el PRÓXIMO descuento. El defecto
// no era el monto de Reynaldo (ahí sí correspondía desde enero), era que la
// tabla no tenía forma de decir desde cuándo — así que el descuento que se
// cargue en octubre también se iba a restar en marzo, y ahí sí sin querer.
//
// El bruto sale de la RPC real (comision_b2b_v8); el descuento se aplica acá
// con la MISMA regla del servidor (`netearComisiones`: no toca a DEFAULT), y la
// vigencia con la MISMA de `lib/comisiones/vigencia.ts`.
//
// Uso:  node scripts/_medir-descuento-desde-julio.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
// Los que se muestran pero NO se pagan (lib/comisiones/sin-pago) y los
// RETIRADOS (lib/comisiones/retirados). El «Total a pagar» los deja afuera.
const FUERA = new Set(["DEFAULT", "DANIEL LEVY", "REY STOUTE AGUAS", "AGUAS", "COLABORADOR"]);
const DESDE = "2026-01-01";  // Daniel: «Ponlo desde enero». `hasta`: NULL (indefinido).

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) { console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
};

// Las filas del catálogo, tal como están hoy (sin fechas).
const descuentos = await sql(
  `select vendedor_nombre, empresa_key, monto::numeric from comision_descuentos_fijos where activo`,
);
const porVendedor = {};
for (const d of descuentos) {
  porVendedor[d.vendedor_nombre] = (porVendedor[d.vendedor_nombre] ?? 0) + Number(d.monto);
}
const D = Object.entries(porVendedor);

const bruto = await sql(`
select (v->>'vendedor') as vendedor, m.mes,
  round(sum((v->>'comision_total')::numeric),2) as bruto
from (values ${EMPRESAS.map((e) => `('${e}')`).join(",")}) e(k)
cross join generate_series(1,9) m(mes)
cross join lateral jsonb_array_elements((comision_b2b_v8(e.k, 2026, m.mes))->'vendedores') v
group by 1,2 order by 2,1;`);

const desdeMes = Number(DESDE.slice(0, 4)) * 100 + Number(DESDE.slice(5, 7));
const fila = (mes) => bruto.filter((b) => b.mes === mes && !FUERA.has(b.vendedor));

console.log("\nCatálogo de descuentos hoy:");
for (const [v, m] of D) console.log(`  ${v.padEnd(22)} $${m.toFixed(2)} / mes`);
console.log(`\nDecisión: desde ${DESDE}, sin «hasta» (indefinido)\n`);
console.log("Mes  Bruto pagable   Desc ANTES  Desc DESPUÉS   A pagar ANTES  A pagar DESPUÉS   ¿cambia?");

let ta = 0, td = 0, cambian = 0;
for (let mes = 1; mes <= 9; mes++) {
  const filas = fila(mes);
  const b = filas.reduce((s, x) => s + Number(x.bruto), 0);
  const aplica = (v) => filas.some((f) => f.vendedor === v);
  const dAntes = D.filter(([v]) => aplica(v)).reduce((s, [, m]) => s + m, 0);
  const dDespues = 2026 * 100 + mes >= desdeMes ? dAntes : 0;
  const pa = b - dAntes, pd = b - dDespues;
  ta += pa; td += pd;
  const cambia = Math.abs(pa - pd) > 0.001;
  if (cambia) cambian++;
  console.log(
    `${String(mes).padStart(3)}  ${b.toFixed(2).padStart(13)}  ${(-dAntes).toFixed(2).padStart(11)}  ${(-dDespues).toFixed(2).padStart(12)}  ${pa.toFixed(2).padStart(14)}  ${pd.toFixed(2).padStart(15)}   ${cambia ? "sí" : "NO"}`,
  );
}
console.log(`\n2026  a pagar ANTES $${ta.toFixed(2)}   DESPUÉS $${td.toFixed(2)}   (+$${(td - ta).toFixed(2)})`);
// ── Y ahora POR PERSONA y por mes, que es el grano que Daniel mira ──────────
console.log("\nPor PERSONA y por mes (neto del descuento):\n");
const personas = [...new Set(bruto.filter((b) => !FUERA.has(b.vendedor)).map((b) => b.vendedor))].sort();
const cab = ["mes", ...personas.map((p) => p.padStart(18))].join("  ");
console.log(cab);
let celdasCambian = 0;
for (let mes = 1; mes <= 9; mes++) {
  const cols = personas.map((p) => {
    const f = bruto.find((b) => b.mes === mes && b.vendedor === p);
    const b = f ? Number(f.bruto) : 0;
    const d = porVendedor[p] ?? 0;
    const antes = b - d;
    const despues = b - (2026 * 100 + mes >= desdeMes ? d : 0);
    if (Math.abs(antes - despues) > 0.001) celdasCambian++;
    return `${antes.toFixed(2)}${Math.abs(antes - despues) > 0.001 ? ` → ${despues.toFixed(2)}` : ""}`.padStart(18);
  });
  console.log([String(mes).padStart(3), ...cols].join("  "));
}

console.log(
  cambian === 0 && celdasCambian === 0
    ? `\n✅ NINGÚN mes cambia de número, y ninguna de las ${personas.length * 9} celdas (persona × mes) se mueve.\n   La vigencia queda cargada para el PRÓXIMO descuento.`
    : `\n❌ Cambian ${cambian} meses y ${celdasCambian} celdas — es un DEFECTO: con «desde enero» no se puede mover nada.`,
);
