import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

const GUIAS_ROLES = ["admin", "secretaria", "bodega", "director", "vendedor"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !GUIAS_ROLES.includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(bultos, facturas, cliente)")
    .eq("deleted", false)
    .order("numero", { ascending: false });

  /* monto_total and estado come from the DB columns directly */

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const result = (data || []).map((g) => ({
    ...g,
    total_bultos: (g.guia_items || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0),
    item_count: (g.guia_items || []).length,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !GUIAS_ROLES.includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado, firma_transportista, entregado_por } = body;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "La guía debe tener al menos un item" }, { status: 400 });
  }
  const totalBultos = items.reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0);
  if (totalBultos === 0) {
    return NextResponse.json({ error: "La guía debe tener al menos un item con bultos > 0" }, { status: 400 });
  }

  // Auto-increment numero with retry for race conditions (UNIQUE constraint)
  let guia: Record<string, unknown> | null = null;
  let guiaErr: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabaseServer
      .from("guia_transporte")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .single();

    const numero = (last?.numero || 0) + 1;

    const insertData: Record<string, unknown> = { numero, fecha, transportista, placa: placa || null, observaciones: observaciones || null, monto_total: monto_total || 0, estado: estado || "Pendiente Bodega", entregado_por: entregado_por || null };
    if (firma_transportista) insertData.firma_transportista = firma_transportista;

    const { data, error } = await supabaseServer
      .from("guia_transporte")
      .insert(insertData)
      .select()
      .single();

    if (!error) {
      guia = data;
      guiaErr = null;
      break;
    }
    // Retry on unique constraint violation (code 23505)
    if (error.message?.includes("unique") || error.message?.includes("duplicate") || error.message?.includes("23505")) {
      continue;
    }
    guiaErr = error;
    break;
  }

  if (guiaErr || !guia) return NextResponse.json({ error: guiaErr?.message || "Error al crear guía" }, { status: 500 });

  if (items && items.length > 0) {
    const rows = items.map((item: Record<string, unknown>, i: number) => ({
      guia_id: guia.id,
      orden: i + 1,
      cliente: item.cliente || "",
      direccion: item.direccion || "",
      empresa: item.empresa || "",
      facturas: item.facturas || "",
      bultos: item.bultos || 0,
      numero_guia_transp: item.numero_guia_transp || "",
    }));

    const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_create", "guias", { guiaId: guia.id, numero: guia.numero }, session?.userName);
  return NextResponse.json(guia);
}
