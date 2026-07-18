import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

// Resumen del mes para Gastos de Empresa: categorías activas, gastos vivos del
// mes (incluye 'grupo'), último saldo bancario por empresa y si el mes anterior
// tiene datos (para ofrecer "Copiar mes anterior" en la UI).

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function prevMonth(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

interface GastoRow {
  id: string;
  empresa_key: string;
  categoria_id: string;
  monto: number | string;
  notas: string | null;
}

interface BancoRow {
  empresa_key: string;
  saldo: number | string;
  fecha_dato: string;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const mesParam = req.nextUrl.searchParams.get("mes");
    const mes = mesParam ?? hoyPanama().slice(0, 7);
    if (!MES_RE.test(mes)) {
      return NextResponse.json(
        { error: "Mes inválido. Usa el formato AAAA-MM (ej: 2026-07)." },
        { status: 400 },
      );
    }
    const prevMes = prevMonth(mes);

    const [catsRes, gastosRes, bancosRes, prevRes] = await Promise.all([
      supabaseServer
        .from("gastos_categorias")
        .select("id, nombre, orden, es_fijo, activo")
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true }),
      supabaseServer
        .from("empresa_gastos_mensuales")
        .select("id, empresa_key, categoria_id, monto, notas")
        .eq("mes", `${mes}-01`)
        .is("anulado_en", null),
      supabaseServer
        .from("bancos_saldos")
        .select("empresa_key, saldo, fecha_dato")
        .order("fecha_dato", { ascending: false }),
      supabaseServer
        .from("empresa_gastos_mensuales")
        .select("id", { count: "exact", head: true })
        .eq("mes", `${prevMes}-01`)
        .is("anulado_en", null),
    ]);

    if (catsRes.error) throw new Error(`gastos_categorias: ${catsRes.error.message}`);
    if (gastosRes.error) throw new Error(`empresa_gastos_mensuales: ${gastosRes.error.message}`);
    if (bancosRes.error) throw new Error(`bancos_saldos: ${bancosRes.error.message}`);
    if (prevRes.error) throw new Error(`empresa_gastos_mensuales (mes anterior): ${prevRes.error.message}`);

    const gastos = ((gastosRes.data ?? []) as GastoRow[]).map((g) => ({
      id: g.id,
      empresa_key: g.empresa_key,
      categoria_id: g.categoria_id,
      monto: Number(g.monto),
      notas: g.notas ?? null,
    }));

    // Último saldo por empresa: filas ya ordenadas por fecha_dato desc → la
    // primera aparición de cada empresa es la más reciente.
    const bancos: { empresa_key: string; saldo: number; fecha_dato: string }[] = [];
    const seen = new Set<string>();
    for (const b of (bancosRes.data ?? []) as BancoRow[]) {
      if (seen.has(b.empresa_key)) continue;
      seen.add(b.empresa_key);
      bancos.push({ empresa_key: b.empresa_key, saldo: Number(b.saldo), fecha_dato: b.fecha_dato });
    }

    return NextResponse.json({
      mes,
      categorias: catsRes.data ?? [],
      gastos,
      bancos,
      prevMes,
      prevMesTieneDatos: (prevRes.count ?? 0) > 0,
    });
  } catch (err) {
    console.error("[gastos-empresa/resumen]", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los gastos. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
