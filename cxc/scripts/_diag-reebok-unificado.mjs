// Validación Fase 1: pedidos Reebok unificados (sin necesidad de aplicar la vista).
// Replica la lógica de la vista + el recálculo de total del endpoint, y compara
// contra los totales que muestran HOY cada lista (presencial vs público).
//
//   node scripts/_diag-reebok-unificado.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// reebokServer hoy == principal (no hay REEBOK_* en env)
const url = env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.REEBOK_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
console.log("REEBOK_* en env:", Object.keys(env).filter((k) => k.includes("REEBOK")).join(", ") || "(ninguna → mismo proyecto)");
console.log("Conectando a", url);
const sb = createClient(url, key, { auth: { persistSession: false } });

const bulto = (cat) => (cat === "footwear" ? 12 : 6);

// products: mapa product_id → category (fuente canónica)
const { data: prods } = await sb.from("products").select("id, category");
const catMap = new Map((prods || []).map((p) => [p.id, p.category]));
const catFor = (pid, embedded) => catMap.get(pid) || embedded || "apparel"; // fallback apparel

// ── Presenciales ──
const { data: orders } = await sb
  .from("reebok_orders")
  .select("id, order_number, client_name, vendor_name, total, created_at, reebok_order_items(product_id, quantity, unit_price)")
  .order("created_at", { ascending: false });

console.log("\n===== PRESENCIALES (origen 'mio') =====");
let mioRecalc = 0;
for (const o of orders || []) {
  const items = o.reebok_order_items || [];
  // recalc unificado (products, fallback apparel) — lo que mostrará la lista nueva
  const recalc = items.reduce((s, i) => s + i.quantity * bulto(catFor(i.product_id, null)) * Number(i.unit_price || 0), 0);
  mioRecalc += recalc;
  console.log(`  ${o.order_number}  "${o.client_name}"  items=${items.length}  guardado=$${Number(o.total).toFixed(2)}  recalc=$${recalc.toFixed(2)}  ${Math.abs(recalc - Number(o.total)) < 0.01 ? "" : "≠guardado"}`);
}
console.log(`  TOTAL mio: count=${(orders || []).length}  recalc=$${mioRecalc.toFixed(2)}`);

// ── Públicos ──
const { data: pubs } = await sb
  .from("reebok_pedidos_publicos")
  .select("short_id, cliente_nombre, total, created_at, items")
  .order("created_at", { ascending: false });

console.log("\n===== DEL LINK (origen 'link') =====");
let linkRecalcUnified = 0;
let linkRecalcEmbedded = 0;
let mismatches = 0;
for (const p of pubs || []) {
  const items = Array.isArray(p.items) ? p.items : [];
  // recalc unificado (products, fallback apparel) — lista nueva
  const recalcU = items.reduce((s, i) => s + Number(i.quantity || 0) * bulto(catFor(i.product_id, i.category)) * Number(i.unit_price || 0), 0);
  // recalc como HOY (embedded category, fallback footwear) — lista actual de admin
  const recalcE = items.reduce((s, i) => s + Number(i.quantity || 0) * bulto(i.category || "footwear") * Number(i.unit_price || 0), 0);
  linkRecalcUnified += recalcU;
  linkRecalcEmbedded += recalcE;
  const diff = Math.abs(recalcU - recalcE) >= 0.01;
  if (diff) mismatches++;
  console.log(`  ${p.short_id}  "${p.cliente_nombre ?? "(null→Sin nombre)"}"  items=${items.length}  guardado=$${Number(p.total).toFixed(2)}  recalcNuevo=$${recalcU.toFixed(2)}  recalcHoy=$${recalcE.toFixed(2)}  ${diff ? "⚠️DIFIERE" : ""}`);
}
console.log(`  TOTAL link: count=${(pubs || []).length}  recalcNuevo=$${linkRecalcUnified.toFixed(2)}  recalcHoy=$${linkRecalcEmbedded.toFixed(2)}`);

console.log("\n===== RESUMEN VALIDACIÓN FASE 1 =====");
console.log(`  Pedidos totales en vista: ${(orders || []).length + (pubs || []).length}  (mio=${(orders || []).length}, link=${(pubs || []).length})`);
console.log(`  Públicas con recalc nuevo ≠ recalc actual: ${mismatches}  ${mismatches === 0 ? "→ totales cuadran ✓" : "→ revisar (products vs category embebida)"}`);
console.log("DONE_DIAG_REEBOK");
