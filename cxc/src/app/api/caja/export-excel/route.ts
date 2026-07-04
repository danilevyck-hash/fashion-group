import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { exportFilename, workbookBuffer, XLSX_MIME } from "@/lib/excel-export";
import { buildCajaWorkbook } from "@/lib/exports/caja-excel";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { periodo_id } = await req.json();
    if (!periodo_id) return NextResponse.json({ error: "No periodo_id" }, { status: 400 });

    const { data: periodo, error: pErr } = await supabaseServer.from("caja_periodos").select("*").eq("id", periodo_id).single();
    if (pErr || !periodo) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    const { data: gastos } = await supabaseServer.from("caja_gastos").select("*").eq("periodo_id", periodo_id).eq("deleted", false).order("fecha", { ascending: true });

    const wb = buildCajaWorkbook(periodo, gastos || []);
    const buf = workbookBuffer(wb);
    const filename = exportFilename(`CajaMenuda-Periodo${periodo?.numero || ""}`);

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[caja/export-excel] Error:", err);
    return NextResponse.json({ error: "Error al generar el Excel. Intenta de nuevo." }, { status: 500 });
  }
}
