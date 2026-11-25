// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/cobros-del-dia — el resumen de los cobros de hoy, al chat de
// ALERTAS (el privado de Daniel, `enviarNegocioPrivado`). Aprobado el 6-oct-2026;
// Daniel, 7-oct-2026: «Los cobros de Telegram deben llegar a Alertas, no a Negocio.»
//
// 00:00 UTC = 7:00 p.m. de Panamá, 45 min después del último `sync-recibos`
// del día (23:15 UTC). 🔴 Desde el 24-nov-2026 SÍ toca Switch: lee el +90 al
// momento de los clientes que pagaron hoy (`cobros-del-dia-io.ts`), así que
// está en `SWITCH_CRON_ENTRADAS` con la separación de 15 min. Sin nada que
// contar NO manda nada.
//
// 🔴 SOLO FASHION GROUP: las 6 empresas del grupo (`CXC_GRUPO_EMPRESA_KEYS`, la
// misma lista del módulo). Daniel, 6-oct-2026:
// Boston y Multifashion quedan FUERA. Afuera también el mostrador y las empresas
// del grupo como clientes (`CLIENTES_FUERA`).
// ⚠️ Un recibo registrado después de las 6:15 p.m. no sale ni hoy ni mañana.
// El texto: `lib/cxc/cobros-del-dia.ts`.
//
// 🔒 24-nov-2026 (Daniel): con `RESUMEN_DEL_DIA_2026_11` este mismo cron manda
// UN solo mensaje — 🧾 Facturas · 🚚 Despachos · 💰 Cobros de hoy — y el aviso
// por guía despachada se apaga. Ver `lib/alertas/resumen-del-dia.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { cobroCuenta, llaveMas90, mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";
import { leerMas90DeSwitch } from "@/lib/cxc/cobros-del-dia-io";
import {
  RESUMEN_DEL_DIA_2026_11,
  bloqueDespachos,
  bloqueFacturas,
  partirParaTelegram,
  resumenDelDia,
} from "@/lib/alertas/resumen-del-dia";
import { leerDespachosDelDia, leerFacturasDelDia } from "@/lib/alertas/resumen-del-dia-io";

const CRON_NAME = "cobros-del-dia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  let authorized = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      authorized = verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
    } catch {
      /* cookie inválida */
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fecha = req.nextUrl.searchParams.get("fecha") || hoyPanama();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "fecha inválida" }, { status: 400 });

  try {
    // Mismo filtro que «Últimos pagos»: sin retenciones ni recibos en cero.
    const rec = await supabaseServer
      .from("switch_recibos")
      .select("empresa_key, cliente_codigo, cliente_nombre, total, fecha_creacion")
      .eq("fecha", fecha)
      .in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)
      .eq("es_retencion", false)
      .neq("total", 0)
      .not("cliente_codigo", "is", null)
      .limit(1000);
    if (rec.error) throw new Error(rec.error.message);
    const cobros: CobroDelDia[] = (rec.data ?? []).map((r) => ({
        empresa: r.empresa_key,
        codigo: r.cliente_codigo,
        cliente: r.cliente_nombre ?? r.cliente_codigo,
        monto: Number(r.total) || 0,
      }));

    // 🔴 El +90 es el de Switch AL MOMENTO (24-nov-2026), solo de quien pagó hoy.
    const pares = [...new Map(cobros.filter(cobroCuenta).map((c) => [llaveMas90(c.empresa, c.codigo), c])).values()];
    const mas90 = pares.length ? await leerMas90DeSwitch(pares) : new Map<string, number | null>();

    const cobrosTexto = mensajeCobrosDelDia(cobros, mas90);
    const mensaje = RESUMEN_DEL_DIA_2026_11
      ? resumenDelDia([
          bloqueFacturas(await leerFacturasDelDia(fecha)),
          bloqueDespachos(await leerDespachosDelDia(fecha)),
          cobrosTexto,
        ])
      : cobrosTexto;
    const partes = mensaje ? partirParaTelegram(mensaje) : [];
    if (req.nextUrl.searchParams.get("test") === "true") {
      return NextResponse.json({ fecha, cobros: cobros.length, mensajes: partes.length ? partes : ["(no se mandaría nada)"] });
    }

    // Varios mensajes seguidos si no cabe en uno (tope de Telegram); nunca se corta.
    let enviado = partes.length > 0;
    for (const parte of partes) {
      if (!(await enviarNegocioPrivado(parte))) enviado = false;
    }
    if (partes.length && !enviado) {
      await logCronError("cobros_del_dia_telegram_failed", "Telegram no aceptó el mensaje", null, { telegram: false });
    }
    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ ok: true, fecha, cobros: cobros.length, enviado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logCronError("cobros_del_dia_failed", msg, null, { telegram: false });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
