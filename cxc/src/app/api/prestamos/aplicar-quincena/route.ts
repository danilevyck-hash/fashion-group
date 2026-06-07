// ─────────────────────────────────────────────────────────────────────────────
// POST /api/prestamos/aplicar-quincena
//
// Aplica la deducción quincenal a TODOS los empleados elegibles en una sola
// transacción atómica vía RPC prestamos_aplicar_quincena. La RPC auto-selecciona
// elegibles (activo, deducción>0, saldo>0, no deducidos en la quincena), capea a
// saldo en la última cuota y devuelve un resumen. Sin doble cobro por retry.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { getQuincenaRangePanama } from "@/lib/prestamos-quincena";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "contabilidad"];

interface AplicarSummary {
  aplicados: { empleado_id: string; nombre: string; monto: number; ajustado: boolean }[];
  omitidos: { empleado_id: string; nombre: string; razon: string }[];
  total: number;
  count_aplicados: number;
  count_omitidos: number;
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session || !ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { start, end, fecha } = getQuincenaRangePanama();

  const { data, error } = await supabaseServer.rpc("prestamos_aplicar_quincena", {
    p_quincena_start: start,
    p_quincena_end: end,
    p_fecha: fecha,
  });

  if (error) {
    console.error("[aplicar-quincena] rpc error:", error.message);
    return NextResponse.json({ error: "No se pudo aplicar la quincena. Intenta de nuevo." }, { status: 500 });
  }

  const summary = data as AplicarSummary;
  await logActivity(
    session.role,
    "prestamo_aplicar_quincena",
    "prestamos",
    { count_aplicados: summary?.count_aplicados ?? 0, total: summary?.total ?? 0, count_omitidos: summary?.count_omitidos ?? 0 },
    session.userName,
  );

  return NextResponse.json(summary);
}
