/**
 * Diagnóstico read-only: ¿hasta qué mes está al día CADA empresa, y con qué
 * dato se puede afirmar?
 *
 * Mide las DOS fuentes del módulo de Gastos, mes por mes y empresa por empresa:
 *   · `mayor_lineas`  (fuente "mayor")   — gasto = grupo 6, y el asiento de
 *      CIERRE es lo que distingue un mes cerrado de uno empezado.
 *   · `egresos_varios` (fuente "egresos") — lo que salió de caja y banco.
 *
 * Contesta tres cosas:
 *   1. ¿Cuál de las dos cuadra con la tabla medida por el coordinador?
 *      (vistana julio · fashion_wear mayo · fashion_shoes abril ·
 *       active_wear abril · el resto sin nada)
 *   2. ¿Se puede DISTINGUIR "mes empezado" de "mes completo" con el dato?
 *      Fashion Wear tiene $27 en abril y $257 en mayo viniendo de $6.483 en
 *      enero: si eso no se puede afirmar, no se inventa un semáforo.
 *   3. ¿Qué empresas no tienen NADA? (no se muestran en $0)
 *
 * Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-gastos-al-dia.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { ALL_EMPRESA_KEYS } from "../src/lib/empresa-mapping";
import { esAsientoDeCierre, esGasto } from "../src/lib/mayor/gastos";

const usd = (cent: number) => (cent / 100).toLocaleString("es-PA", { minimumFractionDigits: 2 });
const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);

interface LineaMayor {
  empresa_key: string; mes: string; descripcion: string | null;
  cuenta: string; debito: string | number | null; credito: string | number | null;
}
interface LineaEgreso {
  empresa_key: string; mes: string; cuenta: string; total: string | number | null;
}

async function main() {
  // ── 1. El mayor ────────────────────────────────────────────────────────────
  const mayor = await leerTodoPaginado<LineaMayor>("mayor_lineas (diag)", (c, d, h) =>
    supabaseServer
      .from("mayor_lineas")
      .select("empresa_key, mes, descripcion, cuenta, debito, credito", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(d, h),
  );

  // ── 2. Los egresos varios ──────────────────────────────────────────────────
  const egresos = await leerTodoPaginado<LineaEgreso>("egresos_varios (diag)", (c, d, h) =>
    supabaseServer
      .from("egresos_varios")
      .select("empresa_key, mes, cuenta, total", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(d, h),
  );

  console.log(`mayor_lineas: ${mayor.length} filas · egresos_varios: ${egresos.length} filas\n`);

  // ── Mayor: por empresa × mes ───────────────────────────────────────────────
  interface Celda { gastoCent: number; lineas: number; lineasGasto: number; cerrado: boolean }
  const mMayor = new Map<string, Map<string, Celda>>();
  for (const l of mayor) {
    const mes = String(l.mes).slice(0, 7);
    const porMes = mMayor.get(l.empresa_key) ?? new Map<string, Celda>();
    const c = porMes.get(mes) ?? { gastoCent: 0, lineas: 0, lineasGasto: 0, cerrado: false };
    c.lineas += 1;
    if (esGasto(l.cuenta)) {
      c.lineasGasto += 1;
      c.gastoCent += cent(l.debito) - cent(l.credito);
    }
    if (esAsientoDeCierre({ descripcion: l.descripcion ?? "", mes })) c.cerrado = true;
    porMes.set(mes, c);
    mMayor.set(l.empresa_key, porMes);
  }

  // ── Egresos: por empresa × mes ─────────────────────────────────────────────
  const mEgr = new Map<string, Map<string, { gastoCent: number; renglones: number }>>();
  for (const l of egresos) {
    const mes = String(l.mes).slice(0, 7);
    const porMes = mEgr.get(l.empresa_key) ?? new Map<string, { gastoCent: number; renglones: number }>();
    const c = porMes.get(mes) ?? { gastoCent: 0, renglones: 0 };
    c.renglones += 1;
    if (esGasto(l.cuenta)) c.gastoCent += cent(l.total);
    porMes.set(mes, c);
    mEgr.set(l.empresa_key, porMes);
  }

  const todosLosMeses = [
    ...new Set([
      ...[...mMayor.values()].flatMap((m) => [...m.keys()]),
      ...[...mEgr.values()].flatMap((m) => [...m.keys()]),
    ]),
  ].sort();

  for (const [titulo, mapa, cerradoDe] of [
    ["MAYOR (grupo 6)", mMayor, true],
    ["EGRESOS VARIOS (grupo 6)", mEgr, false],
  ] as const) {
    console.log(`\n══ ${titulo} ══════════════════════════════════════════`);
    console.log(`empresa`.padEnd(22) + todosLosMeses.map((m) => m.slice(5).padStart(12)).join("") + "   último");
    for (const emp of ALL_EMPRESA_KEYS) {
      const porMes = (mapa as Map<string, Map<string, { gastoCent: number }>>).get(emp);
      if (!porMes || porMes.size === 0) {
        console.log(emp.padEnd(22) + "  (sin una sola fila)");
        continue;
      }
      const fila = todosLosMeses
        .map((m) => {
          const c = porMes.get(m) as (Celda & { renglones?: number }) | undefined;
          if (!c) return "—".padStart(12);
          const marca = cerradoDe ? (c.cerrado ? " " : "*") : " ";
          return (usd(c.gastoCent) + marca).padStart(12);
        })
        .join("");
      const conMovimiento = [...porMes.keys()].sort();
      const ultimo = conMovimiento[conMovimiento.length - 1];
      const cerrados = cerradoDe
        ? [...(porMes as Map<string, Celda>).entries()].filter(([, c]) => c.cerrado).map(([m]) => m).sort()
        : [];
      const ultimoCerrado = cerrados[cerrados.length - 1] ?? null;
      console.log(
        emp.padEnd(22) + fila +
        `   mov:${ultimo}` + (cerradoDe ? `  cerrado:${ultimoCerrado ?? "—"}` : ""),
      );
    }
    if (cerradoDe) console.log("  (* = mes SIN asiento de cierre → empezado, no cerrado)");
  }

  // ── ¿Se puede afirmar "mes empezado"? La caída contra el propio promedio ───
  console.log("\n══ ¿MES EMPEZADO? caída del último mes contra el promedio de los anteriores ══");
  for (const [titulo, mapa] of [["mayor", mMayor], ["egresos", mEgr]] as const) {
    console.log(`\n  fuente: ${titulo}`);
    for (const emp of ALL_EMPRESA_KEYS) {
      const porMes = (mapa as Map<string, Map<string, { gastoCent: number }>>).get(emp);
      if (!porMes || porMes.size === 0) continue;
      const meses = [...porMes.keys()].sort();
      const ultimo = meses[meses.length - 1];
      const previos = meses.slice(0, -1);
      if (previos.length === 0) { console.log(`    ${emp}: un solo mes, no hay contra qué comparar`); continue; }
      const prom = previos.reduce((a, m) => a + (porMes.get(m)?.gastoCent ?? 0), 0) / previos.length;
      const ult = porMes.get(ultimo)?.gastoCent ?? 0;
      const pct = prom === 0 ? null : Math.round((ult / prom) * 1000) / 10;
      console.log(
        `    ${emp.padEnd(20)} último ${ultimo} = $${usd(ult)}  ·  promedio previos = $${usd(prom)}  ·  ${pct === null ? "s/d" : pct + "% del promedio"}`,
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
