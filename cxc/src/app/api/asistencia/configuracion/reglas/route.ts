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
import { supabaseServer } from "@/lib/supabase-server";
import { validarReglas, reglasHaciaFila } from "@/lib/asistencia/config";
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

  const { error } = await supabaseServer
    .from(TABLA_REGLAS)
    .upsert({ ...reglasHaciaFila(r.valor), updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    if (esTablaFaltante(error, TABLA_REGLAS)) {
      return NextResponse.json({ error: avisoMigracion(), faltaMigracion: true }, { status: 503 });
    }
    console.error("[asistencia/configuracion/reglas PUT]", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reglas: r.valor });
}
