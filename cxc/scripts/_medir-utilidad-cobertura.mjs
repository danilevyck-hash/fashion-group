#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// El guard del "cero silencioso" de utilidad — qué contaba antes y qué cuenta
// ahora, medido contra producción. SOLO LECTURA: no escribe ni un byte.
//
// 🩸 El 6-sep-2026 sonó 🔧 SISTEMA por `active_shoes` y `joystep` sin que pasara
// nada. El guard comparaba los documentos que trae el reporte de utilidad
// contra TODAS las filas de switch_facturas del rango, incluidas las ventas de
// mostrador (`Transacción`, serie 155), que ese reporte no trae nunca.
//
// LO QUE MIDE, en tres partes:
//   A) COBERTURA — tipo por tipo, cuántos documentos hay en switch_facturas y
//      cuántos llegaron al reporte, en 2026 (la era de switch_factura_utilidad).
//   B) LA TABLA POR DENTRO — qué series tiene switch_factura_utilidad, sin
//      cruzar nada. Es la prueba más limpia de que la 155 no está.
//   C) BACKTEST 90 DÍAS — dos cuentas:
//      C1) las veces que la alerta SONÓ de verdad (switch_sync_log);
//      C2) la exposición ESTRUCTURAL: día por día y empresa por empresa,
//          simulando la ventana del cron, en cuántos casos la regla VIEJA
//          habría disparado y la NUEVA no. Y el CONTROL al revés: en cuántos
//          casos las dos disparan (falta algo que el reporte sí trae).
//
// Uso:  node scripts/_medir-utilidad-cobertura.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];

// Espejo de TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD (src/lib/switch-api/utilidad-cobertura.ts).
const FUERA_DEL_REPORTE = ["Transacción"];

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) { console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.message) throw new Error(j.message);
  return j;
}

const lista = (arr) => arr.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
const n = (v, w = 7) => String(v).padStart(w);

// ── A) Cobertura por tipo de comprobante, 2026 ───────────────────────────────
console.log("\n═══ A) ¿QUÉ TRAE EL REPORTE DE UTILIDAD? (2026, las 6 del grupo) ═══\n");
const cobertura = await sql(`
  SELECT f.tipo_comprobante AS tipo,
         string_agg(DISTINCT split_part(f.secuencial,'-',1), ',') AS series,
         count(*) AS en_facturas,
         count(u.secuencial) AS en_reporte
  FROM switch_facturas f
  LEFT JOIN switch_factura_utilidad u
    -- Se parea por (empresa, secuencial) y NO por fecha: el reporte guarda el
    -- día de Panamá y switch_facturas el timestamp, así que un documento
    -- nocturno cae en días distintos (~10 de 1.837). Dentro de 2026 el
    -- secuencial no se repite, así que el pareo es exacto igual.
    ON u.empresa_key = f.empresa_key AND u.secuencial = f.secuencial
  WHERE f.fecha >= '2026-01-01' AND f.fecha < '2027-01-01'
    AND f.empresa_key IN (${lista(EMPRESAS)})
  GROUP BY 1 ORDER BY 3 DESC`);
console.log("  tipo                 serie   en facturas   en el reporte");
console.log("  " + "─".repeat(58));
for (const r of cobertura) {
  const marca = Number(r.en_reporte) === 0 ? "  ← NUNCA" : (r.en_facturas === r.en_reporte ? "  ✅ cuadra" : "  ⚠️ parcial");
  console.log(`  ${r.tipo.padEnd(18)} ${String(r.series).padStart(5)} ${n(r.en_facturas, 13)} ${n(r.en_reporte, 15)}${marca}`);
}

// ── B) La tabla del reporte, por dentro ──────────────────────────────────────
console.log("\n═══ B) LAS SERIES QUE HAY DENTRO DE switch_factura_utilidad ═══\n");
const dentro = await sql(`
  SELECT split_part(secuencial,'-',1) AS serie, count(*) AS docs,
         min(fecha)::text AS desde, max(fecha)::text AS hasta,
         count(DISTINCT empresa_key) AS empresas
  FROM switch_factura_utilidad GROUP BY 1 ORDER BY 2 DESC`);
for (const r of dentro) {
  console.log(`  serie ${String(r.serie).padEnd(4)} ${n(r.docs)} documentos   ${r.desde} → ${r.hasta}   ${r.empresas} empresas`);
}
const hay155 = dentro.some((r) => String(r.serie) === "155");
console.log(`\n  ¿Hay una sola 155 (mostrador) en la tabla? ${hay155 ? "SÍ ⚠️ — la regla hay que remedirla" : "NO — en toda la vida de la tabla"}`);

// ── C1) Cuántas veces SONÓ de verdad ─────────────────────────────────────────
console.log("\n═══ C1) BACKTEST — las veces que la alerta SONÓ (últimos 90 días) ═══\n");
const sonadas = await sql(`
  SELECT empresa_key, started_at::date::text AS dia, range_from::text AS desde, range_to::text AS hasta
  FROM switch_sync_log
  WHERE sync_type='utilidad' AND status='error'
    AND started_at >= now() - interval '90 days'
    AND error_message LIKE '%devolvió 0 documentos%'
  ORDER BY started_at`);
