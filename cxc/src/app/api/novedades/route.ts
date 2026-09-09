// ─────────────────────────────────────────────────────────────────────────────
// GET/POST /api/novedades — el aviso de «qué cambió» dentro de cada módulo.
//
//   GET  ?modulo=cxc  → { novedades: [...] }  lo que esta persona todavía no
//                       cerró en ESE módulo. Vacío si el módulo no es suyo.
//   POST { ids: [...] } → las marca como leídas.
//
// 🔴 QUIÉN VE QUÉ SE DECIDE EN EL SERVIDOR. Los módulos salen de la cookie
// FIRMADA (`modules`), la misma fuente que pinta el menú — nunca de lo que el
// navegador diga. Así, escribir la dirección a mano no alcanza para leer que
// Comisiones cambió.
//
// ⚠️ FALLA ABIERTA CON LA DDL PENDIENTE. Mientras
// `20261024120000_novedades_vistas.sql` no corra, la tabla no existe: el GET
// contesta con todas las vigentes (como si no hubiera cerrado ninguna) y el
// POST contesta 200 sin guardar. La × sigue funcionando porque la pantalla
// también anota en este navegador. Nunca se rompe una pantalla por una DDL que
// todavía no corrió.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { NOVEDADES } from "@/lib/novedades/lista";
import { novedadesPendientes } from "@/lib/novedades/seleccion";
import { ALL_MODULE_KEYS, SYSTEM_ROLE_KEYS, getDefaultModulesForRole } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Todo el que tenga sesión: el recorte de verdad son sus MÓDULOS, no su rol.
 *
 *  🔴 La lista se DERIVA de `SYSTEM_ROLES` y no se teclea: un rol nuevo se
 *  quedaría sin avisos en silencio. (Y no puede ser `[]`: `requireRole` le
 *  contesta 403 a todo el que no sea admin cuando la lista viene vacía.) */
const CUALQUIER_SESION: string[] = [...SYSTEM_ROLE_KEYS];

/** ¿El error de PostgREST es «la tabla todavía no existe»? */
function faltaLaTabla(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return err.code === "42P01" || err.code === "PGRST205" ||
    /does not exist|schema cache|could not find the table/i.test(msg);
}

/** Los módulos de esta sesión. Sin lista guardada, los del rol. */
function modulosDe(auth: { role: string; modules?: string[] }): string[] {
  if (auth.modules && auth.modules.length > 0) return auth.modules;
  return getDefaultModulesForRole(auth.role);
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CUALQUIER_SESION);
  if (auth instanceof NextResponse) return auth;

  const moduloKey = req.nextUrl.searchParams.get("modulo");
  if (!moduloKey || !ALL_MODULE_KEYS.includes(moduloKey)) {
    return NextResponse.json({ novedades: [] });
  }

  let vistas: string[] = [];
  const usuarioId = auth.userId ?? "";
  if (usuarioId) {
    const { data, error } = await supabaseServer
      .from("novedades_vistas")
      .select("novedad_id")
      .eq("usuario_id", usuarioId);
    if (error && !faltaLaTabla(error)) {
      // Un fallo de lectura NO puede esconder un aviso para siempre; se sigue
      // sin él y el navegador aporta lo que sabe.
      console.error("[novedades] no se pudo leer lo ya visto:", error.message);
    }
    vistas = (data ?? []).map((r) => r.novedad_id as string);
  }

  return NextResponse.json({
    novedades: novedadesPendientes({
      novedades: NOVEDADES,
      moduloKey,
      hoy: hoyPanama(),
      vistas,
      modulosDelUsuario: modulosDe(auth),
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CUALQUIER_SESION);
  if (auth instanceof NextResponse) return auth;

  const usuarioId = auth.userId ?? "";
  if (!usuarioId) return NextResponse.json({ ok: true });

  let ids: unknown;
  try { ({ ids } = await req.json()); } catch { ids = null; }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Falta decir cuáles" }, { status: 400 });
  }

  // Solo ids que EXISTEN y que son de un módulo suyo: el navegador no dicta qué
  // se guarda.
  const suyos = new Set(modulosDe(auth));
  const filas = NOVEDADES
    .filter((n) => ids.includes(n.id) && suyos.has(n.modulo))
    .map((n) => ({
      usuario_id: usuarioId,
      usuario_nombre: auth.userName ?? "",
      novedad_id: n.id,
    }));
  if (filas.length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabaseServer
    .from("novedades_vistas")
    .upsert(filas, { onConflict: "usuario_id,novedad_id", ignoreDuplicates: true });
  if (error && !faltaLaTabla(error)) {
    console.error("[novedades] no se pudo anotar lo leído:", error.message);
  }
  return NextResponse.json({ ok: true });
}
