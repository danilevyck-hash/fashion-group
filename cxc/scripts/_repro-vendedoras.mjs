// Reproducción del bug del endpoint /api/multifashion/vendedoras.
//
// Síntoma: SQL Editor devuelve data nueva, supabase-js rpc devuelve data
// vieja (sin fecha_corte/es_periodo_parcial/dia_corte_anio_anterior y
// con ventas_total_prev = mayo completo en vez de mayo 1-9).
//
// Este script reproduce el call del endpoint usando exactamente el mismo
// cliente que route.ts (supabaseServer con service_role) Y ADEMÁS pega
// directo contra el endpoint REST de PostgREST para comparar.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();

console.log('SUPABASE_URL =', url);
console.log('SERVICE_ROLE first 12 chars =', key.slice(0, 12) + '...');

const supa = createClient(url, key, { auth: { persistSession: false } });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Call exactly como lo hace route.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('1. supabaseServer.rpc("multifashion_vendedoras_v3", ...)');
console.log('═══════════════════════════════════════════════════════════');
{
  const { data, error } = await supa.rpc('multifashion_vendedoras_v3', {
    p_year: 2026,
    p_periodo: 'mes',
    p_mes: 5,
    p_trimestre: null,
  });
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('Top-level keys:', Object.keys(data ?? {}));
    console.log('ventas_total:        ', data?.ventas_total);
    console.log('ventas_total_prev:   ', data?.ventas_total_prev);
    console.log('fecha_corte:         ', data?.fecha_corte);
    console.log('es_periodo_parcial:  ', data?.es_periodo_parcial);
    console.log('dia_corte_anio_anterior:', data?.dia_corte_anio_anterior);
    console.log('total_vendedoras:    ', data?.total_vendedoras_periodo);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Call directo via fetch al endpoint POST /rest/v1/rpc/multifashion_vendedoras_v3
//    (esto es exactamente lo que supabase-js hace por debajo)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('2. fetch directo a /rest/v1/rpc/multifashion_vendedoras_v3');
console.log('═══════════════════════════════════════════════════════════');
{
  const resp = await fetch(`${url}/rest/v1/rpc/multifashion_vendedoras_v3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      p_year: 2026,
      p_periodo: 'mes',
      p_mes: 5,
      p_trimestre: null,
    }),
  });
  console.log('HTTP status:', resp.status);
  const json = await resp.json();
  console.log('Top-level keys:', Object.keys(json ?? {}));
  console.log('Full body:', JSON.stringify(json, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Inspeccionar overloads y definición de la función vía pg_proc
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('3. pg_proc → todas las firmas de multifashion_vendedoras_v3');
console.log('═══════════════════════════════════════════════════════════');
{
  // Helper: ejecutar SQL arbitrario via una RPC genérica si existe, sino
  // intentar usar pg-meta endpoint
  const sqlText = `
    SELECT
      n.nspname || '.' || p.proname AS fqn,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.oid AS oid,
      pg_get_function_result(p.oid) AS returns,
      length(pg_get_functiondef(p.oid)) AS def_length
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname ILIKE '%vendedoras%' OR p.proname = 'multifashion_mensual'
    ORDER BY n.nspname, p.proname
  `;

  // Intentar via /pg/query (probablemente no expuesto)
  const r = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: sqlText }),
  }).catch(() => null);
  if (r) console.log('exec_sql endpoint status:', r?.status);

  console.log('(introspección directa a pg_proc requiere SQL Editor — corré esta query manualmente:)\n');
  console.log(sqlText);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ¿La función expone CURRENT_DATE correctamente? Probemos con un helper
//    si existe un RPC `now_at_db` o algo similar. Si no, lo hacemos via
//    una RPC que ejecutamos al instante.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('4. Probar funciones helper existentes (get_app_setting es STABLE)');
console.log('═══════════════════════════════════════════════════════════');
{
  // get_app_setting existe en el repo
  const { data, error } = await supa.rpc('get_app_setting', { p_key: 'multifashion_manager' });
  if (error) console.error('get_app_setting error:', error);
  else console.log('get_app_setting(multifashion_manager) =', JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Forzar a PostgREST refresh con un Cache-Control header
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('5. Re-llamar con cache-busting headers');
console.log('═══════════════════════════════════════════════════════════');
{
  const resp = await fetch(`${url}/rest/v1/rpc/multifashion_vendedoras_v3?_=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      p_year: 2026,
      p_periodo: 'mes',
      p_mes: 5,
      p_trimestre: null,
    }),
  });
  const json = await resp.json();
  console.log('Top-level keys:', Object.keys(json ?? {}));
  console.log('fecha_corte:         ', json?.fecha_corte);
  console.log('es_periodo_parcial:  ', json?.es_periodo_parcial);
  console.log('ventas_total_prev:   ', json?.ventas_total_prev);
}
