import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data: rows, error } = await supabaseServer.from("cxc_rows").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let totalCxc = 0, corriente = 0, vigilancia = 0, vencido = 0;
  const criticalClients = new Set<string>();

  for (const r of rows || []) {
    const total = Number(r.total) || 0;
    const cur = (Number(r.d0_30) || 0) + (Number(r.d31_60) || 0) + (Number(r.d61_90) || 0);
    const watch = Number(r.d91_120) || 0;
    const over = (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0);
    totalCxc += total;
    corriente += cur;
    vigilancia += watch;
    vencido += over;
    if (over > 0) criticalClients.add(r.nombre_normalized);
  }

  const corrientePct = totalCxc > 0 ? (corriente / totalCxc) * 100 : 0;
  const vigilanciaPct = totalCxc > 0 ? (vigilancia / totalCxc) * 100 : 0;
  const vencidoPct = totalCxc > 0 ? (vencido / totalCxc) * 100 : 0;

  const { data: uploads } = await supabaseServer.from("cxc_uploads").select("uploaded_at, company_key").order("uploaded_at", { ascending: false });

  // CAMBIO 4: Count unique companies with data
  const empresasSet = new Set((rows || []).map((r: { company_key: string }) => r.company_key));

  return NextResponse.json({
    totalCxc,
    vencidoMas121: vencido,
    clientesCriticos: criticalClients.size,
    corrientePct: Math.round(corrientePct),
    vigilanciaPct: Math.round(vigilanciaPct),
    vencidoPct: Math.round(vencidoPct),
    lastUpload: uploads?.[0]?.uploaded_at || null,
    lastUploadEmpresa: uploads?.[0]?.company_key || null,
    empresasCount: empresasSet.size,
  });
}
