// GET /api/asistencia/dias-con-datos?desde=2026-08-01&hasta=2026-09-30
//   → { dias: ["2026-08-03", …] }
//
// Qué días del rango tienen ALGUNA marcación. Es lo único que el calendario
// necesita para pintar en gris los que no la tienen — y así se ve, ANTES de
// elegir, si el período que se está por pedir tiene datos o está vacío.
//
// 🔑 SOLO FECHAS. Ni un nombre, ni un minuto, ni un sueldo: el calendario lo
// abre cualquiera que llegue a una de las seis pantallas, incluido `bodega`
// —que no puede ver la planilla— y `gerente_boston`. Devolver el detalle acá
// sería una segunda puerta a lo que las otras rutas recortan con cuidado.
//
// ⚠️ Y por eso NO se acota por empresa: saber que el martes 5 alguien marcó no
// dice quién ni de dónde. Acotarlo obligaría a leer las fichas en cada apertura
// del calendario para no decir nada más de lo que ya se dice.

import { NextRequest, NextResponse } from "next/server";
import { requireAsistencia, MODULOS_PLANILLA } from "@/lib/asistencia/guard";
import { aprobacionesRoles, asistenciaRoles } from "@/lib/asistencia/roles";
import { ROL_BOSTON } from "@/lib/boston/rol";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { fechaPanamaDe } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** El calendario muestra dos meses; se pide con margen, nunca un año entero. */
const DIAS_MAX = 120;

export async function GET(req: NextRequest) {
  const gate = [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON];
  const auth = requireAsistencia(req, gate, MODULOS_PLANILLA);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const desde = (sp.get("desde") ?? "").trim();
  const hasta = (sp.get("hasta") ?? "").trim();
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });
  }
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  if (dias > DIAS_MAX) {
    return NextResponse.json({ error: `Rango muy largo (máximo ${DIAS_MAX} días).` }, { status: 400 });
  }

  try {
    // 🩸 PAGINADO. `db-max-rows` = 1000 y corta EN SILENCIO: dos meses de reloj
    // pasan holgado ese techo (5.621 marcaciones en dos meses, medido) y sin
    // esto el calendario pintaría en gris días que SÍ tienen datos.
    const filas = await leerTodoPaginado<{ ocurrio_en: string }>(
      "asistencia/dias-con-datos",
      (primera, lo, hi) => supabaseServer
        .from("asistencia_marcaciones")
        .select("ocurrio_en", primera ? { count: "exact" } : undefined)
        // El día lo decide Panamá (UTC−5): se pide en su huso y se vuelve a
        // recortar después de convertir, no antes.
        .gte("ocurrio_en", `${desde}T00:00:00-05:00`)
        .lte("ocurrio_en", `${hasta}T23:59:59-05:00`)
        // 🔑 `id` como desempate: paginar sin orden TOTAL puede repetir o saltear
        // filas, y acá eso sería un día pintado en gris teniendo marcaciones.
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(lo, hi),
    );

    const set = new Set<string>();
    for (const f of filas) {
      const d = fechaPanamaDe(f.ocurrio_en);
      if (d >= desde && d <= hasta) set.add(d);
    }
    return NextResponse.json({ dias: [...set].sort() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/dias-con-datos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
