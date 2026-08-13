// Medición READ-ONLY de la BÚSQUEDA de Referencia contra producción.
//
// 🩸 POR QUÉ EXISTE. La auditoría de rendimiento (ago-2026) afirmó que el tab
// Referencia busca códigos con `LIKE 'X%'` sobre 197.000 filas SIN el índice
// adecuado, y que pegar 50 códigos dispara 50 de esas lecturas. Pero midió la
// PANTALLA VACÍA (2,8 s), no la búsqueda. Daniel pidió MEDIR antes de arreglar.
// Esto mide la búsqueda de verdad, con códigos REALES, 1 / 10 / 50 pegados.
//
// Qué mide, por tamaño de lista:
//   · `conteo`    — el pre-conteo (count exact) sobre switch_articulo_diario.
//                   Es la PRIMERA consulta del route y la que decide si la
//                   búsqueda es "demasiado amplia".
//   · `ventas` · `ingresos` · `info` — las 3 lecturas paginadas, en paralelo
//                   dentro del route (acá se miden por separado para ver cuál
//                   manda).
//   · `total`     — la suma que el usuario espera (conteo + max(las 3)).
//
// Y una sonda de DIAGNÓSTICO que es la que decide si falta un índice:
//   · `like` vs `eq` sobre EL MISMO código. Devuelven las mismas filas. Si el
//     LIKE por prefijo tarda un orden de magnitud más que el igual exacto, es
//     que el btree de (empresa_key, codigo) NO sirve para `LIKE 'X%'` — le
//     falta `text_pattern_ops`, porque el collation de la base no es C.
//
// 🔴 NO ESCRIBE NADA. Consultas SECUENCIALES y acotadas: Supabase es compute
// Micro y se cayó 4 veces esta semana. Entre tanda y tanda hay una pausa.
//
//   ETAPA=antes  node --env-file=.env.local scripts/_medir-referencia-busqueda.mjs
//   ETAPA=despues node --env-file=.env.local scripts/_medir-referencia-busqueda.mjs

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const REPS = Number(process.env.REPS ?? 3);
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 1200);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Las 6 empresas de Fashion Group (copiadas de REFERENCIA_EMPRESA_KEYS para no
// arrastrar el build de TS a un script suelto; si cambian, este script mide de
// más o de menos y hay que actualizarlo).
const EMPRESAS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
];

