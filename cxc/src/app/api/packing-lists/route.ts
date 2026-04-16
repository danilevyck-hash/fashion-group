import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";
import type { PLIndexRow } from "@/lib/parse-packing-list";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "secretaria", "bodega", "vendedor", "director"];
const WRITE_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, READ_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Save a single PL (reusable by both single and batch)
async function saveSinglePL(
  numeroPL: string,
  empresa: string,
  fechaEntrega: string,
  totalBultos: number,
  totalPiezas: number,
  plItems: PLIndexRow[],
): Promise<{ id: string } | { error: string }> {
  // Delete existing PL with same numero_pl
  const { data: existingPLs } = await supabaseServer
    .from("packing_lists")
    .select("id")
    .eq("numero_pl", numeroPL);

  if (existingPLs && existingPLs.length > 0) {
    for (const old of existingPLs) {
      await supabaseServer.from("pl_items").delete().eq("pl_id", old.id);
      await supabaseServer.from("packing_lists").delete().eq("id", old.id);
    }
  }

  // Insert packing list
  const { data: pl, error: plErr } = await supabaseServer
    .from("packing_lists")
    .insert({
      numero_pl: numeroPL,
      empresa: empresa || null,
      fecha_entrega: fechaEntrega || null,
      total_bultos: totalBultos || 0,
      total_piezas: totalPiezas || 0,
      total_estilos: plItems.length,
    })
    .select()
    .single();

  if (plErr || !pl) {
    return { error: plErr?.message || "Error al crear packing list" };
  }

  // Insert items
  const rows = plItems.map((item: PLIndexRow) => ({
    pl_id: pl.id,
    estilo: item.estilo,
    producto: item.producto,
    total_pcs: item.totalPcs,
    bultos: item.distribution,
    bulto_muestra: item.bultoMuestra,
    is_os: item.isOS || false,
  }));

  const { error: itemsErr } = await supabaseServer.from("pl_items").insert(rows);
  if (itemsErr) {
    return { error: itemsErr.message };
  }

  return { id: pl.id };
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();

  // Batch mode: { packingLists: [...] }
  if (Array.isArray(body.packingLists)) {
    const results: { numeroPL: string; id?: string; error?: string }[] = [];

    for (const pl of body.packingLists) {
      const plItems = pl.items || pl.indexRows || [];
      if (!pl.numeroPL || !plItems.length) {
        results.push({ numeroPL: pl.numeroPL || "?", error: "Datos incompletos" });
        continue;
      }
      const result = await saveSinglePL(
        pl.numeroPL, pl.empresa, pl.fechaEntrega,
        pl.totalBultos, pl.totalPiezas, plItems,
      );
      if ("error" in result) {
        results.push({ numeroPL: pl.numeroPL, error: result.error });
      } else {
        results.push({ numeroPL: pl.numeroPL, id: result.id });
      }
    }

    const saved = results.filter(r => r.id).length;
    const failed = results.filter(r => r.error).length;

    await logActivity(
      auth.role,
      "packing_list_batch_create",
      "packing_lists",
      { count: saved, failed, pls: results.map(r => r.numeroPL) },
      auth.userName,
    );

    return NextResponse.json({ results, totalSaved: saved, totalFailed: failed });
  }

  // Single mode (backward compat)
  const { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, items, indexRows } = body as {
    numeroPL: string; empresa: string; fechaEntrega: string;
    totalBultos: number; totalPiezas: number;
    items?: PLIndexRow[]; indexRows?: PLIndexRow[];
  };
  const plItems = items || indexRows || [];

  if (!numeroPL) {
    return NextResponse.json({ error: "Número de PL requerido" }, { status: 400 });
  }
  if (!plItems || !Array.isArray(plItems) || plItems.length === 0) {
    return NextResponse.json({ error: "El packing list debe tener al menos un item" }, { status: 400 });
  }

  const result = await saveSinglePL(numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, plItems);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logActivity(
    auth.role,
    "packing_list_create",
    "packing_lists",
    { plId: result.id, numeroPL },
    auth.userName,
  );

  return NextResponse.json({ id: result.id });
}
