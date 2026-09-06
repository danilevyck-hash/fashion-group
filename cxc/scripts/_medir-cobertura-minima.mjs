#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ¿Cuánto tiene que valer el PISO DE COBERTURA de la proyección de cierre?
//
// `c_cobertura_min` (`ventas_proyeccion_cierre_v7`, hoy 0.10) es el freno para
// «el año pasado no sirve de referencia porque la empresa abrió a mitad de
// año». Por debajo de ese piso se apagan `ritmo_actual`, la rama estacional y
// el clamp, y la proyección cae a la rama lineal.
//
// Este script MIDE, contra producción y SOLO LEYENDO, qué pasa si el piso sube:
// replica el SQL de la v7 tal cual —con el corte y el piso como parámetros— y
// lo corre sobre los días 5/11/17/23/29 de cada mes de 2023, 2024, 2025 y 2026,
// comparando contra el cierre real de cada año cerrado.
//
// La réplica está validada: reproduce `ventas_proyeccion_cierre_v7(2026)` al
// centavo en las 8 empresas (paso 1). Si ese cuadre falla, lo demás no vale.
//
// Lo que imprime:
//   1. Cuadre de la réplica contra la RPC viva.
//   2. Error medio (por empresa y de grupo) para cada piso candidato.
//   3. El desglose por año.
//   4. TODOS los casos que cambian de rama al subir el piso, con el error
//      antes y después. Es la tabla que decide: un piso solo sirve si no
//      empeora ni uno.
//
// Uso:
//   node scripts/_medir-cobertura-minima.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = "rspocgqhtpveytgbtler";
if (!TOKEN) throw new Error("falta SUPABASE_ACCESS_TOKEN en .env.local");

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "fashiongr-medicion" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 500)}`);
  return JSON.parse(t);
}

// La réplica del SQL de la v7, con `corte` y `cob_min` como parámetros.
// Es una COPIA a propósito: la función real no acepta un corte, y tocarla para
// medir sería cambiar lo que se quiere medir.
const BASE = String.raw`WITH
dia_ventas AS (
  SELECT empresa_key, fecha::date AS d,
    CASE
      WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
      WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
      ELSE 0
    END AS venta
  FROM switch_facturas WHERE fecha >= DATE '2025-05-01'
  UNION ALL
  SELECT CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
              WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
              ELSE empresa END, fecha, subtotal
  FROM ventas_raw WHERE fecha < DATE '2025-05-01'
),
dia_neto AS (SELECT empresa_key, d, SUM(venta) AS venta FROM dia_ventas GROUP BY 1,2),
cortes AS (
  SELECT a.anio, (make_date(a.anio, m.mes, 1) + (dd.dia - 1))::date AS corte, m.mes AS mes_corte
  FROM (VALUES (2023),(2024),(2025),(2026)) a(anio)
  CROSS JOIN generate_series(1,12) m(mes)
  CROSS JOIN (VALUES (5),(11),(17),(23),(29)) dd(dia)
  WHERE (make_date(a.anio, m.mes, 1) + (dd.dia - 1))::date <= DATE '2026-09-05'
    AND EXTRACT(MONTH FROM (make_date(a.anio, m.mes, 1) + (dd.dia - 1))::date)::int = m.mes
),
empresas_set AS (SELECT DISTINCT empresa_key AS empresa FROM switch_ventas_unificado_vw WHERE empresa_key IS NOT NULL),
anual AS (
  SELECT empresa_key AS empresa, EXTRACT(YEAR FROM mes)::int AS anio, SUM(ventas_netas)::numeric AS total
  FROM switch_ventas_unificado_vw GROUP BY 1,2
),
totales_raw AS (SELECT empresa, anio, total FROM anual WHERE total > 0),
base0 AS (
  SELECT c.anio, c.corte, c.mes_corte, e.empresa,
    ((c.corte - make_date(c.anio,1,1)) + 1)::numeric / 365 AS frac_cal,
    c.mes_corte::numeric/12 AS peso_ritmo
  FROM cortes c CROSS JOIN empresas_set e
),
ytd AS (
  SELECT b.anio, b.corte, b.empresa,
    COALESCE(SUM(dn.venta) FILTER (WHERE EXTRACT(YEAR FROM dn.d)::int = b.anio AND dn.d <= b.corte),0)::numeric AS ytd_cur,
    COALESCE(SUM(dn.venta) FILTER (WHERE EXTRACT(YEAR FROM dn.d)::int = b.anio-1 AND dn.d <= (b.corte - INTERVAL '1 year')::date),0)::numeric AS ytd_prev_sp
  FROM base0 b LEFT JOIN dia_neto dn ON dn.empresa_key = b.empresa
  GROUP BY 1,2,3
),
crec AS (
  SELECT b.anio, b.empresa,
    COALESCE(t0.total,0) AS total_prev_year,
    CASE WHEN t0.total IS NOT NULL AND t1.total > 0 THEN t0.total/t1.total - 1 END AS c1,
    CASE WHEN t1.total IS NOT NULL AND t2.total > 0 THEN t1.total/t2.total - 1 END AS c2,
    CASE WHEN t2.total IS NOT NULL AND t3.total > 0 THEN t2.total/t3.total - 1 END AS c3
  FROM (SELECT DISTINCT anio, empresa FROM base0) b
  LEFT JOIN anual t0 ON t0.empresa=b.empresa AND t0.anio=b.anio-1 AND t0.total>0
  LEFT JOIN totales_raw t1 ON t1.empresa=b.empresa AND t1.anio=b.anio-2
  LEFT JOIN totales_raw t2 ON t2.empresa=b.empresa AND t2.anio=b.anio-3
  LEFT JOIN totales_raw t3 ON t3.empresa=b.empresa AND t3.anio=b.anio-4
),
ritmo AS (
  SELECT c.*, CASE WHEN r IS NULL THEN NULL ELSE LEAST(0.50, GREATEST(-0.30, r)) END AS ritmo_historico
  FROM (SELECT c.*, CASE
      WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN (c1*3+c2*2+c3)/6
      WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN (c1*3+c2*2)/5
      WHEN c1 IS NOT NULL THEN c1 END AS r FROM crec c) c
),
mezcla AS (
  SELECT b.anio, b.corte, b.mes_corte, b.empresa, b.frac_cal, b.peso_ritmo,
    y.ytd_cur, y.ytd_prev_sp, r.total_prev_year, r.ritmo_historico,
    CASE WHEN r.total_prev_year > 0
         THEN CASE WHEN y.ytd_prev_sp > 0 THEN (y.ytd_prev_sp/r.total_prev_year)/b.frac_cal ELSE 0 END END AS cobertura
  FROM base0 b JOIN ytd y ON y.anio=b.anio AND y.corte=b.corte AND y.empresa=b.empresa
  JOIN ritmo r ON r.anio=b.anio AND r.empresa=b.empresa
),
umbral AS (SELECT unnest(ARRAY[0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45,0.50,0.60]::numeric[]) AS cob_min),
util AS (
  SELECT m.*, u.cob_min,
    (m.mes_corte < 3 OR m.cobertura IS NULL OR m.cobertura >= u.cob_min) AS prev_util
  FROM mezcla m CROSS JOIN umbral u
),
fin0 AS (
  SELECT u.*,
    CASE WHEN u.ytd_prev_sp > 0 AND u.prev_util THEN u.ytd_cur/u.ytd_prev_sp END AS ritmo_actual,
    CASE WHEN u.total_prev_year > 0 AND u.prev_util THEN u.ytd_prev_sp/u.total_prev_year END AS frac_ytd
  FROM util u
),
fin1 AS (
  SELECT f.*,
    (f.mes_corte >= 3 AND f.frac_ytd IS NOT NULL AND f.frac_ytd >= 0.05) AS usa_estacional,
    CASE
      WHEN f.mes_corte >= 3 AND f.frac_ytd IS NOT NULL AND f.frac_ytd >= 0.05 THEN NULL
      WHEN f.ritmo_historico IS NULL AND f.ritmo_actual IS NULL THEN NULL
      WHEN f.ritmo_historico IS NULL THEN LEAST(1.25, GREATEST(0.90, 1 + (f.ritmo_actual-1)*0.7))
      WHEN f.ritmo_actual IS NULL THEN LEAST(1.25, GREATEST(0.90, 1 + f.ritmo_historico*0.7))
      ELSE LEAST(1.25, GREATEST(0.90, 1 + ((f.ritmo_actual*f.peso_ritmo + (1+f.ritmo_historico)*(1-f.peso_ritmo)) - 1)*0.7))
    END AS factor_final
  FROM fin0 f
),
fin2 AS (
  SELECT f.*,
    CASE WHEN f.usa_estacional AND f.ytd_cur > 0 THEN 'estacional'
         WHEN NOT f.usa_estacional AND f.factor_final IS NOT NULL AND f.total_prev_year > 0 THEN 'mixto'
         ELSE 'fallback_lineal' END AS algoritmo
  FROM fin1 f
),
fin3 AS (
  SELECT f.*,
    CASE WHEN f.algoritmo='estacional' THEN f.ytd_cur/f.frac_ytd
         WHEN f.algoritmo='mixto' THEN f.total_prev_year*f.factor_final
         WHEN f.mes_corte>0 AND f.ytd_cur>0 THEN f.ytd_cur*12.0/f.mes_corte
         ELSE 0 END AS cruda
  FROM fin2 f
),
fin AS (
  SELECT f.*,
    CASE WHEN f.frac_ytd IS NOT NULL AND f.frac_ytd < 0.50 AND f.total_prev_year > 0 AND f.cruda > 0
         THEN LEAST(f.total_prev_year*1.60, GREATEST(f.total_prev_year*0.75, f.cruda))
         ELSE f.cruda END AS proyeccion
  FROM fin3 f
)`;

const num = (x) => (x == null ? null : Number(x));
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

// ── 1. Cuadre: la réplica contra la RPC viva ────────────────────────────────
const vivo = await sql(`
  WITH p AS (SELECT ventas_proyeccion_cierre_v7(2026) AS j)
  SELECT e->>'empresa' empresa, round((e->>'proyeccion_cierre')::numeric,2) proy
  FROM p, jsonb_array_elements(p.j->'empresas') e ORDER BY 1;`);
const replica = await sql(`${BASE}
SELECT f.empresa, round(f.proyeccion,2) proy
FROM fin f
WHERE f.cob_min = 0.10 AND f.anio = 2026
  AND f.corte = (SELECT MAX(fecha::date) FROM switch_facturas
                 WHERE fecha >= DATE '2026-01-01' AND fecha < DATE '2027-01-01')