// Códigos REALES de los que Daniel pega (los patrón de siempre + su lista de
// modelos del 11-ago). NO son inventados: salen de los diag previos del módulo.
const CODIGOS_50 = [
  "NB2570001", "4G5004G001", "CVM253CR02001", "40HM265032", "4D5029G", "4D5077G",
  "4D5173G", "4D5175G", "4D5179G", "4D5213G", "4D5214G", "4D5221G", "4D5222G",
  "4D5223G", "4D5228G", "4D5231G", "4D5233G", "4D5234G", "4D5235G", "4G5004G",
  "4G5020G", "4G5032G", "4G5002G", "4D4036G", "4D1060G", "4D1138G", "4D1062G",
  "4D1063G", "4D1454G", "4D1455G", "4D1440G", "40HM265", "31KAE22003", "NB2570",
  "CVM253CR02", "4D5030G", "4D5031G", "4D5032G", "4D5033G", "4D5034G", "4D5035G",
  "4D5036G", "4D5037G", "4D5038G", "4D5039G", "4D5040G", "4D5041G", "4D5042G",
  "4D5043G", "4D5044G",
];
const CASOS = [
  { nombre: "1 codigo", codigos: CODIGOS_50.slice(0, 1) },
  { nombre: "10 codigos", codigos: CODIGOS_50.slice(0, 10) },
  { nombre: "50 codigos", codigos: CODIGOS_50.slice(0, 50) },
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aplica el MISMO filtro que el route: 1 código = .like; varios = .or de likes. */
function conFiltro(sel, codigos, campo) {
  if (codigos.length === 1) return sel.like(campo, `${codigos[0]}%`);
  return sel.or(codigos.map((c) => `${campo}.like.${c}*`).join(","));
}

async function cronometrar(fn) {
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  if (r?.error) throw new Error(r.error.message);
  return { ms, filas: r?.data?.length ?? r?.count ?? 0 };
}

/** Pre-conteo del route: count exact + head sobre switch_articulo_diario. */
const conteo = (codigos) =>
  cronometrar(() =>
    conFiltro(
      db.from("switch_articulo_diario").select("codigo", { count: "exact", head: true }).in("empresa_key", EMPRESAS),
      codigos,
      "codigo",
    ),
  );

/** Primera página de cada una de las 3 fuentes (lo que domina la lectura). */
const ventas = (codigos) =>
  cronometrar(() =>
    conFiltro(
      db
        .from("switch_articulo_diario")
        .select("empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total")
        .in("empresa_key", EMPRESAS),
      codigos,
      "codigo",
    )
      .order("id", { ascending: true })
      .range(0, 999),
  );

const ingresos = (codigos) =>
  cronometrar(() =>
    conFiltro(
      db
        .from("switch_ingresos_mercancia")
        .select("empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif")
        .in("empresa_key", EMPRESAS),
      codigos,
      "codigo_articulo",
    )
      .order("fecha", { ascending: true })
      .order("empresa_key", { ascending: true })
      .order("n_interno", { ascending: true })
      .order("linea", { ascending: true })
      .range(0, 999),
  );

const info = (codigos) =>
  cronometrar(() =>
    conFiltro(
      db
        .from("switch_articulo_info")
        .select("empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at")
        .in("empresa_key", EMPRESAS),
      codigos,
      "codigo",
    )
      .order("codigo", { ascending: true })
      .order("empresa_key", { ascending: true })
      .range(0, 999),
  );

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

mkdirSync(SALIDA, { recursive: true });
const filas = [];

// ── Sonda de diagnóstico: LIKE por prefijo vs igualdad exacta ────────────────
// Mismo código, mismas filas. La diferencia es el índice.
console.error(`\n── Sonda índice (LIKE 'X%' vs = 'X') — ${ETAPA} ──`);
for (const codigo of ["NB2570001", "4G5004G001", "40HM265032"]) {
  const like = [];
  const eq = [];
  for (let i = 0; i < REPS; i++) {
    like.push(
      (
        await cronometrar(() =>
          db
            .from("switch_articulo_diario")
            .select("codigo", { count: "exact", head: true })
            .in("empresa_key", EMPRESAS)
            .like("codigo", `${codigo}%`),
        )
      ).ms,
    );
    await dormir(PAUSA_MS);
    eq.push(
      (
        await cronometrar(() =>
          db
            .from("switch_articulo_diario")
            .select("codigo", { count: "exact", head: true })
            .in("empresa_key", EMPRESAS)
            .eq("codigo", codigo),
        )
      ).ms,
    );
    await dormir(PAUSA_MS);
  }
  const mLike = Math.round(mediana(like));
  const mEq = Math.round(mediana(eq));
  console.error(
    `  ${codigo.padEnd(14)} LIKE ${String(mLike).padStart(6)} ms · = ${String(mEq).padStart(6)} ms · ×${(mLike / mEq).toFixed(1)}`,
  );
  filas.push({ etapa: ETAPA, sonda: "indice", codigo, likeMs: mLike, eqMs: mEq });
}

// ── La búsqueda real, 1 / 10 / 50 ───────────────────────────────────────────
console.error(`\n── Búsqueda real (mediana de ${REPS}) — ${ETAPA} ──`);
for (const caso of CASOS) {
  const acum = { conteo: [], ventas: [], ingresos: [], info: [], total: [] };
  let filasVentas = 0;
  for (let i = 0; i < REPS; i++) {
    const c = await conteo(caso.codigos);
    await dormir(PAUSA_MS);
    // El route dispara las 3 en Promise.all: el costo que el usuario siente es
    // el conteo + la MÁS LENTA de las tres, no la suma.
    const v = await ventas(caso.codigos);
    await dormir(PAUSA_MS);
    const g = await ingresos(caso.codigos);
    await dormir(PAUSA_MS);
    const n = await info(caso.codigos);
    await dormir(PAUSA_MS);
    filasVentas = v.filas;
    acum.conteo.push(c.ms);
    acum.ventas.push(v.ms);
    acum.ingresos.push(g.ms);
    acum.info.push(n.ms);
    acum.total.push(c.ms + Math.max(v.ms, g.ms, n.ms));
  }
  const r = {
    etapa: ETAPA,
    caso: caso.nombre,
    codigos: caso.codigos.length,
    conteoMs: Math.round(mediana(acum.conteo)),
    ventasMs: Math.round(mediana(acum.ventas)),
    ingresosMs: Math.round(mediana(acum.ingresos)),
    infoMs: Math.round(mediana(acum.info)),
    totalMs: Math.round(mediana(acum.total)),
    filasVentas,
  };
  filas.push(r);
  console.error(
    `  ${caso.nombre.padEnd(11)} conteo ${String(r.conteoMs).padStart(6)} ms · ventas ${String(r.ventasMs).padStart(6)} ms · ` +
      `ingresos ${String(r.ingresosMs).padStart(5)} ms · info ${String(r.infoMs).padStart(5)} ms → TOTAL ${String(r.totalMs).padStart(6)} ms`,
  );
}

writeFileSync(path.join(SALIDA, `referencia-busqueda-${ETAPA}.json`), JSON.stringify(filas, null, 2));
console.error(`\nJSON en ${SALIDA}/referencia-busqueda-${ETAPA}.json`);
