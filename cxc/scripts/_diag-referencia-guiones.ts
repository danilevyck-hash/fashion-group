// Diagnóstico READ-ONLY: ¿existen códigos con GUIÓN FINAL en las fuentes del
// tab Referencia, o el `4D5077G-` que pegó Daniel es un artefacto de su Excel?
//
// La respuesta decide si la búsqueda debe RESPETAR el guión final (son códigos
// reales) o NORMALIZARLO (probar sin él). Se mide, no se asume.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-referencia-guiones.ts
//
// 🔴 NO ESCRIBE NADA. Consultas chicas y SECUENCIALES (no saturar Supabase).

import { createClient } from "@supabase/supabase-js";
import { REFERENCIA_EMPRESA_KEYS, parsearListaCodigos } from "../src/lib/ventas/referencia";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// La lista REAL que pegó Daniel (11-ago-2026), tal cual, duplicados y guiones incluidos.
const LISTA_REAL =
  "4D5029G 4D5029G 4D5077G 4D5077G 4D5077G- 4D5173G 4D5173G 4D5175G 4D5175G 4D5175G 4D5179G 4D5179G 4D5179G " +
  "4D5213G 4D5213G 4D5214G 4D5214G 4D5221G 4D5221G 4D5222G 4D5223G 4D5223G 4D5228G 4D5228G 4D5231G 4D5231G " +
  "4D5231G 4D5233G 4D5234G 4D5235G 4G5004G 4G5004G 4G5004G 4G5020G 4G5032G 4G5032G 4G5032G 4G5032G 4G5002G- " +
  "4G5002G- 4D4036G 4D1060G- 4D1138G- 4D1062G 4D1063G- 4D1454G 4D1455G 4D1440G";

const FUENTES = [
  { tabla: "switch_articulo_info", col: "codigo" },
  { tabla: "switch_articulo_diario", col: "codigo" },
  { tabla: "switch_ingresos_mercancia", col: "codigo_articulo" },
] as const;

async function contar(tabla: string, col: string, patron: string): Promise<number> {
  const { count, error } = await db
    .from(tabla)
    .select(col, { count: "exact", head: true })
    .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS])
    .like(col, patron);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

async function muestras(tabla: string, col: string, patron: string, n = 8): Promise<string[]> {
  const { data, error } = await db
    .from(tabla)
    .select(col)
    .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS])
    .like(col, patron)
    .limit(n);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return [...new Set((data ?? []).map((r) => (r as Record<string, string>)[col]))];
}

async function main() {
  console.log("═══ 1. ¿Existe ALGÚN código que termine en guión, en alguna fuente? ═══");
  for (const f of FUENTES) {
    const n = await contar(f.tabla, f.col, "%-");
    console.log(`  ${f.tabla}.${f.col} LIKE '%-'  →  ${n} filas`);
    if (n > 0) console.log(`    muestras: ${(await muestras(f.tabla, f.col, "%-")).join(", ")}`);
  }

  console.log("\n═══ 2. Los códigos con guión final de la lista de Daniel, con y sin guión ═══");
  const conGuion = ["4D5077G-", "4G5002G-", "4D1060G-", "4D1138G-", "4D1063G-"];
  for (const c of conGuion) {
    const sin = c.slice(0, -1);
    for (const f of FUENTES) {
      const nCon = await contar(f.tabla, f.col, `${c}%`);
      const nSin = await contar(f.tabla, f.col, `${sin}%`);
      if (nCon > 0 || nSin > 0)
        console.log(`  ${c}  en ${f.tabla}: con guión ${nCon} · sin guión ${nSin}`);
    }
  }

  console.log("\n═══ 3. La lista real entera: qué encuentra el PREFIJO (sin guión final) ═══");
  // Se pre-visualiza la normalización propuesta: guión final afuera + dedup.
  const { codigos: crudos } = parsearListaCodigos(LISTA_REAL);
  const codigos = [...new Set(crudos.map((c) => c.replace(/-+$/, "")))];
  console.log(`  códigos únicos parseados (guión final quitado): ${codigos.length}`);
  const sinNada: string[] = [];
  for (const c of codigos) {
    let colores = new Set<string>();
    for (const f of FUENTES) {
      for (const m of await muestras(f.tabla, f.col, `${c}%`, 50)) colores.add(m);
    }
    if (colores.size === 0) sinNada.push(c);
    console.log(`  ${c.padEnd(10)} → ${colores.size} código(s): ${[...colores].sort().join(", ") || "—"}`);
  }
  console.log(`\n  NO encontrados de verdad: ${sinNada.length ? sinNada.join(", ") : "ninguno"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
