// SOLO LECTURA — mide la venta del día de ACS (Multifashion) como la mide el
// resumen de Telegram (retail, is_wholesale=false, SUM(subtotal) de
// _multifashion_sf_vw) y la compara contra el total sin filtrar.
// Uso: node scripts/_diag-venta-hoy-acs.mjs [YYYY-MM-DD ...]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

for (const linea of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const fechas = process.argv.slice(2).length ? process.argv.slice(2) : ["2026-08-08", "2026-08-07", "2026-08-01"];

for (const fecha of fechas) {
  const { data, error } = await sb
    .from("_multifashion_sf_vw")
    .select("subtotal, is_wholesale, tipo_comprobante")
    .eq("fecha", fecha)
    .order("n_sistema", { ascending: true })
    .range(0, 4999);
  if (error) { console.error(fecha, error.message); continue; }
  const retail = (data ?? []).filter(r => r.is_wholesale === false);
  const sum = (rows) => Math.round(rows.reduce((a, r) => a + (Number(r.subtotal) || 0), 0) * 100) / 100;
  console.log(
    `${fecha}  TODO: ${data.length} docs $${sum(data).toFixed(2)}   |   RETAIL: ${retail.length} docs $${sum(retail).toFixed(2)}`,
  );
}

const { data: log } = await sb
  .from("switch_sync_log")
  .select("started_at, finished_at, status, range_from, range_to")
  .eq("empresa_key", "american_classic")
  .eq("sync_type", "facturas")
  .eq("status", "success")
  .order("started_at", { ascending: false })
  .limit(3);
console.log("\núltimos syncs de facturas ACS:", JSON.stringify(log, null, 2));