ORDER BY 1;`);
console.log("1. CUADRE de la réplica contra ventas_proyeccion_cierre_v7(2026)");
let cuadra = vivo.length === replica.length && vivo.length === 8;
for (const v of vivo) {
  const r = replica.find((x) => x.empresa === v.empresa);
  const ok = r && Math.abs(num(r.proy) - num(v.proy)) < 0.01;
  if (!ok) cuadra = false;
  console.log(`   ${ok ? "✓" : "✗"} ${pad(v.empresa, 20)} rpc ${padL(v.proy, 14)}  réplica ${padL(r?.proy ?? "—", 14)}`);
}
console.log(cuadra ? "   → cuadra al centavo en las 8\n" : "   → NO CUADRA: el resto de la medición no vale\n");

// ── 2. Error medio por piso ─────────────────────────────────────────────────
const resumen = await sql(`${BASE}
, err AS (
  SELECT f.cob_min, f.anio, f.mes_corte, f.empresa,
         abs(f.proyeccion - a.total)/NULLIF(a.total,0) AS e
  FROM fin f JOIN anual a ON a.empresa=f.empresa AND a.anio=f.anio
  WHERE f.anio <= 2025 AND a.total > 0
), grp AS (
  SELECT f.cob_min, f.anio, f.corte, SUM(f.proyeccion) p, SUM(COALESCE(a.total,0)) r
  FROM fin f LEFT JOIN anual a ON a.empresa=f.empresa AND a.anio=f.anio
  WHERE f.anio <= 2025 GROUP BY 1,2,3
)
SELECT e.cob_min, count(*) casos,
  round(avg(e.e)*100,2) empresa_pct,
  round(avg(CASE WHEN e.mes_corte<3 THEN e.e END)*100,2) ene_feb,
  round(avg(CASE WHEN e.mes_corte BETWEEN 3 AND 5 THEN e.e END)*100,2) mar_may,
  round(avg(CASE WHEN e.mes_corte>=6 THEN e.e END)*100,2) jun_dic,
  (SELECT round(avg(abs(g.p-g.r)/NULLIF(g.r,0))*100,2) FROM grp g WHERE g.cob_min=e.cob_min) grupo_pct
