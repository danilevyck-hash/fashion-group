// ─────────────────────────────────────────────────────────────────────────────
// GET /api/visitas/mis-modulos — el orden de la barra de pestañas de ESTA
// persona (`TAB_BAR_2026_10`, lib/navegacion/tab-bar.ts).
//
// 🔴 SOLO LEE, y solo lo suyo: el `user_id` sale de la cookie FIRMADA, nunca
// de la URL. Contesta las keys de sus módulos de más a menos usados en las 4
// semanas completas antes del lunes de esta semana, así el orden queda fijo
// toda la semana. El navegador filtra después con los módulos de su menú.
//
// 🔴 FALLA ABIERTA: sin sesión, sin tabla o con un error, `orden: []` y la
// barra usa el orden de su rol.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { TABLA_VISITAS } from "@/lib/visitas/registro";
import { ordenPorUso, ventanaDeLaSemana, type FilaUso } from "@/lib/navegacion/tab-bar";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const { desde, hasta } = ventanaDeLaSemana(hoyPanama());
  const sesion = verifySession(req.cookies.get("cxc_session")?.value);
  if (!sesion?.userId) return NextResponse.json({ orden: [], semana: hasta });

  let orden: string[] = [];
  try {
    const filas = await leerTodoPaginado<FilaUso>(
      `${TABLA_VISITAS} (barra de pestañas)`,
      (pedirCount, inicio, fin) =>
        supabaseServer
          .from(TABLA_VISITAS)
          .select("modulo, aparato, visitas", pedirCount ? { count: "exact" } : {})
          .eq("user_id", sesion.userId)
          .gte("dia", desde)
          .lt("dia", hasta)
          .order("dia", { ascending: true })
          .order("modulo", { ascending: true })
          .order("aparato", { ascending: true })
          .range(inicio, fin),
    );
    orden = ordenPorUso(filas);
  } catch (e) {
    console.error("[visitas] no se pudo leer el orden de la barra:", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.json({ orden, semana: hasta }, { headers: { "Cache-Control": "private, no-store" } });
}
