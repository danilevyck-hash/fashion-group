// SOLO LECTURA. Fotografía la cartera de Boston y la del grupo, cliente por
// cliente, para poder compararlas POSICIÓN POR POSICIÓN antes y después.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const r2 = (n: number) => Math.round(n * 100) / 100;

async function leer(vista: string, cols: string, orden: string) {
  const out: Record<string, unknown>[] = [];
  for (let d = 0; d < 100_000; d += 1000) {
    const { data, error } = await sb.from(vista).select(cols).order(orden).range(d, d + 999);
    if (error) throw new Error(`${vista}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return out;
}

(async () => {
  const salida = process.argv[2] ?? "/tmp/cartera-foto.json";

  const boston = await leer(
    "switch_estadocuenta_aging_boston",
    "codigo, nombre, d0_90, d91_120, d121_plus, total",
    "codigo",
  );
  const sum = (k: string, f: Record<string, unknown>[]) => r2(f.reduce((n, x) => n + Number(x[k] ?? 0), 0));
  const totB = {
    clientes: boston.length,
    total: sum("total", boston),
    d0_90: sum("d0_90", boston),
    d91_120: sum("d91_120", boston),
    d121_plus: sum("d121_plus", boston),
  };
  console.log(`BOSTON  $${totB.total.toFixed(2)} · ${totB.clientes} clientes · 0-90 $${totB.d0_90.toFixed(2)} · 91-120 $${totB.d91_120.toFixed(2)} · 121+ $${totB.d121_plus.toFixed(2)}`);

  const grupo = await leer(
    "switch_estadocuenta_aging",
    "codigo, nombre, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365, total",
    "codigo",
  );
  const totG = { clientes: grupo.length, total: sum("total", grupo) };
  console.log(`GRUPO   $${totG.total.toFixed(2)} · ${totG.clientes} clientes`);

  fs.writeFileSync(salida, JSON.stringify({ totB, boston, totG, grupo }, null, 1));
  console.log(`foto → ${salida}`);
})().catch((e) => { console.error(e); process.exit(1); });
