#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// VENTAS, LOS 13 CAMBIOS DEL 11-sep-2026 — NINGÚN TOTAL SE MUEVE: la prueba,
// contra producción y SOLO LECTURA.
//
// Los trece cambios aprobados por Daniel son de FORMA (un selector de período,
// Total y Proyección fijas, un solo «Utilidad», sin Trimestral/Anual, los
// botones «Descargar en Excel», el desplegable de empresa, «Nuevo», Multifashion
// fuera de Productos, la puerta de atrás cerrada…). Lo ÚNICO que cambia un
// número es el margen del MES EN CURSO (#5), que deja de mezclar la venta de
// hoy con el costo de ayer. Este script mide las dos cosas:
//
//   A. Los TOTALES que no pueden moverse, leídos de la MISMA RPC que alimenta
//      la pantalla (`ventas_dashboard_summary_v2`): el año 2026 y agosto de las
//      8 empresas. Se corre ANTES y DESPUÉS del cambio.
//   B. El EFECTO del #5, empresa por empresa: la venta del mes hasta HOY, el
//      costo cargado (hasta AYER), la venta hasta el ÚLTIMO DÍA CON COSTO y
//      los dos márgenes (como se ve hoy / con el mismo corte en los dos).
//
// Uso:  node scripts/_medir-ventas-13-cambios.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const YEAR = 2026;

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local");
  process.exit(1);
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
}

const money = (n) => Number(n ?? 0).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")} %`);

// ── A. Los totales ───────────────────────────────────────────────────────────
const [anio] = await sql(`
  SELECT ROUND(SUM(total_subtotal), 2) AS ventas,
         ROUND(SUM(total_costo), 2)    AS costo,
         ROUND(SUM(total_utilidad), 2) AS utilidad
  FROM ventas_dashboard_summary_v2(${YEAR})
`);
console.log(`\nA · RESUMEN ${YEAR} (ventas_dashboard_summary_v2, las 8 empresas)`);
console.log(`   Ventas   $${money(anio.ventas)}`);
console.log(`   Costo    $${money(anio.costo)}`);
console.log(`   Utilidad $${money(anio.utilidad)}`);

const agosto = await sql(`
  SELECT empresa, ROUND(total_subtotal, 2) AS ventas, ROUND(total_costo, 2) AS costo
  FROM ventas_dashboard_summary_v2(${YEAR})
  WHERE mes = 8
  ORDER BY total_subtotal DESC
`);
console.log(`\n   AGOSTO ${YEAR}, empresa por empresa`);
let totAgo = 0;
for (const r of agosto) {
  totAgo += Number(r.ventas);
  console.log(`   ${r.empresa.padEnd(20)} $${money(r.ventas).padStart(14)}`);
}
console.log(`   ${"TOTAL".padEnd(20)} $${money(totAgo).padStart(14)}`);

// ── B. El margen del mes en curso ────────────────────────────────────────────
const [hoy] = await sql(`SELECT (now() AT TIME ZONE 'America/Panama')::date AS d`);
const mesIni = `${hoy.d.slice(0, 7)}-01`;
const mesNum = Number(hoy.d.slice(5, 7));

const filas = await sql(`
  WITH rpc AS (
    SELECT empresa, total_subtotal AS venta_hoy, total_costo AS costo
    FROM ventas_dashboard_summary_v2(${YEAR})
    WHERE mes = ${mesNum}
  ),
  corte AS (
    SELECT empresa_key, MAX(fecha) AS costo_hasta
    FROM switch_articulo_diario
    WHERE fecha >= DATE '${mesIni}' AND fecha <= DATE '${hoy.d}'
    GROUP BY empresa_key
  ),
  hasta AS (
    SELECT f.empresa_key,
           SUM(CASE
                 WHEN f.tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN f.subtotal_descuento
                 WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -f.subtotal_descuento
                 ELSE 0 END) AS venta_hasta_costo
    FROM switch_facturas f
    JOIN corte c ON c.empresa_key = f.empresa_key
    WHERE f.fecha >= (DATE '${mesIni}'::timestamp AT TIME ZONE 'America/Panama')
      AND f.fecha <  ((c.costo_hasta + 1)::timestamp AT TIME ZONE 'America/Panama')
    GROUP BY f.empresa_key
  )
  SELECT r.empresa, r.venta_hoy, r.costo, c.costo_hasta, h.venta_hasta_costo
  FROM rpc r
  LEFT JOIN corte c ON c.empresa_key = r.empresa
  LEFT JOIN hasta h ON h.empresa_key = r.empresa
  ORDER BY r.venta_hoy DESC
`);

console.log(`\nB · MARGEN DEL MES EN CURSO (${hoy.d.slice(0, 7)}), hoy ${hoy.d}`);
console.log(`   ${"empresa".padEnd(20)} ${"venta hoy".padStart(13)} ${"costo".padStart(13)} ${"hasta".padStart(10)} ${"venta hasta".padStart(13)} ${"margen HOY".padStart(11)} ${"margen CORTE".padStart(13)}`);
let sV = 0, sC = 0, sVh = 0;
for (const r of filas) {
  const v = Number(r.venta_hoy), c = Number(r.costo), vh = Number(r.venta_hasta_costo ?? 0);
  sV += v; sC += c; sVh += vh;
  const mHoy = v > 0 ? (v - c) / v : null;
  const mCorte = vh > 0 ? (vh - c) / vh : null;
  console.log(`   ${r.empresa.padEnd(20)} ${money(v).padStart(13)} ${money(c).padStart(13)} ${String(r.costo_hasta ?? "—").padStart(10)} ${money(vh).padStart(13)} ${pct(mHoy).padStart(11)} ${pct(mCorte).padStart(13)}`);
}
console.log(`   ${"GRUPO".padEnd(20)} ${money(sV).padStart(13)} ${money(sC).padStart(13)} ${"".padStart(10)} ${money(sVh).padStart(13)} ${pct(sV > 0 ? (sV - sC) / sV : null).padStart(11)} ${pct(sVh > 0 ? (sVh - sC) / sVh : null).padStart(13)}`);

// ── C. Clientes: cuántos no tienen con qué compararse (el «Nuevo») ───────────
const [nuevos] = await sql(`
  SELECT COUNT(*) FILTER (WHERE delta_vs_2025 IS NULL) AS sin_base, COUNT(*) AS total
  FROM clientes_agregado_12m_vw
`);
console.log(`\nC · CLIENTES sin base comparativa («Nuevo»): ${nuevos.sin_base} de ${nuevos.total}`);
