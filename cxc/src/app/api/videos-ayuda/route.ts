/* ─────────────────────────────────────────────────────────────────────────────
 * GET /api/videos-ayuda?modulo=caja — los videos de «Cómo se usa» (15-nov-2026).
 *
 * 🔴 EL BUCKET ES PRIVADO: cada video y su miniatura salen por URL FIRMADA
 * que vence en una hora, y solo para quien puede abrir ese módulo: la MISMA
 * regla de la pantalla (`tieneAccesoAlModulo`: admin, los roles de
 * `modules.ts` o el módulo en la sesión firmada — así David ve los de `/cxc`).
 * Nunca `getPublicUrl`.
 * ──────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/session-cookie";
import { tieneAccesoAlModulo } from "@/lib/auth-check";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_MODULES } from "@/lib/modules";
import { BUCKET_VIDEOS_AYUDA, VIDEOS_DEL_INICIO, videosDelModulo, type VideoAyuda } from "@/lib/videos-ayuda/manifiesto";

export const dynamic = "force-dynamic";

const SEGUNDOS_URL_FIRMADA = 60 * 60;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("modulo") ?? "";
  // `/home` no es un módulo: sus videos (solo los del Inicio) los ve toda sesión.
  const esInicio = key === VIDEOS_DEL_INICIO;
  const modulo = esInicio ? { key, label: "Inicio", roles: [] as string[] } : ALL_MODULES.find((m) => m.key === key);
  const { lista, completo } = videosDelModulo(key);
  if (!modulo || lista.length === 0) {
    return NextResponse.json({ error: "Este módulo no tiene videos." }, { status: 404 });
  }

  const sesion = verifySession(req.cookies.get("cxc_session")?.value);
  if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!esInicio && !tieneAccesoAlModulo(sesion.role, sesion.modules, modulo.key, modulo.roles)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const todos: VideoAyuda[] = completo ? [completo, ...lista] : lista;
  const rutas = todos.flatMap((v) => [v.video, v.miniatura, ...(v.compartir ? [v.compartir] : [])]);
  const { data, error } = await supabaseServer.storage
    .from(BUCKET_VIDEOS_AYUDA)
    .createSignedUrls(rutas, SEGUNDOS_URL_FIRMADA);
  if (error || !data) {
    console.error("[videos-ayuda] firmar", error?.message);
    return NextResponse.json(
      { error: "No se pudieron cargar los videos. Vuelve a intentarlo en un momento." },
      { status: 502 },
    );
  }
  const url = new Map(data.map((d) => [d.path, d.signedUrl]));
  const conUrl = (v: VideoAyuda) => ({
    orden: v.orden,
    titulo: v.titulo,
    segundos: v.segundos,
    url: url.get(v.video) ?? null,
    miniatura: url.get(v.miniatura) ?? null,
    // Lo que se comparte: el mismo video, o su versión liviana (el completo).
    compartir: url.get(v.compartir ?? v.video) ?? null,
    ...(v.vertical ? { vertical: true } : {}),
  });

  return NextResponse.json(
    { modulo: modulo.label, lista: lista.map(conUrl), completo: completo ? conUrl(completo) : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
