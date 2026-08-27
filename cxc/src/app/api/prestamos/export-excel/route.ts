import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { filterEmpleadosMovimientos } from "@/lib/prestamos-helpers";
import { workbookBuffer, XLSX_MIME } from "@/lib/excel-export";
import { buildPrestamosWorkbook, type EmpleadoRow } from "@/lib/exports/prestamos-excel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const empresaParam = req.nextUrl.searchParams.get("empresa");
  const empresaFilter = empresaParam && empresaParam !== "all" ? empresaParam : null;

  let query = supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (empresaFilter) query = query.eq("empresa", empresaFilter);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const empleados = filterEmpleadosMovimientos(data) as EmpleadoRow[];

  const wb = buildPrestamosWorkbook(empleados);
  const buf = workbookBuffer(wb);

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const slug = empresaFilter ? empresaFilter.toLowerCase().replace(/\s+/g, "_") : "todos";
  const filename = `historial_prestamos_${slug}_${ymd}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
