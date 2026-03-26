import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

interface ParsedRow {
  tipo: string;
  cliente: string;
  subtotal: number;
  costo: number;
}

export async function POST(req: NextRequest) {
  const { empresa, año, mes, rows } = await req.json() as { empresa: string; año: number; mes: number; rows: ParsedRow[] };
  if (!empresa || !año || !mes || !rows?.length) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Normalize tipo
  const facturas = rows.filter((r) => r.tipo.trim().replace(/\s+/g, " ") === "Factura");
  const ncs = rows.filter((r) => { const t = r.tipo.trim().replace(/\s+/g, " "); return t.includes("Crédito") || t.includes("Credito"); });
  const nds = rows.filter((r) => { const t = r.tipo.trim().replace(/\s+/g, " "); return t.includes("Débito") || t.includes("Debito"); });

  const ventas_brutas = facturas.reduce((s, r) => s + (r.subtotal || 0), 0);
  const notas_credito = ncs.reduce((s, r) => s + Math.abs(r.subtotal || 0), 0);
  const notas_debito = nds.reduce((s, r) => s + (r.subtotal || 0), 0);
  const costo_total = facturas.reduce((s, r) => s + Math.abs(r.costo || 0), 0);

  // Upsert ventas_mensuales
  const { error: ventasErr } = await supabaseServer
    .from("ventas_mensuales")
    .upsert({ empresa, año, mes, ventas_brutas, notas_credito, notas_debito, costo_total, updated_at: new Date().toISOString() }, { onConflict: "empresa,año,mes" });

  if (ventasErr) return NextResponse.json({ error: ventasErr.message }, { status: 500 });

  // Top clients from facturas
  const clientMap: Record<string, number> = {};
  for (const r of facturas) {
    const name = (r.cliente || "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    clientMap[name] = (clientMap[name] || 0) + (r.subtotal || 0);
  }

  const topClients = Object.entries(clientMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cliente, ventas]) => ({ empresa, año, mes, cliente, ventas }));

  if (topClients.length > 0) {
    // Delete existing clients for this period then insert
    await supabaseServer.from("ventas_clientes").delete().eq("empresa", empresa).eq("año", año).eq("mes", mes);
    await supabaseServer.from("ventas_clientes").insert(topClients);
  }

  return NextResponse.json({
    ok: true,
    summary: { ventas_brutas, notas_credito, notas_debito, costo_total, facturas: facturas.length, ncs: ncs.length, nds: nds.length, clientes: topClients.length },
  });
}
