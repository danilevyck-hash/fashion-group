/**
 * Cron multi-empresa Switch.
 *
 * Por defecto (sin params): sincroniza FACTURAS incrementales (ventana 7 días)
 * de todas las empresas con facturas=true (empresasConFacturas() = las 6 B2B +
 * Boston + Multifashion/american_classic). Multifashion SÍ entra acá: su data
 * alimenta switch_facturas (base del tab Multifashion desde fase 2.1b) además de
 * su tabla legacy multifashion_tickets, que su cron propio (/api/cron/
 * multifashion-sync) sigue manteniendo. Vive en ambas a propósito (invariante
 * 🟡-14: nunca sumar las dos fuentes → doble conteo).
 *
 * Query params (todos opcionales):
 *   tipo=facturas|estadocuenta   (default facturas)
 *   empresa=<empresa_key>        sincroniza solo esa empresa
 *   desde=YYYY-MM-DD&hasta=...   override de rango (manual), ambos o ninguno
 *
 * NOTA timing: estadocuenta hace una llamada por cliente (cientos/empresa). Las 6
 * empresas en una sola invocación tardan ~472s y NO caben en maxDuration=300
 * (timeout confirmado en prod: el run monolítico moría a mitad, dejando logs en
 * 'running' y empresas sin sincronizar). Por eso el cron de estadocuenta corre
 * UNA empresa por entrada en vercel.json (?tipo=estadocuenta&empresa=X,
 * escalonadas), cada una 9–124s, holgada bajo 300s. El backfill
 * (scripts/switch-backfill.ts) sigue disponible para corridas manuales masivas.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  type EmpresaSyncResult,
} from "@/lib/switch-api/sync-empresa";
import {
  empresasConFacturas,
  empresasConCxc,
  isEmpresaKey,
} from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  // tipo
  const tipo = sp.get("tipo") ?? "facturas";
  if (tipo !== "facturas" && tipo !== "estadocuenta") {
    return NextResponse.json({ ok: false, error: "tipo inválido (facturas|estadocuenta)" }, { status: 400 });
  }

  // empresa (opcional)
  const empresaParam = sp.get("empresa");
  const universe: EmpresaKey[] = tipo === "facturas" ? empresasConFacturas() : empresasConCxc();
  let empresas: EmpresaKey[];
  if (empresaParam !== null) {
    if (!isEmpresaKey(empresaParam)) {
      return NextResponse.json({ ok: false, error: `empresa inválida: ${empresaParam}` }, { status: 400 });
    }
    if (!universe.includes(empresaParam)) {
      return NextResponse.json(
        { ok: false, error: `empresa ${empresaParam} no tiene sync de tipo ${tipo}` },
        { status: 400 },
      );
    }
    empresas = [empresaParam];
  } else {
    empresas = universe;
  }

  // rango (opcional override)
  const desdeParam = sp.get("desde");
  const hastaParam = sp.get("hasta");
  let desde: string;
  let hasta: string;
  let triggeredBy: "cron" | "manual";
  if ((desdeParam === null) !== (hastaParam === null)) {
    return NextResponse.json({ ok: false, error: "desde y hasta deben venir juntos" }, { status: 400 });
  }
  if (desdeParam !== null && hastaParam !== null) {
    if (!isValidYmd(desdeParam) || !isValidYmd(hastaParam)) {
      return NextResponse.json({ ok: false, error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
    }
    const days = daysBetween(desdeParam, hastaParam);
    if (days < 0) return NextResponse.json({ ok: false, error: "desde > hasta" }, { status: 400 });
    if (days > MAX_RANGE_DAYS) return NextResponse.json({ ok: false, error: `Rango > ${MAX_RANGE_DAYS} días` }, { status: 400 });
    desde = desdeParam;
    hasta = hastaParam;
    triggeredBy = "manual";
  } else {
    desde = panamaDate(-7);
    hasta = panamaDate(0);
    triggeredBy = "cron";
  }

  const results: EmpresaSyncResult[] = [];
  const errors: Array<{ empresaKey: string; error: string }> = [];

  for (const empresaKey of empresas) {
    try {
      const r =
        tipo === "facturas"
          ? await syncEmpresaFacturas(empresaKey, { desde, hasta, triggeredBy })
          : await syncEmpresaEstadoCuenta(empresaKey, { desde, hasta, triggeredBy });
      results.push(r);
    } catch (err: unknown) {
      errors.push({ empresaKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      tipo,
      range: { desde, hasta },
      results,
      errors,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
