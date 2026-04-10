import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const PRESTAMOS_ROLES = ["admin", "contabilidad"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, PRESTAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  // Get active employees with their movements
  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  // Filter to only employees with pending balance
  const result = (data || []).filter((emp) => {
    const movs = emp.prestamos_movimientos || [];
    const prestado = movs
      .filter((m: { concepto: string; estado: string }) => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    const pagado = movs
      .filter((m: { concepto: string; estado: string }) => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    return prestado - pagado > 0;
  });

  return NextResponse.json(result);
}
