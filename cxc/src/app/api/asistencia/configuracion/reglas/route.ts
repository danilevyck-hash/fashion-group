// ─────────────────────────────────────────────────────────────────────────────
// Las REGLAS del cálculo de asistencia y planilla — guardar.
//
// Daniel, textual: *"todos los calculos deben de ser configurables en caso de
// que algo cambie"*. Acá se guardan; el reporte las lee en cada corrida.
//
// ⚠️ Se guardan TODAS juntas, no campo por campo. Un PUT parcial dejaría la
// tabla en un estado que nadie miró completo, y estos números se leen entre
// ellos (el recargo de día y el de noche se comparan con la hora de corte).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { rechazarLoDelGrupo } from "@/lib/asistencia/alcance-boston-server";
import { supabaseServer } from "@/lib/supabase-server";
import { validarReglas, reglasHaciaFila } from "@/lib/asistencia/config";
// 🔴 Las dos reglas del 24-sep-2026 FALLAN ABIERTAS: si la base todavía no
// tiene sus columnas, se guardan las de siempre y se dice.
import { avisoReglasNuevas, esColumnaReglaNuevaFaltante, sinColumnasNuevas } from "@/lib/asistencia/reglas-nuevas";
import {
  leerReglas,
  esTablaFaltante,
  avisoMigracion,
  TABLA_REGLAS,
} from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  try {
    const { reglas, faltaMigracion } = await leerReglas();
    return NextResponse.json({
      reglas,
      faltaMigracion,
      avisoMigracion: faltaMigracion ? avisoMigracion() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/configuracion/reglas GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  // 🔴 Las reglas valen para TODAS las empresas: un rol acotado (David) las lee
  // y no las cambia.
  const delGrupo = rechazarLoDelGrupo(auth.role);
  if (delGrupo) return delGrupo;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió lo que se envió." }, { status: 400 });
  }

  // La conversión la hace el validador. Convertir afuera con la coerción de
  // JavaScript dejaría pasar un campo vacío como 0, y un divisor 0 no da error:
  // da `Infinity`, y una rata infinita se paga.
  const r = validarReglas(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const fila = { ...reglasHaciaFila(r.valor), updated_at: new Date().toISOString() };
  let { error } = await supabaseServer.from(TABLA_REGLAS).upsert(fila, { onConflict: "id" });

  // 🔴 SIN LAS COLUMNAS NUEVAS (la migración del 24-sep-2026 no corrió) se
  // guardan las reglas de siempre y se avisa: guardar la tolerancia no puede
  // quedar trabado por dos campos que la base todavía no conoce.
  let avisoNuevas: string | null = null;
  if (error && esColumnaReglaNuevaFaltante(error)) {
    ({ error } = await supabaseServer.from(TABLA_REGLAS).upsert(sinColumnasNuevas(fila), { onConflict: "id" }));
    avisoNuevas = avisoReglasNuevas();
  }

  if (error) {
    if (esTablaFaltante(error, TABLA_REGLAS)) {
      return NextResponse.json({ error: avisoMigracion(), faltaMigracion: true }, { status: 503 });
    }
    console.error("[asistencia/configuracion/reglas PUT]", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reglas: r.valor, avisoNuevas });
}