if (sonadas.length === 0) console.log("  (ninguna)");
for (const r of sonadas) console.log(`  ${r.dia}  ${r.empresa_key.padEnd(14)} ventana ${r.desde} → ${r.hasta}`);

// Para cada corrida que sonó: ¿qué había realmente en esa ventana?
console.log("\n  Qué había en cada una de esas ventanas:\n");
let sonaronViejo = 0, sonaríanNuevo = 0;
for (const r of sonadas) {
  const [q] = await sql(`
    SELECT
      count(*) FILTER (WHERE tipo_comprobante NOT IN (${lista(FUERA_DEL_REPORTE)})) AS cubiertos,
      count(*) FILTER (WHERE tipo_comprobante IN (${lista(FUERA_DEL_REPORTE)}))     AS mostrador
    FROM switch_facturas
    WHERE empresa_key = '${r.empresa_key}'
      AND fecha >= '${r.desde}T00:00:00-05:00'
      AND fecha <  (date '${r.hasta}' + interval '1 month')::text::timestamptz`);
  sonaronViejo += 1;
  const nuevo = Number(q.cubiertos) > 0;
  if (nuevo) sonaríanNuevo += 1;
  console.log(`  ${r.dia}  ${r.empresa_key.padEnd(14)} cubiertos=${n(q.cubiertos,3)}  mostrador=${n(q.mostrador,3)}   → con la regla nueva: ${nuevo ? "SUENA" : "calla"}`);
}
console.log(`\n  REGLA VIEJA: sonó ${sonaronViejo} vez/veces.   REGLA NUEVA: habría sonado ${sonaríanNuevo}.`);

// ── C2) Exposición estructural ───────────────────────────────────────────────
console.log("\n═══ C2) BACKTEST ESTRUCTURAL — día por día, empresa por empresa ═══");
console.log("       (simula la ventana del cron: el mes en curso, y también el");
console.log("        anterior los días 1-5. El reporte trae lo que cubre.)\n");
const estructural = await sql(`
  WITH dias AS (
    SELECT generate_series(current_date - 89, current_date, interval '1 day')::date AS dia
  ),
  emp AS (SELECT unnest(ARRAY[${lista(EMPRESAS)}]) AS empresa_key),
  ventanas AS (
    SELECT d.dia, e.empresa_key,
           CASE WHEN extract(day FROM d.dia) <= 5
                THEN date_trunc('month', d.dia)::date - interval '1 month'
                ELSE date_trunc('month', d.dia)::date END::date AS desde,
           (date_trunc('month', d.dia) + interval '1 month')::date AS hasta_excl
    FROM dias d CROSS JOIN emp e
  ),
  conteo AS (
    SELECT v.dia, v.empresa_key,
      (SELECT count(*) FROM switch_facturas f
         WHERE f.empresa_key = v.empresa_key
           AND f.fecha >= (v.desde::text || 'T00:00:00-05:00')::timestamptz
           AND f.fecha <  (v.hasta_excl::text || 'T00:00:00-05:00')::timestamptz
           AND f.tipo_comprobante NOT IN (${lista(FUERA_DEL_REPORTE)})) AS cubiertos,
      (SELECT count(*) FROM switch_facturas f
         WHERE f.empresa_key = v.empresa_key
           AND f.fecha >= (v.desde::text || 'T00:00:00-05:00')::timestamptz
           AND f.fecha <  (v.hasta_excl::text || 'T00:00:00-05:00')::timestamptz
           AND f.tipo_comprobante IN (${lista(FUERA_DEL_REPORTE)})) AS mostrador
    FROM ventanas v
  )
  SELECT
    count(*) FILTER (WHERE cubiertos = 0 AND mostrador > 0) AS solo_mostrador,
    count(*) FILTER (WHERE cubiertos = 0 AND mostrador = 0) AS ventana_vacia,
    count(*) FILTER (WHERE cubiertos > 0)                   AS con_cubiertos,
    count(*)                                                AS total
  FROM conteo`);
const e = estructural[0];
console.log(`  días×empresa simulados:                              ${n(e.total)}`);
console.log(`  ventana con documentos que el reporte SÍ trae:       ${n(e.con_cubiertos)}  (las dos reglas callan si el reporte los trae)`);
console.log(`  ventana VACÍA de verdad:                             ${n(e.ventana_vacia)}  (las dos reglas callan)`);
console.log(`  🩸 ventana SOLO con mostrador:                        ${n(e.solo_mostrador)}  ← acá la regla VIEJA suena y la NUEVA calla`);

// CONTROL: la regla nueva sigue sirviendo. Si el reporte se cayera y no trajera
// nada, ¿en cuántos de esos días×empresa sonaría la NUEVA? Tiene que ser
// exactamente `con_cubiertos` — o sea, casi todos.
console.log("\n  CONTROL (el reporte deja de traer TODO, que es la avería real):");
console.log(`    la regla nueva sonaría en ${e.con_cubiertos} de ${e.total} días×empresa.`);
console.log("    Si ese número fuera 0, el guard habría dejado de servir.\n");
