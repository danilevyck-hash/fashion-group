/**
 * Diagnóstico READ-ONLY: qué cuentas de `egresos_varios` no tienen nombre.
 *
 * No escribe nada, no toca Switch. Cruza los códigos de cuenta que trae el
 * reporte de Egresos Varios contra los nombres que ya están guardados en
 * `mayor_lineas.cuenta_nombre` (lo poco que la contadora cerró) y contra
 * `cuentas_contables` si la tabla ya existe.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-cuentas-sin-nombre.ts [empresa_key]
 */

import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function todo<T>(tabla: string, sel: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from(tabla).select(sel).order("id", { ascending: true }).range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return out;
}

async function main() {
  const empresaFiltro = process.argv[2] ?? null;

  // 1) Nombres que YA tenemos del mayor.
  const may = await todo<{ empresa_key: string; cuenta: string; cuenta_nombre: string | null }>(
    "mayor_lineas",
    "id, empresa_key, cuenta, cuenta_nombre",
  );
  const nombreMayor = new Map<string, string>();
  for (const l of may) {
    if (l.cuenta_nombre && l.cuenta_nombre.trim()) {
      nombreMayor.set(`${l.empresa_key}|${l.cuenta}`, l.cuenta_nombre.trim());
    }
  }
  console.log(`mayor_lineas: ${may.length} líneas · ${nombreMayor.size} pares (empresa,cuenta) con nombre`);

  // 2) ¿Ya existe el catálogo?
  const cat = await db.from("cuentas_contables").select("empresa_key,cuenta,nombre").limit(5000);
  const nombreCatalogo = new Map<string, string>();
  if (cat.error) {
    console.log(`cuentas_contables: NO existe todavía (${cat.error.code ?? ""} ${cat.error.message})`);
  } else {
    for (const c of cat.data ?? []) nombreCatalogo.set(`${c.empresa_key}|${c.cuenta}`, c.nombre);
    console.log(`cuentas_contables: ${nombreCatalogo.size} cuentas`);
  }

  // 3) Las cuentas que usa Egresos Varios.
  const eg = await todo<{ empresa_key: string; cuenta: string; total: string | number }>(
    "egresos_varios",
    "id, empresa_key, cuenta, total",
  );
  console.log(`egresos_varios: ${eg.length} renglones\n`);

  const porEmpresa = new Map<string, Map<string, { cent: number; n: number }>>();
  for (const e of eg) {
    if (empresaFiltro && e.empresa_key !== empresaFiltro) continue;
    const m = porEmpresa.get(e.empresa_key) ?? new Map();
    const prev = m.get(e.cuenta) ?? { cent: 0, n: 0 };
    prev.cent += Math.round(Number(e.total) * 100);
    prev.n += 1;
    m.set(e.cuenta, prev);
    porEmpresa.set(e.empresa_key, m);
  }

  let totalSin = 0;
  let centSin = 0;
  for (const [emp, cuentas] of [...porEmpresa].sort()) {
    const filas = [...cuentas].map(([cuenta, v]) => ({
      cuenta,
      ...v,
      nombre: nombreCatalogo.get(`${emp}|${cuenta}`) ?? nombreMayor.get(`${emp}|${cuenta}`) ?? null,
    }));
    const con = filas.filter((f) => f.nombre);
    const sin = filas.filter((f) => !f.nombre).sort((a, b) => b.cent - a.cent);
    totalSin += sin.length;
    centSin += sin.reduce((s, f) => s + f.cent, 0);
    console.log(`── ${emp}: ${filas.length} cuentas · ${con.length} CON nombre · ${sin.length} SIN nombre (${usd(sin.reduce((s, f) => s + f.cent, 0))})`);
    for (const f of sin) console.log(`     ${f.cuenta}  ${usd(f.cent).padStart(14)}  ${f.n} pagos`);
  }
  console.log(`\nTOTAL sin nombre: ${totalSin} cuentas · ${usd(centSin)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
