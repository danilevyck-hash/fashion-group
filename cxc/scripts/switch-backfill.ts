/**
 * Backfill multi-empresa Switch.
 *
 *   - FACTURAS: mes por mes desde 2025-05 hasta el mes anterior al actual, por
 *     cada empresa con facturas=true (6 B2B + Boston). → switch_facturas
 *   - CXC: refresh completo del estado de cuenta (snapshot, sin meses) por cada
 *     empresa con cxc=true (6 B2B + Multifashion). → switch_estadocuenta
 *
 * Multifashion facturas NO se tocan acá (siguen en multifashion_tickets vía
 * scripts/multifashion-backfill.ts).
 *
 * Uso:
 *   npx tsx scripts/switch-backfill.ts                  # facturas + cxc, todas
 *   npx tsx scripts/switch-backfill.ts --tipo=facturas  # solo facturas
 *   npx tsx scripts/switch-backfill.ts --tipo=cxc       # solo CXC
 *   npx tsx scripts/switch-backfill.ts --empresa=vistana
 *   npx tsx scripts/switch-backfill.ts --tipo=facturas --empresa=fashion_wear
 *
 * Pre-requisitos en .env.local: SUPABASE_*, y SWITCH_<EMPRESA>_API_* de cada
 * empresa a sincronizar (ver SWITCH_EMPRESA_ENV_MAP en src/lib/switch-api/empresas.ts).
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
} from "../src/lib/switch-api/sync-empresa";
import {
  empresasConFacturas,
  empresasConCxc,
  isEmpresaKey,
} from "../src/lib/switch-api/empresas";
import type { EmpresaKey } from "../src/lib/empresa-mapping";

const START_YEAR = 2025;
const START_MONTH = 5;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function lastDayOfMonth(y: number, m1: number): number {
  return new Date(y, m1, 0).getDate();
}
/** Mes en curso (1-indexed). El backfill llega "hasta hoy" → incluye este mes,
 *  con hasta capado a la fecha actual (a diferencia del backfill de Multifashion
 *  que paraba en el mes anterior). */
function currentMonth(now: Date): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function parseArgs(): { tipo: "facturas" | "cxc" | "all"; empresa: EmpresaKey | null } {
  let tipo: "facturas" | "cxc" | "all" = "all";
  let empresa: EmpresaKey | null = null;
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, "").split("=");
    if (k === "tipo" && (v === "facturas" || v === "cxc" || v === "all")) tipo = v;
    if (k === "empresa") {
      if (!isEmpresaKey(v)) {
        console.error(`empresa inválida: ${v}`);
        process.exit(1);
      }
      empresa = v;
    }
  }
  return { tipo, empresa };
}

async function backfillFacturas(empresas: EmpresaKey[], end: { year: number; month: number }, hoy: string): Promise<void> {
  console.log(`\n========== FACTURAS → switch_facturas ==========`);
  for (const empresaKey of empresas) {
    console.log(`\n--- ${empresaKey} ---`);
    let y = START_YEAR;
    let m = START_MONTH;
    let totIns = 0, totUpd = 0, totSkip = 0, totMs = 0, ok = 0, fail = 0;
    while (y < end.year || (y === end.year && m <= end.month)) {
      const ym = `${y}-${pad(m)}`;
      const desde = `${y}-${pad(m)}-01`;
      const finMes = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
      // Mes en curso: capar hasta a hoy (no traer fechas futuras).
      const hasta = finMes > hoy ? hoy : finMes;
      try {
        const r = await syncEmpresaFacturas(empresaKey, { desde, hasta, triggeredBy: "backfill" });
        console.log(`[${empresaKey} ${ym}] ins=${r.inserted} upd=${r.updated} skip=${r.skipped} ${(r.durationMs / 1000).toFixed(1)}s`);
        totIns += r.inserted; totUpd += r.updated; totSkip += r.skipped; totMs += r.durationMs; ok++;
      } catch (err) {
        console.error(`[${empresaKey} ${ym}] FALLÓ: ${err instanceof Error ? err.message : String(err)}`);
        fail++;
      }
      m++; if (m > 12) { m = 1; y++; }
    }
    console.log(`  → ${empresaKey}: meses ok=${ok} fail=${fail} | ins=${totIns} upd=${totUpd} skip=${totSkip} | ${(totMs / 1000).toFixed(1)}s`);
  }
}

async function backfillCxc(empresas: EmpresaKey[]): Promise<void> {
  console.log(`\n========== CXC → switch_estadocuenta ==========`);
  for (const empresaKey of empresas) {
    console.log(`\n--- ${empresaKey} (estado de cuenta) ---`);
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const r = await syncEmpresaEstadoCuenta(empresaKey, { desde: hoy, hasta: hoy, triggeredBy: "backfill" });
      console.log(`  → ${empresaKey}: ins=${r.inserted} upd=${r.updated} skip=${r.skipped} | ${(r.durationMs / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  → ${empresaKey} FALLÓ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const { tipo, empresa } = parseArgs();
  const now = new Date();
  const end = currentMonth(now);
  const hoy = now.toISOString().slice(0, 10);

  console.log(`=== Switch Backfill ===`);
  console.log(`tipo=${tipo} empresa=${empresa ?? "(todas)"} hoy=${hoy} (incluye mes en curso, hasta=${hoy})`);

  if (tipo === "facturas" || tipo === "all") {
    const list = empresa ? [empresa].filter((e) => empresasConFacturas().includes(e)) : empresasConFacturas();
    if (list.length === 0) console.log("(sin empresas con facturas para el filtro dado)");
    else await backfillFacturas(list, end, hoy);
  }

  if (tipo === "cxc" || tipo === "all") {
    const list = empresa ? [empresa].filter((e) => empresasConCxc().includes(e)) : empresasConCxc();
    if (list.length === 0) console.log("(sin empresas con CXC para el filtro dado)");
    else await backfillCxc(list);
  }

  console.log("\n=== fin ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
