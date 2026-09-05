// ─────────────────────────────────────────────────────────────────────────────
// POST /api/prestamos/aplicar-quincena
//
// Aplica la deducción quincenal a TODOS los empleados elegibles en una sola
// transacción atómica vía RPC prestamos_aplicar_quincena. La RPC auto-selecciona
// elegibles (activo, deducción>0, saldo>0, no deducidos en la quincena), capea a
// saldo en la última cuota y devuelve un resumen. Sin doble cobro por retry.
//
// 🔴 La FECHA DE PAGO viene en el cuerpo (3-sep-2026). El botón escribía la
// fecha de HOY y por eso nadie lo usó en 90 días: contabilidad registra 1–4
// días después del pago (el 1-sep registró la quincena del 30-ago) y el
// movimiento caía en la quincena equivocada. Ahora el diálogo pregunta la
// fecha, y la QUINCENA DEL DEDUP se deriva de esa fecha — no de hoy — para
// que aplicar dos veces la misma quincena no cobre dos veces.
// Sin `fecha` en el cuerpo se mantiene la conducta vieja (hoy, Panamá).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { getQuincenaRangePanama, quincenaDeFecha, esFechaISO } from "@/lib/prestamos-quincena";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";

export const dynamic = "force-dynamic";

// La lista vive en `lib/prestamos-roles.ts` y en ningún otro lado: hasta el
// 5-sep-2026 estaba tecleada a mano en seis archivos.
const ROLES = PRESTAMOS_ROLES;

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

  // Fecha de pago elegida (opcional; sin cuerpo o sin fecha → hoy Panamá).
  let fechaElegida: unknown;
  try {
    const body = await req.json();
    fechaElegida = body?.fecha;
  } catch {
    fechaElegida = undefined;
  }

  if (fechaElegida !== undefined && fechaElegida !== null && !esFechaISO(fechaElegida)) {
    return NextResponse.json(
      { error: "La fecha de pago no es válida. Elige una fecha real (AAAA-MM-DD)." },
      { status: 400 },
    );
  }

  // 🔑 La quincena del dedup es la de la FECHA ELEGIDA, no la de hoy: si el
  // 2-sep se registra el pago del 31-ago, el candado de «ya deducido» tiene
  // que mirar la quincena 16–31 de agosto.
  const fecha = esFechaISO(fechaElegida) ? fechaElegida : getQuincenaRangePanama().fecha;
  const { start, end } = quincenaDeFecha(fecha);

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
    { fecha, count_aplicados: summary?.count_aplicados ?? 0, total: summary?.total ?? 0, count_omitidos: summary?.count_omitidos ?? 0 },
    session.userName,
  );

  return NextResponse.json(summary);
}
