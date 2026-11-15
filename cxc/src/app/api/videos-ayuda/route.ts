/* ─────────────────────────────────────────────────────────────────────────────
 * GET /api/videos-ayuda?modulo=caja — los videos de «Cómo se usa» (15-nov-2026).
 *
 * 🔴 EL BUCKET ES PRIVADO: cada video y su miniatura salen por URL FIRMADA
 * que vence en una hora, y solo para quien puede abrir ese módulo (los roles
 * de `modules.ts`; admin siempre). Nunca `getPublicUrl`.
 * ──────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_MODULES } from "@/lib/modules";
import { BUCKET_VIDEOS_AYUDA, videosDelModulo, type VideoAyuda } from "@/lib/videos-ayuda/manifiesto";

export const dynamic = "force-dynamic";

const SEGUNDOS_URL_FIRMADA = 60 * 60;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("modulo") ?? "";
  const modulo = ALL_MODULES.find((m) => m.key === key);
  const { lista, completo } = videosDelModulo(key);
  if (!modulo || lista.length === 0) {
    return NextResponse.json({ error: "Este módulo no tiene videos." }, { status: 404 });
  }

  const auth = requireRole(req, modulo.roles);
  if (auth instanceof NextResponse) return auth;

  const todos: VideoAyuda[] = completo ? [completo, ...lista] : lista;
  const rutas = todos.flatMap((v) => [v.video, v.miniatura]);
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
  });

  return NextResponse.json(
    { modulo: modulo.label, lista: lista.map(conUrl), completo: completo ? conUrl(completo) : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
