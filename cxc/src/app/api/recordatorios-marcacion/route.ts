// POST /api/recordatorios-marcacion — manda los recordatorios de
// Marcación que tocan AHORA (16-nov-2026).
//
// 🔴 NO ESTÁ EN `vercel.json`: la llama la BASE cada 5 minutos (`pg_cron` +
// `pg_net`, migración `20270120130000`), con `CRON_SECRET` en el encabezado.
// Sin el secreto contesta 401; sin las llaves VAPID no manda nada y lo dice.
//
// A quién se avisa lo decide `aQuienAvisar` (puro). Un aviso por persona,
// marca y día: la fila de `marcacion_avisos_enviados` se aparta ANTES de
// mandar, así dos pasadas que se crucen no avisan dos veces. Una suscripción
// que contesta 404/410 ya no existe y se borra.

import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerFeriados } from "@/lib/asistencia/feriados-server";
import { leerHorarios } from "@/lib/asistencia/horarios-server";
import { resolverDiasLaborables } from "@/lib/asistencia/horario-configurable";
import { leerMarcasEfectivas } from "@/lib/asistencia/quien-marco-server";
import { deBajaElDia } from "@/lib/asistencia/alta-colaborador";
import { horaCorta } from "@/lib/marcacion/marcacion";
import {
  aQuienAvisar,
  enLaVentana,
  llaveAviso,
  textoDelAviso,
  TITULO_AVISO,
  type MarcaDelDia,
} from "@/lib/marcacion/recordatorios";
import { TABLA_AVISOS, TABLA_RECORDATORIOS, TABLA_SUSCRIPCIONES } from "@/lib/marcacion/recordatorios-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONTACTO_VAPID = "mailto:notificaciones@fashiongr.com";

export async function POST(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const llega = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secreto || llega !== secreto) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ ok: false, error: "Faltan las llaves VAPID" }, { status: 503 });

  try {
    const ahoraIso = new Date().toISOString();
    const hoy = hoyPanama();
    const ahora = horaCorta(ahoraIso);

    const { data: recs, error } = await supabaseServer
      .from(TABLA_RECORDATORIOS)
      .select("empleado_codigo, marca, hora")
      .eq("activo", true);
    if (error) throw new Error(error.message);
    const recordatorios = ((recs ?? []) as { empleado_codigo: string; marca: number; hora: string | null }[])
      .map((r) => ({ codigo: String(r.empleado_codigo).trim(), marca: Number(r.marca) as MarcaDelDia, hora: r.hora ? String(r.hora).slice(0, 5) : null }))
      .filter((r) => enLaVentana(r.hora, ahora));
    // Lo normal: nadie en esta ventana. No se lee nada más.
    if (recordatorios.length === 0) return NextResponse.json({ ok: true, avisos: 0 });

    const codigos = [...new Set(recordatorios.map((r) => r.codigo))];
    const [feriados, horarios, personas, marcas, enviados] = await Promise.all([
      leerFeriados(hoy, hoy),
      leerHorarios(),
      supabaseServer.from("asistencia_personas").select("empleado_codigo, empresa, fecha_salida").in("empleado_codigo", codigos),
      leerMarcasEfectivas(hoy, hoy),
      supabaseServer.from(TABLA_AVISOS).select("empleado_codigo, marca").eq("fecha", hoy),
    ]);
    if (personas.error) throw new Error(personas.error.message);
    if (enviados.error) throw new Error(enviados.error.message);
    const fichas = (personas.data ?? []) as { empleado_codigo: string; empresa: string | null; fecha_salida: string | null }[];

    const marcasHoy = new Map<string, number>();
    for (const m of marcas) {
      const c = String(m.empleado_codigo ?? "").trim();
      if (c) marcasHoy.set(c, (marcasHoy.get(c) ?? 0) + 1);
    }
    const objetivos = aQuienAvisar({
      hoy,
      ahora,
      recordatorios,
      diasLaborables: resolverDiasLaborables({
        horarios: horarios.horarios,
        empresaDe: new Map(fichas.map((f) => [f.empleado_codigo, f.empresa])),
        faltaMigracion: horarios.faltaMigracion,
      }),
      hoyNoSeTrabaja: feriados.feriados.size > 0 || feriados.diasLibres.size > 0,
      marcasHoy,
      yaAvisados: new Set(((enviados.data ?? []) as { empleado_codigo: string; marca: number }[]).map((f) => llaveAviso(f.empleado_codigo, f.marca))),
      deBaja: new Set(fichas.filter((f) => deBajaElDia(f.fecha_salida, hoy)).map((f) => f.empleado_codigo)),
    });

    webpush.setVapidDetails(CONTACTO_VAPID, pub, priv);
    let avisos = 0;
    for (const o of objetivos) {
      // Se aparta el aviso ANTES de mandarlo: si ya estaba, otra pasada lo mandó.
      const { data: apartado, error: e1 } = await supabaseServer
        .from(TABLA_AVISOS)
        .upsert({ empleado_codigo: o.codigo, fecha: hoy, marca: o.marca }, { onConflict: "empleado_codigo,fecha,marca", ignoreDuplicates: true })
        .select("empleado_codigo");
      if (e1) throw new Error(e1.message);
      if (!apartado || apartado.length === 0) continue;

      const { data: subs, error: e2 } = await supabaseServer
        .from(TABLA_SUSCRIPCIONES)
        .select("id, endpoint, p256dh, auth")
        .eq("empleado_codigo", o.codigo);
      if (e2) throw new Error(e2.message);
      const cuerpo = JSON.stringify({ title: TITULO_AVISO, body: textoDelAviso(o.marca), url: "/marcacion" });
      for (const s of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 15 * 60, urgency: "high" });
          avisos += 1;
        } catch (err) {
          const codigoHttp = (err as { statusCode?: number }).statusCode;
          if (codigoHttp === 404 || codigoHttp === 410) {
            await supabaseServer.from(TABLA_SUSCRIPCIONES).delete().eq("id", s.id);
          } else {
            console.error("[marcacion recordatorios] no se pudo mandar:", codigoHttp, err instanceof Error ? err.message : err);
          }
        }
      }
    }
    return NextResponse.json({ ok: true, avisos, personas: objetivos.length });
  } catch (e) {
    console.error("[marcacion recordatorios enviar]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "No se pudieron revisar los recordatorios" }, { status: 500 });
  }
}
