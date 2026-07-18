import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Copia TODOS los gastos vivos del mes anterior (todas las empresas, incluido
// 'grupo') al mes indicado, saltando los combos (empresa, categoría) que ya
// tienen fila viva en el mes destino.

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function prevMonth(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

interface PrevRow {
  empresa_key: string;
  categoria_id: string;
  monto: number | string;
  notas: string | null;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    const mes = body && typeof body.mes === "string" ? body.mes : "";
    if (!MES_RE.test(mes)) {
      return NextResponse.json(
        { error: "Mes inválido. Usa el formato AAAA-MM (ej: 2026-07)." },
        { status: 400 },
      );
    }
    const mesDate = `${mes}-01`;
    const prevDate = `${prevMonth(mes)}-01`;

    const [prevRes, targetRes] = await Promise.all([
      supabaseServer
        .from("empresa_gastos_mensuales")
        .select("empresa_key, categoria_id, monto, notas")
        .eq("mes", prevDate)
        .is("anulado_en", null),
      supabaseServer
        .from("empresa_gastos_mensuales")
        .select("empresa_key, categoria_id")
        .eq("mes", mesDate)
        .is("anulado_en", null),
    ]);
    if (prevRes.error) throw new Error(`empresa_gastos_mensuales (mes anterior): ${prevRes.error.message}`);
    if (targetRes.error) throw new Error(`empresa_gastos_mensuales (mes destino): ${targetRes.error.message}`);

    const prevRows = (prevRes.data ?? []) as PrevRow[];
    const existing = new Set(
      (targetRes.data ?? []).map((r) => `${r.empresa_key}|${r.categoria_id}`),
    );

    const createdBy = auth.userName ?? auth.role;
    const toInsert = prevRows
      .filter((r) => !existing.has(`${r.empresa_key}|${r.categoria_id}`))
      .map((r) => ({
        empresa_key: r.empresa_key,
        mes: mesDate,
        categoria_id: r.categoria_id,
        monto: Number(r.monto),
        notas: r.notas ?? null,
        created_by: createdBy,
      }));

    if (toInsert.length > 0) {
      const { error } = await supabaseServer.from("empresa_gastos_mensuales").insert(toInsert);
      if (error) throw new Error(`empresa_gastos_mensuales (insert): ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      copiadas: toInsert.length,
      omitidas: prevRows.length - toInsert.length,
    });
  } catch (err) {
    console.error("[gastos-empresa/copiar-mes]", err);
    return NextResponse.json(
      { error: "No se pudo copiar el mes anterior. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