FROM err e GROUP BY 1 ORDER BY 1;`);
console.log("2. ERROR MEDIO por piso (2023-2025, |proyección − cierre real|)");
console.log(`   ${pad("piso",6)}${padL("casos",7)}${padL("empresa",10)}${padL("ene-feb",10)}${padL("mar-may",10)}${padL("jun-dic",10)}${padL("grupo",10)}`);
for (const r of resumen) {
  console.log(`   ${pad(r.cob_min,6)}${padL(r.casos,7)}${padL(r.empresa_pct+"%",10)}${padL(r.ene_feb+"%",10)}${padL(r.mar_may+"%",10)}${padL(r.jun_dic+"%",10)}${padL(r.grupo_pct+"%",10)}`);
}

// ── 3. Por año ──────────────────────────────────────────────────────────────
const porAnio = await sql(`${BASE}
, err AS (
  SELECT f.cob_min, f.anio, f.empresa,
         abs(f.proyeccion - a.total)/NULLIF(a.total,0) AS e
  FROM fin f JOIN anual a ON a.empresa=f.empresa AND a.anio=f.anio
  WHERE f.anio <= 2025 AND a.total > 0
)
SELECT cob_min, anio, round(avg(e)*100,2) empresa_pct FROM err GROUP BY 1,2 ORDER BY 2,1;`);
console.log("\n3. ERROR POR EMPRESA, año por año");
for (const r of porAnio) console.log(`   piso ${pad(r.cob_min,6)} ${r.anio}  ${padL(r.empresa_pct+"%",8)}`);

// ── 4. Los casos que cambian ────────────────────────────────────────────────
const flips = await sql(`${BASE}
, base10 AS (SELECT * FROM fin WHERE cob_min = 0.10)
, otros AS (SELECT * FROM fin WHERE cob_min > 0.10)
SELECT o.cob_min, o.anio, o.empresa, count(*) cortes,
  min(o.mes_corte) mes_desde, max(o.mes_corte) mes_hasta,
  round(avg(abs(b.proyeccion - a.total)/NULLIF(a.total,0))*100,2) err_antes,
  round(avg(abs(o.proyeccion - a.total)/NULLIF(a.total,0))*100,2) err_despues
