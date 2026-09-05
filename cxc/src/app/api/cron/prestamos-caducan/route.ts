// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/prestamos-caducan — un préstamo que espera aprobación NO puede
// esperar para siempre.
//
// Daniel, 5-sep-2026: **7 días sin respuesta → se elimina solo.**
//
// 🩸 POR QUÉ ES UN CRON Y NO UN FILTRO AL LEER. Los $700 de LUIS ADRIAN ARROYO
// estuvieron **22 días** en `pendiente_aprobacion` con el saldo mostrando $0. La
// diferencia entre aquello y esto no es que ahora se vea (que también): es que
// ahora se ACABA. Un pendiente que nadie mira se borra a los 7 días y quien lo
// necesite lo vuelve a pedir; uno que se queda para siempre es plata escondida.
//
// La regla vive en `src/lib/prestamos-tope.ts` (`pendienteCaducado`, módulo
// puro); acá solo el I/O. Se compara por DÍA de Panamá: el cron corre una vez al
// día y un umbral de horas haría que el mismo préstamo caduque o no según a qué
// hora se pidió.
//
// Corre 13:15 UTC = 8:15 a.m. Panamá — antes de que la contadora empiece a
// trabajar, así que la lista que ella ve ya está limpia. Sin nada que caducar NO
// manda ningún mensaje; el heartbeat se registra igual (una corrida vacía es una
// corrida exitosa).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";
import { logActivity } from "@/lib/log-activity";
import { ESTADO_PENDIENTE } from "@/lib/prestamos-saldo";
import { DIAS_CADUCIDAD_PENDIENTE, pendienteCaducado } from "@/lib/prestamos-tope";
import { hoyPanamaYmd } from "@/lib/prestamos-quincena";

const CRON_NAME = "prestamos-caducan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FilaPendiente {
  id: string;
  fecha: string;
  monto: number | string;
  prestamos_empleados: { nombre: string | null } | { nombre: string | null }[] | null;
}

function nombreDe(f: FilaPendiente): string {
  const e = f.prestamos_empleados;
  if (!e) return "Sin nombre";
  return (Array.isArray(e) ? e[0]?.nombre : e.nombre) ?? "Sin nombre";
}

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
      }
    } catch {
      /* cookie inválida */
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id, fecha, monto, prestamos_empleados(nombre)")
    .eq("estado", ESTADO_PENDIENTE)
    .or("deleted.is.null,deleted.eq.false")
    .order("fecha", { ascending: true });

  if (error) {
    console.error("[prestamos-caducan] query falló:", error.message);
    await logCronError("prestamos_caducan_query_failed", error.message, null, { telegram: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hoy = hoyPanamaYmd();
  const filas = (data ?? []) as unknown as FilaPendiente[];
  const caducados = filas.filter((f) => pendienteCaducado(String(f.fecha).slice(0, 10), hoy));

  if (req.nextUrl.searchParams.get("test") === "true") {
    return NextResponse.json({
      hoy,
      pendientes: filas.length,
      caducarian: caducados.map((f) => ({ id: f.id, nombre: nombreDe(f), monto: Number(f.monto), fecha: f.fecha })),
    });
  }

  let borrados = 0;
  for (const f of caducados) {
    const { error: e } = await supabaseServer
      .from("prestamos_movimientos")
      .update({ deleted: true })
      .eq("id", f.id)
      .eq("estado", ESTADO_PENDIENTE);
    if (e) {
      await logCronError("prestamos_caducan_update_failed", e.message, null, { telegram: false });
      continue;
    }
    borrados += 1;
    await logActivity("cron", "prestamo_caducado", "prestamos", { movimientoId: f.id, monto: Number(f.monto), fecha: f.fecha }, CRON_NAME);
  }

  // 🔴 Se DICE. Un préstamo que se borra solo sin avisar es exactamente la clase
  // de plata que desaparece sin que nadie se entere. Va al chat privado de
  // Daniel, que es quien no contestó.
  if (borrados > 0) {
    const detalle = caducados
      .map((f) => `${nombreDe(f)} · $${Number(f.monto).toFixed(2)} (${String(f.fecha).slice(0, 10)})`)
      .join("\n");
    const enviado = await enviarNegocioPrivado(
      `💵 ${borrados} préstamo${borrados !== 1 ? "s" : ""} se eliminó solo por no responder en ${DIAS_CADUCIDAD_PENDIENTE} días\n\n${detalle}\n\nSi todavía hace falta, se vuelve a pedir en Préstamos.`,
    );
    if (!enviado) {
      await logCronError("prestamos_caducan_telegram_failed", "Telegram no aceptó el mensaje", null, { telegram: false });
    }
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, hoy, pendientes: filas.length, borrados });
}
