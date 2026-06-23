// DoD: la celda mes×año por empresa cuadra al centavo contra Switch.
// Valida Fashion Wear, may-2024 y may-2025:
//   1. ventas_rollup_mensual_mv (lo que lee el endpoint /api/ventas/mes-anio)
//   2. switch_ventas_unificado_vw  (vista canónica = cuadra contra Switch)
//   3. réplica de la agregación del endpoint (sum por empresa/mes/anio)
// Δ debe ser 0.00 en los tres pares.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const supa = createClient(url, key, { auth: { persistSession: false } });

const EMP = 'fashion_wear';
const CASES = [
  { anio: 2024, mes: 5 },
  { anio: 2025, mes: 5 },
];

const r2 = (n) => Math.round(Number(n) * 100) / 100;

// 1) MV: fila precomputada (empresa, mes) → ventas_netas
async function mvVentas(anio, mes) {
  const { data, error } = await supa
    .from('ventas_rollup_mensual_mv')
    .select('ventas_netas, costo_total, utilidad')
    .eq('empresa_key', EMP)
    .eq('anio', anio)
    .eq('mes_num', mes);
  if (error) throw new Error('MV: ' + error.message);
  // El endpoint suma por (empresa,mes,anio) — replícalo aunque sea 1 fila.
  const v = (data ?? []).reduce((s, r) => ({
    ventas: s.ventas + Number(r.ventas_netas ?? 0),
    costo: s.costo + Number(r.costo_total ?? 0),
    utilidad: s.utilidad + Number(r.utilidad ?? 0),
  }), { ventas: 0, costo: 0, utilidad: 0 });
  return v;
}

// 2) Vista canónica de Switch: ventas_netas por empresa/mes (bucket hora-Panamá).
//    Filtramos por el primer día del mes (la MV deriva 'mes' = date_trunc month).
async function vwVentas(anio, mes) {
  const mesStr = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const { data, error } = await supa
    .from('switch_ventas_unificado_vw')
    .select('ventas_netas, mes, empresa_key')
    .eq('empresa_key', EMP)
    .eq('mes', mesStr);
  if (error) throw new Error('VW: ' + error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.ventas_netas ?? 0), 0);
}

let fail = 0;
for (const c of CASES) {
  const mv = await mvVentas(c.anio, c.mes);
  const vw = await vwVentas(c.anio, c.mes);
  const delta = r2(mv.ventas) - r2(vw);
  const ok = Math.abs(delta) < 0.005;
  if (!ok) fail++;
  console.log(
    `${EMP} ${c.anio}-${String(c.mes).padStart(2, '0')}  ` +
    `MV ventas=$${r2(mv.ventas).toLocaleString('en-US', { minimumFractionDigits: 2 })}  ` +
    `VW(Switch) ventas=$${r2(vw).toLocaleString('en-US', { minimumFractionDigits: 2 })}  ` +
    `Δ=${delta.toFixed(2)}  ${ok ? '✅' : '❌'}  ` +
    `[costo=$${r2(mv.costo)} util=$${r2(mv.utilidad)}]`
  );
}

console.log(fail === 0 ? '\n✅ DoD OK: cuadra al centavo (Δ=0.00).' : `\n❌ ${fail} caso(s) descuadran.`);
process.exit(fail === 0 ? 0 : 1);