FROM otros o
JOIN base10 b ON b.anio=o.anio AND b.corte=o.corte AND b.empresa=o.empresa
LEFT JOIN anual a ON a.empresa=o.empresa AND a.anio=o.anio
WHERE o.prev_util <> b.prev_util AND o.anio <= 2025
GROUP BY 1,2,3 ORDER BY 1,2,3;`);
console.log("\n4. LOS CASOS QUE CAMBIAN DE RAMA (✓ mejora · ✗ empeora)");
for (const r of flips) {
  const antes = num(r.err_antes), desp = num(r.err_despues);
  const marca = desp == null || antes == null ? "?" : desp <= antes ? "✓" : "✗";
  console.log(`   ${marca} piso ${pad(r.cob_min,6)} ${r.anio} ${pad(r.empresa,20)} ${padL(r.cortes,3)} cortes (meses ${r.mes_desde}-${r.mes_hasta})  ${padL(antes+"%",9)} → ${padL(desp+"%",9)}`);
}

// ── 5. ¿Cambia algo del año en curso? ───────────────────────────────────────
const hoy = await sql(`${BASE}
SELECT f.cob_min, f.empresa, round(f.cobertura,4) cobertura, f.prev_util, round(f.proyeccion,2) proy
FROM fin f
WHERE f.anio = 2026
  AND f.corte = (SELECT MAX(fecha::date) FROM switch_facturas
                 WHERE fecha >= DATE '2026-01-01' AND fecha < DATE '2027-01-01')
ORDER BY f.empresa, f.cob_min;`);
console.log("\n5. HOY (corte vivo de 2026): la cobertura de cada empresa y si el piso la toca");
const porEmpresa = new Map();
for (const r of hoy) {
  if (!porEmpresa.has(r.empresa)) porEmpresa.set(r.empresa, []);
  porEmpresa.get(r.empresa).push(r);
}
for (const [emp, filas] of porEmpresa) {
  const distintas = new Set(filas.map((f) => f.proy));
  console.log(`   ${pad(emp, 20)} cobertura ${padL(filas[0].cobertura, 8)}  ${distintas.size === 1 ? "el piso NO la toca en ningún valor probado" : "⚠️ CAMBIA según el piso"}`);
}
