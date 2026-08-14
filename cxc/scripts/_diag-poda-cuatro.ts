/**
 * READ-ONLY. Verifica contra producción los tres datos que sostienen la poda t203:
 *  1. `badge` en los 4 catálogos (¿está realmente vacío?)
 *  2. `estado` en los 4 pedidos (¿existe "enviado"? ¿cuánto "confirmado"?)
 *  3. `directorio_clientes` (fichas, D-XXX, whatsapp)
 *  4. Guías: estado "Rechazada" y `motivo_rechazo`
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-poda-cuatro.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";

const PRODUCTS = ["products", "joybees_products", "tommy_products", "calvin_products"];
const ORDERS = ["reebok_orders", "joybees_orders", "tommy_orders", "calvin_orders"];

async function main() {
  const sb = supabaseServer;

  console.log("=== 1. BADGE por catálogo ===");
  let totalProd = 0;
  let totalConBadge = 0;
  for (const t of PRODUCTS) {
    const { data, error, count } = await sb.from(t).select("badge", { count: "exact" });
    if (error) {
      console.log(`  ${t}: ERROR ${error.message}`);
      continue;
    }
    const dist = new Map<string, number>();
    for (const r of data || []) {
      const k = (r as { badge: string | null }).badge ?? "(null)";
      dist.set(k, (dist.get(k) || 0) + 1);
    }
    const conBadge = (data || []).filter((r) => {
      const b = (r as { badge: string | null }).badge;
      return b !== null && String(b).trim() !== "";
    }).length;
    totalProd += count || 0;
    totalConBadge += conBadge;
    console.log(`  ${t}: ${count} productos | con badge NO vacío: ${conBadge} | dist: ${JSON.stringify(Object.fromEntries(dist))}`);
  }
  console.log(`  >>> TOTAL: ${totalProd} productos, ${totalConBadge} con badge`);

  console.log("\n=== 2. ESTADO por tabla de pedidos ===");
  const totalEstado = new Map<string, number>();
  for (const t of ORDERS) {
    const { data, error, count } = await sb.from(t).select("status", { count: "exact" });
    if (error) {
      console.log(`  ${t}: ERROR ${error.message}`);
      continue;
    }
    const dist = new Map<string, number>();
    for (const r of data || []) {
      const k = (r as { status: string | null }).status ?? "(null)";
      dist.set(k, (dist.get(k) || 0) + 1);
      totalEstado.set(k, (totalEstado.get(k) || 0) + 1);
    }
    console.log(`  ${t}: ${count} pedidos | ${JSON.stringify(Object.fromEntries(dist))}`);
  }
  console.log(`  >>> TOTAL estados: ${JSON.stringify(Object.fromEntries(totalEstado))}`);

  console.log("\n=== 2b. ¿confirmado tiene rastro de Switch? ===");
  for (const t of ORDERS) {
    const { data, error } = await sb.from(t).select("*").eq("status", "confirmado").limit(500);
    if (error) {
      console.log(`  ${t}: ERROR ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      console.log(`  ${t}: 0 confirmados`);
      continue;
    }
    const cols = Object.keys(data[0]).filter((c) => /switch/i.test(c));
    const resumen: Record<string, string> = {};
    for (const c of cols) {
      const llenos = data.filter((r) => (r as Record<string, unknown>)[c] != null).length;
      resumen[c] = `${llenos}/${data.length}`;
    }
    console.log(`  ${t}: ${data.length} confirmados | cols switch llenas: ${JSON.stringify(resumen)}`);
  }

  console.log("\n=== 3. directorio_clientes ===");
  const { data: dc, error: dcErr, count: dcCount } = await sb
    .from("directorio_clientes")
    .select("*", { count: "exact" });
  if (dcErr) {
    console.log(`  ERROR: ${dcErr.message}`);
  } else {
    console.log(`  fichas: ${dcCount}`);
    if (dc && dc.length) {
      console.log(`  columnas: ${Object.keys(dc[0]).join(", ")}`);
      for (const c of Object.keys(dc[0])) {
        const llenos = dc.filter((r) => {
          const v = (r as Record<string, unknown>)[c];
          return v != null && String(v).trim() !== "";
        }).length;
        console.log(`    ${c}: ${llenos}/${dc.length} llenos`);
      }
      const fechas = dc
        .map((r) => (r as Record<string, unknown>).created_at)
        .filter(Boolean)
        .sort();
      console.log(`  última creada: ${fechas[fechas.length - 1]}`);
    }
  }

  console.log("\n=== 4. GUÍAS: rechazo ===");
  const { data: g, error: gErr, count: gCount } = await sb.from("guia_transporte").select("estado, motivo_rechazo, deleted", { count: "exact" }).eq("deleted", false);
  if (gErr) {
    console.log(`  ERROR: ${gErr.message}`);
  } else {
    const dist = new Map<string, number>();
    for (const r of g || []) {
      const k = (r as { estado: string | null }).estado ?? "(null)";
      dist.set(k, (dist.get(k) || 0) + 1);
    }
    const conMotivo = (g || []).filter((r) => {
      const m = (r as { motivo_rechazo: string | null }).motivo_rechazo;
      return m != null && String(m).trim() !== "";
    }).length;
    console.log(`  guías: ${gCount} | estados: ${JSON.stringify(Object.fromEntries(dist))}`);
    console.log(`  motivo_rechazo lleno: ${conMotivo}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
