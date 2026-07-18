import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

// Guarda el set COMPLETO de gastos de una empresa para un mes (reconciliación).
// OJO: el índice único de empresa_gastos_mensuales es PARCIAL (WHERE anulado_en
// IS NULL) → PostgREST NO permite upsert on_conflict sobre esas columnas; se
// reconcilia con select + update-por-id / insert / soft-anular.

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Las 8 empresas + 'grupo' (gastos compartidos que se prorratean query-time).
const VALID_EMPRESA_KEYS: readonly string[] = [...ALL_EMPRESA_KEYS, "grupo"];

interface ItemInput {
  categoria_id: string;
  monto: number;
  notas: string | null;
}

interface LiveRow {
  id: string;
  categoria_id: string;
  monto: number | string;
  notas: string | null;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Datos inválidos. Recarga la página e intenta de nuevo." }, { status: 400 });
    }

    const empresaKey = typeof body.empresa_key === "string" ? body.empresa_key : "";
    if (!VALID_EMPRESA_KEYS.includes(empresaKey)) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }

    const mes = typeof body.mes === "string" ? body.mes : "";
    if (!MES_RE.test(mes)) {
      return NextResponse.json(
        { error: "Mes inválido. Usa el formato AAAA-MM (ej: 2026-07)." },
        { status: 400 },
      );
    }
    const mesDate = `${mes}-01`;

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "Faltan los renglones de gastos." }, { status: 400 });
    }
    const items: ItemInput[] = [];
    const seenCats = new Set<string>();
    for (const raw of body.items) {
      const categoriaId = raw && typeof raw.categoria_id === "string" ? raw.categoria_id.trim() : "";
      if (!categoriaId) {
        return NextResponse.json({ error: "Cada renglón necesita una categoría." }, { status: 400 });
      }
      if (seenCats.has(categoriaId)) {
        return NextResponse.json({ error: "Hay una categoría repetida en los renglones." }, { status: 400 });
      }
      seenCats.add(categoriaId);
      const monto = Number(raw.monto);
      if (!Number.isFinite(monto) || monto < 0) {
        return NextResponse.json({ error: "Cada monto debe ser un número de 0 o más." }, { status: 400 });
      }
      const notas = typeof raw.notas === "string" && raw.notas.trim() ? raw.notas.trim() : null;
      items.push({ categoria_id: categoriaId, monto: Math.round(monto * 100) / 100, notas });
    }

    // Filas vivas actuales de esa empresa + mes.
    const { data: liveData, error: liveErr } = await supabaseServer
      .from("empresa_gastos_mensuales")
      .select("id, categoria_id, monto, notas")
      .eq("empresa_key", empresaKey)
      .eq("mes", mesDate)
      .is("anulado_en", null);
    if (liveErr) throw new Error(`empresa_gastos_mensuales (lectura): ${liveErr.message}`);
    const live = (liveData ?? []) as LiveRow[];
    const liveByCat = new Map(live.map((r) => [r.categoria_id, r]));

    const nowIso = new Date().toISOString();
    const createdBy = auth.userName ?? auth.role;

    // 1. Update de las filas vivas cuyo monto/notas cambió; insert de las nuevas.
    const toInsert: Record<string, unknown>[] = [];
    for (const it of items) {
      const row = liveByCat.get(it.categoria_id);
      if (row) {
        const changed = Number(row.monto) !== it.monto || (row.notas ?? null) !== it.notas;
        if (!changed) continue;
        const { error } = await supabaseServer
          .from("empresa_gastos_mensuales")
          .update({ monto: it.monto, notas: it.notas, updated_at: nowIso })
          .eq("id", row.id);
        if (error) throw new Error(`empresa_gastos_mensuales (update): ${error.message}`);
      } else {
        toInsert.push({
          empresa_key: empresaKey,
          mes: mesDate,
          categoria_id: it.categoria_id,
          monto: it.monto,
          notas: it.notas,
          created_by: createdBy,
        });
      }
    }
    if (toInsert.length > 0) {
      const { error } = await supabaseServer.from("empresa_gastos_mensuales").insert(toInsert);
      if (error) {
        if (error.code === "23503") {
          return NextResponse.json(
            { error: "Una de las categorías ya no existe. Recarga la página e intenta de nuevo." },
            { status: 400 },
          );
        }
        throw new Error(`empresa_gastos_mensuales (insert): ${error.message}`);
      }
    }

    // 2. Filas vivas que ya no vienen en items → soft-anular.
    const toAnular = live.filter((r) => !seenCats.has(r.categoria_id)).map((r) => r.id);
    if (toAnular.length > 0) {
      const { error } = await supabaseServer
        .from("empresa_gastos_mensuales")
        .update({ anulado_en: nowIso, anulado_motivo: "Reemplazado al guardar" })
        .in("id", toAnular);
      if (error) throw new Error(`empresa_gastos_mensuales (anular): ${error.message}`);
    }

    // Estado final: filas vivas tras el guardado (misma forma que /resumen).
    const { data: finalData, error: finalErr } = await supabaseServer
      .from("empresa_gastos_mensuales")
      .select("id, empresa_key, categoria_id, monto, notas")
      .eq("empresa_key", empresaKey)
      .eq("mes", mesDate)
      .is("anulado_en", null);
    if (finalErr) throw new Error(`empresa_gastos_mensuales (relectura): ${finalErr.message}`);

    const gastos = (finalData ?? []).map((g) => ({
      id: g.id as string,
      empresa_key: g.empresa_key as string,
      categoria_id: g.categoria_id as string,
      monto: Number(g.monto),
      notas: (g.notas ?? null) as string | null,
    }));

    return NextResponse.json({ ok: true, gastos });
  } catch (err) {
    console.error("[gastos-empresa/gastos]", err);
    return NextResponse.json(
      { error: "No se pudo guardar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
