// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/cobros-del-dia — el resumen de los cobros de hoy, al chat de
// ALERTAS (el privado de Daniel, `enviarNegocioPrivado`). Aprobado el 6-oct-2026;
// Daniel, 7-oct-2026: «Los cobros de Telegram deben llegar a Alertas, no a Negocio.»
//
// 00:00 UTC = 7:00 p.m. de Panamá, 45 min después del último `sync-recibos`
// del día (23:15 UTC). No toca Switch —lee solo Supabase—, así que la
// separación de 15 min no le aplica. Sin cobros NO manda nada.
//
// 🔴 SOLO FASHION GROUP: las 6 empresas del grupo (`CXC_GRUPO_EMPRESA_KEYS`, la
// misma lista y la misma cartera —la MV de CxC— del módulo). Daniel, 6-oct-2026:
// Boston y Multifashion quedan FUERA. Afuera también el mostrador y las empresas
// del grupo como clientes (`CLIENTES_FUERA`).
// ⚠️ Un recibo registrado después de las 6:15 p.m. no sale ni hoy ni mañana.
// El texto: `lib/cxc/cobros-del-dia.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";

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
        creado: r.fecha_creacion,
      }));

    const codigos = [...new Set(cobros.map((c) => c.codigo))];
    const empresas = [...new Set(cobros.map((c) => c.empresa))];

    const [mv, ...cortes] = await Promise.all([
      codigos.length
        ? supabaseServer
            .from("switch_estadocuenta_aging_mv")
            .select("company_key, codigo, d91_120, d121_180, d181_270, d271_365, mas_365")
            .in("company_key", CXC_GRUPO_EMPRESA_KEYS)
            .in("codigo", codigos)
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      ...empresas.map((e) =>
        supabaseServer.from("switch_estadocuenta").select("synced_at").eq("empresa_key", e).order("synced_at", { ascending: false }).limit(1),
      ),
    ]);
    const err = mv.error ?? cortes.find((c) => c.error)?.error;
    if (err) throw new Error(err.message);

    // +90 días = 91-120 + 121 y más, la cuenta de CxC (`saldoMas90`).
    const mas90 = new Map<string, number>();
    const sumar = (k: string, v: number) => mas90.set(k, (mas90.get(k) ?? 0) + v);
    for (const r of (mv.data ?? []) as Record<string, number | string>[]) {
      sumar(`${r.company_key}|${r.codigo}`, ["d91_120", "d121_180", "d181_270", "d271_365", "mas_365"].reduce((s, c) => s + (Number(r[c]) || 0), 0));
    }
    const corte = Object.fromEntries(empresas.map((e, i) => [e, (cortes[i].data?.[0]?.synced_at as string | undefined) ?? null]));

    const mensaje = mensajeCobrosDelDia(cobros, mas90, corte);
    if (req.nextUrl.searchParams.get("test") === "true") {
      return NextResponse.json({ fecha, cobros: cobros.length, mensaje: mensaje ?? "(no se mandaría nada)" });
    }

    let enviado = false;
    if (mensaje) {
      enviado = await enviarNegocioPrivado(mensaje);
      if (!enviado) await logCronError("cobros_del_dia_telegram_failed", "Telegram no aceptó el mensaje", null, { telegram: false });
    }
    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ ok: true, fecha, cobros: cobros.length, enviado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logCronError("cobros_del_dia_failed", msg, null, { telegram: false });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
