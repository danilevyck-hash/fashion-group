// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/estado-cuenta/[codigo]?empresa={empresaKey|todas}
//
// Estado de cuenta del cliente SIN ir a Switch: lista los DOCUMENTOS con saldo
// (saldo <> 0) desde la tabla base switch_estadocuenta ya sincronizada. Agrupa
// por empresa, aplica el signo por tipo de comprobante y devuelve subtotales +
// total. El total cuadra AL CENTAVO con el saldo que muestra la lista CXC porque
// usa el MISMO signo agregado que la vista switch_estadocuenta_aging.
//
// [codigo] = código Switch Soft (ej. "D-122").
// empresa: si es una empresa válida → solo esa; "todas"/ausente → todas las B2B.
//          Un vendedor queda forzado a su empresa asociada (fg_users, no cookie).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { EMPRESA_KEY_TO_NAME, SWITCH_ESTADOCUENTA_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

// Signo por tipo de comprobante — IDÉNTICO a la vista switch_estadocuenta_aging
// (migración ...signo_defensivo): débito suma, crédito resta, desconocido = 0
// (neutral, no infla CXC). El API entrega `saldo` siempre positivo; el signo se
// aplica acá. Un SUM(saldo) pelado NO cuadraría con la lista CXC.
const CREDITO = new Set(["Nota de Crédito", "Recibo", "Recibo Saldo Anterior"]);
const DEBITO = new Set(["Factura", "Nota de Débito", "Saldo Anterior", "Transacción", "Tiquete"]);
function signo(tipo: string): number {
  if (CREDITO.has(tipo)) return -1;
  if (DEBITO.has(tipo)) return 1;
  return 0;
}

interface DocRow {
  empresa_key: string;
  secuencial: string | null;
  numero_fiscal: string | null;
  tipo_comprobante: string | null;
  fecha_creacion: string | null;
  total: number | string | null;
  saldo: number | string | null;
  dias: number | null;
}

interface DocOut {
  numero: string;
  fecha: string | null;
  tipo: string;
  monto: number;
  saldo: number; // con signo (crédito negativo)
  dias: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  const empresaParam = req.nextUrl.searchParams.get("empresa") ?? "";
  const isTodas = !empresaParam || empresaParam === "todas" || empresaParam === "all";

  // Vendedor: forzar su empresa asociada (fuente de verdad: DB, no la cookie).
  let empresas: string[];
  if (auth.role === "vendedor" && auth.userId) {
    const { data: u } = await supabaseServer
      .from("fg_users")
      .select("associated_company")
      .eq("id", auth.userId)
      .maybeSingle();
    const asociada = u?.associated_company ?? null;
    empresas = asociada ? [asociada] : [...SWITCH_ESTADOCUENTA_EMPRESA_KEYS];
  } else if (isTodas) {
    empresas = [...SWITCH_ESTADOCUENTA_EMPRESA_KEYS];
  } else {
    if (!(SWITCH_ESTADOCUENTA_EMPRESA_KEYS as readonly string[]).includes(empresaParam)) {
      return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
    }
    empresas = [empresaParam];
  }

  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select("empresa_key, secuencial, numero_fiscal, tipo_comprobante, fecha_creacion, total, saldo, dias")
    .eq("cliente_codigo", codigo)
    .in("empresa_key", empresas)
    .neq("saldo", 0)
    .order("fecha_creacion", { ascending: true });

  if (error) {
    console.error(`[cxc/estado-cuenta] ${error.message}`);
    return NextResponse.json({ error: "Error al leer estado de cuenta" }, { status: 500 });
  }

  // Agrupar por empresa, aplicar signo, subtotales + total.
  const grupos = new Map<string, { empresa_key: string; empresa_nombre: string; documentos: DocOut[]; subtotal: number }>();
  let total = 0;
  for (const r of (data ?? []) as DocRow[]) {
    const tipo = r.tipo_comprobante ?? "";
    const s = signo(tipo) * num(r.saldo);
    total += s;
    if (!grupos.has(r.empresa_key)) {
      grupos.set(r.empresa_key, {
        empresa_key: r.empresa_key,
        empresa_nombre: EMPRESA_KEY_TO_NAME[r.empresa_key] ?? r.empresa_key,
        documentos: [],
        subtotal: 0,
      });
    }
    const g = grupos.get(r.empresa_key)!;
    g.documentos.push({
      numero: r.secuencial || r.numero_fiscal || "—",
      fecha: r.fecha_creacion,
      tipo,
      monto: round(num(r.total)),
      saldo: round(s),
      dias: r.dias,
    });
    g.subtotal += s;
  }

  const empresasOut = [...grupos.values()]
    .map((g) => ({ ...g, subtotal: round(g.subtotal) }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return NextResponse.json({
    codigo,
    empresas: empresasOut,
    total: round(total),
    generadoEn: new Date().toISOString(),
  });
}
