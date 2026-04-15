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

export async function POST(req: NextRequest) {
  const auth = requireRole(req, WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, items, indexRows } = body as {
    numeroPL: string;
    empresa: string;
    fechaEntrega: string;
    totalBultos: number;
    totalPiezas: number;
    items?: PLIndexRow[];
    indexRows?: PLIndexRow[];
  };
  const plItems = items || indexRows || [];

  if (!numeroPL) {
    return NextResponse.json({ error: "Número de PL requerido" }, { status: 400 });
  }
  if (!plItems || !Array.isArray(plItems) || plItems.length === 0) {
    return NextResponse.json({ error: "El packing list debe tener al menos un item" }, { status: 400 });
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
    console.error(plErr);
    return NextResponse.json({ error: plErr?.message || "Error al crear packing list" }, { status: 500 });
  }

  // Insert items
  const rows = plItems.map((item: PLIndexRow, i: number) => ({
    pl_id: pl.id,
    estilo: item.estilo,
    producto: item.producto,
    total_pcs: item.totalPcs,
    bultos: item.distribution,
    bulto_muestra: item.bultoMuestra,
  }));

  const { error: itemsErr } = await supabaseServer.from("pl_items").insert(rows);
  if (itemsErr) {
    console.error(itemsErr);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  await logActivity(
    auth.role,
    "packing_list_create",
    "packing_lists",
    { plId: pl.id, numeroPL },
    auth.userName,
  );

  return NextResponse.json(pl);
}
