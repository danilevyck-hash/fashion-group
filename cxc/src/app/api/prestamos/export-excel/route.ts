import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { filterEmpleadosMovimientos } from "@/lib/prestamos-helpers";
import { workbookBuffer, XLSX_MIME } from "@/lib/excel-export";
import { buildPrestamosWorkbook, type EmpleadoRow } from "@/lib/exports/prestamos-excel";
import { calcularSaldoPrestamo } from "@/lib/prestamos-saldo";

export const dynamic = "force-dynamic";

/**
 * 🔴 «¿Solo los que deben o todos?» — Daniel, 5-sep-2026: *«que esté la opción
 * después de apretar descargar»*.
 *
 * 🩸 Antes salía `.eq("activo", true)` y punto: el historial de las 17 fichas
 * archivadas **no salía en ningún export**, incluidos los $100 de BRICEIDA
 * MONTERO. Y «activo» ni siquiera significaba lo que parecía.
 */
const AMBITOS = ["deben", "todos"] as const;
type Ambito = (typeof AMBITOS)[number];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const ambitoParam = req.nextUrl.searchParams.get("ambito");
  const ambito: Ambito = (AMBITOS as readonly string[]).includes(ambitoParam ?? "")
    ? (ambitoParam as Ambito)
    : "deben";

  const empresaParam = req.nextUrl.searchParams.get("empresa");
  const empresaFilter = empresaParam && empresaParam !== "all" ? empresaParam : null;

  let query = supabaseServer
    .from("prestamos_empleados")
    .select("id, nombre, empresa, deduccion_quincenal, deduccion_dano, prestamos_movimientos(id, fecha, concepto, monto, notas, estado, deleted, cuenta, origen_pago, created_at)")
    // `deleted` es NULLABLE acá: un `.eq("deleted", false)` pierde filas.
    .or("deleted.is.null,deleted.eq.false")
    .order("nombre", { ascending: true });

  if (empresaFilter) query = query.eq("empresa", empresaFilter);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  let empleados = filterEmpleadosMovimientos(data) as EmpleadoRow[];
  if (ambito === "deben") {
    empleados = empleados.filter((e) => calcularSaldoPrestamo(e.prestamos_movimientos || []).saldo > 0);
  }

  const wb = buildPrestamosWorkbook(empleados);
  const buf = workbookBuffer(wb);

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const slug = empresaFilter ? empresaFilter.toLowerCase().replace(/\s+/g, "_") : "todas_las_empresas";
  const filename = `historial_prestamos_${ambito}_${slug}_${ymd}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
