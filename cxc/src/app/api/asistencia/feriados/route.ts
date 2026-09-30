// Feriados y cierres. Van APARTE de las justificaciones y NO persona por
// persona: si el 3 de noviembre hubiera que justificarlo uno a uno, aparecerían
// 32 ausencias. Un feriado no es ausencia de nadie.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { rechazarLoDelGrupo } from "@/lib/asistencia/alcance-boston-server";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { esColumnaTipoFaltante, MIGRACION_FERIADOS_TIPO, TIPOS_FERIADO, tipoFeriado } from "@/lib/asistencia/feriados";
import { asegurarDeudasDeDiasLibres } from "@/lib/asistencia/dia-libre-empresa-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const anio = (req.nextUrl.searchParams.get("anio") ?? "").trim();
  const leer = (cols: string) => {
    let q = supabaseServer.from("asistencia_feriados").select(cols).order("fecha");
    if (/^\d{4}$/.test(anio)) q = q.gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`);
    return q;
  };
  // 🔴 Sin la columna `tipo` (30-sep-2026) se lee como antes y todo es feriado.
  let { data, error } = await leer("fecha, nombre, tipo");
  const faltaColumna = esColumnaTipoFaltante(error);
  if (faltaColumna) ({ data, error } = await leer("fecha, nombre"));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as unknown as { fecha: string; nombre: string; tipo?: string }[];
  return NextResponse.json({
    feriados: filas.map((f) => ({ fecha: f.fecha, nombre: f.nombre, tipo: tipoFeriado(f.tipo) })),
    faltaMigracionTipo: faltaColumna,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  // 🔴 Los feriados son de TODO el sistema («no hay feriados por empresa»): un
  // rol acotado a una empresa (David) los ve y no los toca.
  const delGrupo = rechazarLoDelGrupo(auth.role);
  if (delGrupo) return delGrupo;
  let b: { fecha?: string; nombre?: string; tipo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const fecha = (b.fecha ?? "").trim();
  const nombre = (b.nombre ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Ponle un nombre" }, { status: 400 });
  // 🔴 EL TIPO (30-sep-2026): «Feriado · se paga» o «Día libre · el colaborador
  // debe las horas». Sin tipo, feriado (lo de siempre); un valor raro, 400.
  if (b.tipo !== undefined && !(TIPOS_FERIADO as readonly string[]).includes(String(b.tipo))) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const tipo = tipoFeriado(b.tipo);
  let { error } = await supabaseServer
    .from("asistencia_feriados")
    .upsert({ fecha, nombre, tipo }, { onConflict: "fecha" });
  if (esColumnaTipoFaltante(error)) {
    // Sin la migración, un feriado se guarda como siempre; un día libre NO:
    // guardarlo como feriado lo pagaría sin deuda, que es justo el error.
    if (tipo === "dia_libre") {
      return NextResponse.json(
        { error: `Todavía no se pueden guardar días libres: pídele a Daniel que corra el archivo ${MIGRACION_FERIADOS_TIPO} en Supabase.` },
        { status: 503 },
      );
    }
    ({ error } = await supabaseServer.from("asistencia_feriados").upsert({ fecha, nombre }, { onConflict: "fecha" }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 🔴 UN DÍA LIBRE QUE YA PASÓ: la deuda nace ahora (los que vienen nacen al
  // generar la planilla, cuando el día ya pasó). Misma puerta, idempotente.
  const deudas = tipo === "dia_libre" && fecha < hoyPanama()
    ? await asegurarDeudasDeDiasLibres({ desde: fecha, hasta: fecha, hoy: hoyPanama() })
    : null;
  return NextResponse.json({ ok: true, deudasCreadas: deudas?.creadas ?? 0 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const delGrupo = rechazarLoDelGrupo(auth.role);
  if (delGrupo) return delGrupo;
  const fecha = (req.nextUrl.searchParams.get("fecha") ?? "").trim();
  if (!fecha) return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  const { error } = await supabaseServer.from("asistencia_feriados").delete().eq("fecha", fecha);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
