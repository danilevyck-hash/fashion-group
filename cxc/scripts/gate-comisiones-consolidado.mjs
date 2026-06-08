// GATE del sprint "Comisiones consolidado":
// ¿Casan EXACTO los nombres de vendedor entre las 5 empresas B2B (menos Joystep)
// en 2 meses reales? Si sí → pivot client-side por nombre es seguro.
// Si no → promover a RPC consolidada con vendedor_id estable.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local vive en el worktree principal (los worktrees comparten credenciales).
const envPath = process.argv[2] || `${process.env.HOME}/Code/fashion-group/cxc/.env.local`;
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear"];
const PERIODOS = [
  { year: 2026, mes: 4, label: "Abril 2026" },
  { year: 2026, mes: 5, label: "Mayo 2026" },
];

const norm = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

// Levenshtein: detecta el caso real que rompe el pivot exacto — un MISMO vendedor
// escrito casi-igual entre empresas (typo i↔y, acentos, etc.). La igualdad exacta
// NO lo ve porque normalizan a claves distintas; aquí sí.
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

let anyMismatch = false;

for (const per of PERIODOS) {
  console.log(`\n===== ${per.label} =====`);
  const porEmpresa = {};
  for (const empresa of EMPRESAS) {
    const { data, error } = await sb.rpc("comision_b2b_v4", {
      p_empresa_key: empresa,
      p_year: per.year,
      p_mes: per.mes,
    });
    if (error) {
      console.log(`  [ERROR] ${empresa}: ${error.message}`);
      porEmpresa[empresa] = [];
      continue;
    }
    const vendedores = (data?.vendedores ?? []).map((v) => v.vendedor);
    porEmpresa[empresa] = vendedores;
    console.log(`  ${empresa}: ${vendedores.length} vendedores`);
  }

  // Construir índice: nombre-normalizado -> { variantesExactas:Set, empresas:Set }
  const idx = new Map();
  for (const empresa of EMPRESAS) {
    for (const raw of porEmpresa[empresa]) {
      const k = norm(raw);
      if (!idx.has(k)) idx.set(k, { variantes: new Set(), empresas: new Set() });
      const e = idx.get(k);
      e.variantes.add(raw);
      e.empresas.add(empresa);
    }
  }

  // 1) Mismo vendedor (normalizado) escrito DISTINTO entre empresas → rompe pivot exacto.
  const variantesDistintas = [...idx.entries()].filter(([, v]) => v.variantes.size > 1);
  if (variantesDistintas.length) {
    anyMismatch = true;
    console.log(`  ⚠️ ${variantesDistintas.length} vendedor(es) con grafía DISTINTA entre empresas:`);
    for (const [k, v] of variantesDistintas) {
      console.log(`     "${k}" → variantes: ${[...v.variantes].map((x) => JSON.stringify(x)).join(", ")}`);
    }
  } else {
    console.log("  ✅ Cero grafías divergentes (los que coinciden normalizados coinciden EXACTO).");
  }

  // 2) ¿Hay nombres que normalizados colapsarían pero exacto NO? (whitespace/caso)
  //    Detecta diferencias que un pivot por string exacto partiría en filas distintas.
  const exactSet = new Set();
  for (const empresa of EMPRESAS) for (const raw of porEmpresa[empresa]) exactSet.add(raw);
  const colapsanPorNorm = [...idx.values()].filter((v) => v.variantes.size > 1).length;
  console.log(`  Distintos por string EXACTO: ${exactSet.size} | distintos por nombre normalizado: ${idx.size} | colapsos: ${colapsanPorNorm}`);

  // 3) Pares casi-iguales en DISTINTAS empresas → mismo humano, grafía divergente.
  //    Este es el chequeo que captura REINALDO vs REYNALDO. Ignora "DEFAULT" (centinela).
  const empOf = (raw) => EMPRESAS.filter((e) => porEmpresa[e].some((r) => norm(r) === norm(raw)));
  const reales = [...exactSet].filter((n) => norm(n) !== "default");
  const sospechas = [];
  for (let i = 0; i < reales.length; i++)
    for (let j = i + 1; j < reales.length; j++) {
      const d = lev(norm(reales[i]), norm(reales[j]));
      if (d > 0 && d <= 2) {
        const e1 = empOf(reales[i]), e2 = empOf(reales[j]);
        const cross = e1.some((e) => !e2.includes(e)) || e2.some((e) => !e1.includes(e));
        if (cross) sospechas.push([reales[i], e1, reales[j], e2, d]);
      }
    }
  if (sospechas.length) {
    anyMismatch = true;
    console.log(`  ❌ ${sospechas.length} par(es) MISMO vendedor con grafía divergente entre empresas:`);
    for (const [a, ea, b, eb, d] of sospechas)
      console.log(`     d=${d}: ${JSON.stringify(a)} [${ea.join(",")}]  <≈>  ${JSON.stringify(b)} [${eb.join(",")}]`);
  } else {
    console.log("  ✅ Sin pares casi-iguales cruzando empresas.");
  }
}

console.log(`\n===== VEREDICTO GATE =====`);
if (anyMismatch) {
  console.log("❌ NO casan exacto: hay vendedores con grafía divergente entre empresas.");
  console.log("   → El pivot por nombre los partiría en filas duplicadas. Promover a RPC con vendedor_id.");
  process.exit(2);
} else {
  console.log("✅ CASAN EXACTO en los 2 meses: pivot client-side por nombre es seguro. Proceder con V1.");
  process.exit(0);
}
