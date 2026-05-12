// Validación Definition of Done — Commit 1 retail/wholesale split.
//
// Predice lo que la RPC multifashion_mensual_v3 DEBE devolver una vez
// aplicadas las migrations 20260512100000 + 20260512100100. Calcula
// los mismos números desde ventas_raw aplicando el filtro DEFAULT como
// proxy del flag is_wholesale (que todavía no existe en la DB).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const supa = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(filterFn) {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    let q = supa.from('ventas_raw').select('empresa, fecha, mes, anio, subtotal, utilidad, vendedor, cliente, n_sistema, quarter').range(from, from + PAGE - 1);
    q = filterFn(q);
    const { data, error } = await q;
    if (error) { console.error('ERROR:', error); process.exit(1); }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const isWholesale = (r) => r.empresa === 'american_classic' && (r.vendedor ?? '').trim().toUpperCase() === 'DEFAULT';

// Cargar todo Multifashion 2026 + 2025
const mf2026 = await fetchAll(q => q.eq('empresa', 'american_classic').eq('anio', 2026));
const mf2025 = await fetchAll(q => q.eq('empresa', 'american_classic').eq('anio', 2025));

console.log('═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 1: Backfill count predicho');
console.log('═════════════════════════════════════════════════════════════');
const wholesaleAll = [...mf2026, ...mf2025].filter(isWholesale);
const allMf = await fetchAll(q => q.eq('empresa', 'american_classic'));
const wholesaleTotal = allMf.filter(isWholesale).length;
console.log(`  Total american_classic DEFAULT (todos los años): ${wholesaleTotal} filas`);
console.log(`  → Esperado tras backfill: SELECT COUNT(*) FROM ventas_raw WHERE is_wholesale = true; = ${wholesaleTotal}`);

console.log('\n═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 2: Retail YTD vs Wholesale YTD vs Total YTD (2026 hasta May)');
console.log('═════════════════════════════════════════════════════════════');
{
  const ytdRows = mf2026.filter(r => r.mes <= 5);
  const retail = ytdRows.filter(r => !isWholesale(r));
  const wholesale = ytdRows.filter(r => isWholesale(r));
  const sumSub = (rs) => rs.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const retailYtd = sumSub(retail);
  const wholesaleYtd = sumSub(wholesale);
  const totalYtd = retailYtd + wholesaleYtd;
  const retailTickets = new Set(retail.map(r => r.n_sistema)).size;
  const wholesaleTickets = new Set(wholesale.map(r => r.n_sistema)).size;
  console.log(`  Retail YTD:    $${retailYtd.toFixed(2).padStart(12)}  (${retailTickets} tickets)`);
  console.log(`  Wholesale YTD: $${wholesaleYtd.toFixed(2).padStart(12)}  (${wholesaleTickets} tickets)`);
  console.log(`  Total YTD:     $${totalYtd.toFixed(2).padStart(12)}  (${retailTickets + wholesaleTickets} tickets agg)`);
  console.log(`  ─ Esperado DoD: Retail YTD < $191,555.29 ✓ (${retailYtd < 191555.29 ? 'OK' : 'FAIL'})`);
  console.log(`  ─ Esperado DoD: Wholesale YTD = $25,751.99 (Ene-May) → predicho $${wholesaleYtd.toFixed(2)}`);
  console.log(`  ─ Esperado DoD: Total YTD = $191,555.29 → predicho $${totalYtd.toFixed(2)}`);
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 3: Vendedoras Abril 2026 (retail-only, sin DEFAULT)');
console.log('═════════════════════════════════════════════════════════════');
{
  const abril = mf2026.filter(r => r.mes === 4 && !isWholesale(r));
  const sum = abril.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const tickets = new Set(abril.map(r => r.n_sistema)).size;
  // Vendedoras unique normalizadas
  const vendedoras = new Map();
  for (const r of abril) {
    const norm = (r.vendedor ?? '').trim().replace(/\s+/g, ' ');
    if (!norm) continue;
    vendedoras.set(norm, (vendedoras.get(norm) || 0) + Number(r.subtotal || 0));
  }
  console.log(`  Suma retail abril: $${sum.toFixed(2)}  (esperado DoD ≈ $46,782.80)`);
  console.log(`  Tickets retail abril: ${tickets}  (esperado DoD = 916)`);
  console.log(`  Vendedoras únicas: ${vendedoras.size}`);
  for (const [v, s] of [...vendedoras.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${v.padEnd(22)} $${s.toFixed(2)}`);
  }
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 4: Q1 Vendedoras 2026 (retail-only)');
console.log('═════════════════════════════════════════════════════════════');
{
  const q1 = mf2026.filter(r => r.mes >= 1 && r.mes <= 3 && !isWholesale(r));
  const sum = q1.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  console.log(`  Suma retail Q1: $${sum.toFixed(2)}  (esperado DoD ≈ $109,667)`);
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 5: Wholesale por mes 2026 (verificar abril = $25,399.37)');
console.log('═════════════════════════════════════════════════════════════');
{
  const wsByMonth = {};
  const wsTicketsByMonth = {};
  for (const r of mf2026.filter(isWholesale)) {
    wsByMonth[r.mes] = (wsByMonth[r.mes] || 0) + Number(r.subtotal || 0);
    if (!wsTicketsByMonth[r.mes]) wsTicketsByMonth[r.mes] = new Set();
    wsTicketsByMonth[r.mes].add(r.n_sistema);
  }
  for (const m of Object.keys(wsByMonth).sort((a, b) => +a - +b)) {
    console.log(`  Mes ${m}: $${wsByMonth[m].toFixed(2)}  (${wsTicketsByMonth[m].size} tickets)`);
  }
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log('DoD CHECK 6: Margen retail vs margen retail prev (mes <= 5 ambos)');
console.log('═════════════════════════════════════════════════════════════');
{
  const sumSub = (rs) => rs.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const sumUti = (rs) => rs.reduce((s, r) => s + Number(r.utilidad || 0), 0);
  const r26 = mf2026.filter(r => r.mes <= 5 && !isWholesale(r));
  const r25 = mf2025.filter(r => r.mes <= 5 && !isWholesale(r));
  const m26 = sumSub(r26) > 0 ? sumUti(r26) / sumSub(r26) : 0;
  const m25 = sumSub(r25) > 0 ? sumUti(r25) / sumSub(r25) : 0;
  const deltaPts = (m26 - m25) * 100;
  console.log(`  Margen retail 2026 YTD: ${(m26 * 100).toFixed(2)}%  (cur=$${sumSub(r26).toFixed(2)}, util=$${sumUti(r26).toFixed(2)})`);
  console.log(`  Margen retail 2025 YTD: ${(m25 * 100).toFixed(2)}%  (cur=$${sumSub(r25).toFixed(2)}, util=$${sumUti(r25).toFixed(2)})`);
  console.log(`  Δ pts: ${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(2)} pts vs 2025`);
}

console.log('\nDone.');
