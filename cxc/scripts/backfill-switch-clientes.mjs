// Backfill switch_clientes desde /apicliente/lista (directorio completo Switch).
//
// Puente id→codigo para las vistas de clientes (clientes_empresa_12m_vw).
// Poblá esta tabla DESPUÉS de aplicar la migration 20260601000000_switch_clientes.sql
// y ANTES de aplicar 20260601000100 (la vista la necesita poblada).
//
// El sync diario de estadocuenta ya mantiene switch_clientes al día; este script
// es para el primer poblado inmediato (read-only contra el API, upsert en DB).
//
// Uso:  node scripts/backfill-switch-clientes.mjs
//
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(...a);

// empresa_key canónica → namespace de env vars (ver SWITCH_EMPRESA_ENV_MAP).
// Solo las 6 B2B (las que tienen codigo D-XXX y se puentean).
const ENVMAP = {
  vistana: 'VISTANA_INTERNATIONAL',
  fashion_wear: 'FASHION_WEAR',
  fashion_shoes: 'FASHION_SHOES',
  active_shoes: 'ACTIVE_SHOES',
  active_wear: 'ACTIVE_WEAR',
  joystep: 'JOYSTEP',
};

async function authToken(emp) {
  const ns = ENVMAP[emp];
  const url = vars[`SWITCH_${ns}_API_URL`].replace(/\/+$/, '');
  const r = await fetch(url + '/autenticacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usuario: vars[`SWITCH_${ns}_API_USER`], password: vars[`SWITCH_${ns}_API_PASSWORD`] }),
  });
  const j = await r.json();
  const token = j?.data?.token;
  if (!token) throw new Error(`auth ${emp} falló`);
  return { url, token };
}

async function listClientes(emp) {
  const { url, token } = await authToken(emp);
  const out = [];
  for (let page = 1; page <= 2000; page++) {
    const r = await fetch(`${url}/apicliente/lista?porPagina=200&paginaActual=${page}`, {
      headers: { Authorization: token, Accept: 'application/json' },
    });
    const j = await r.json();
    const batch = j?.data?.clientes ?? [];
    if (!batch.length) break;
    out.push(...batch);
    const total = Number(j?.data?.paginacion?.total ?? 0);
    if (total > 0 && out.length >= total) break;
  }
  return out;
}

const runStamp = new Date().toISOString();
let grandTotal = 0;
for (const emp of Object.keys(ENVMAP)) {
  try {
    const clientes = await listClientes(emp);
    const byId = new Map();
    for (const c of clientes) if (typeof c.id === 'number') byId.set(c.id, c);
    const payload = [...byId.values()].map(c => ({
      empresa_key: emp,
      cliente_switch_id: c.id,
      codigo: c.codigo ?? null,
      nombre: c.nombre ?? null,
      razonsocial: c.razonsocial ?? null,
      email: c.email ?? null,
      telefono: c.telefono ?? null,
      celular: c.celular ?? null,
      identificacion: c.identificacion ?? null,
      raw_data: c,
      synced_at: runStamp,
      updated_at: runStamp,
    }));
    const { error } = await supa.from('switch_clientes').upsert(payload, { onConflict: 'empresa_key,cliente_switch_id', ignoreDuplicates: false });
    if (error) { log(`  ${emp}: ERROR upsert → ${error.message}`); continue; }
    grandTotal += payload.length;
    log(`  ${emp}: ${payload.length} clientes upserted`);
  } catch (err) {
    log(`  ${emp}: ERROR → ${err.message}`);
  }
}
log(`\nListo. ${grandTotal} clientes en switch_clientes (6 B2B).`);
