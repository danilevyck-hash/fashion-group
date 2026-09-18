/**
 * GUÍAS › ETIQUETAS — atar las etiquetas marcadas a la guía recién creada.
 *
 *   POST { guia_id, ids: number[] } → { ok, atadas }
 *
 * 🔴 LA GUÍA SE SIGUE CREANDO IGUAL QUE HOY. `POST /api/guias` no cambió ni un
 * campo: esto corre DESPUÉS, con el id que ese POST devuelve, y escribe
 * únicamente del lado de `guias_etiquetas` (la columna `guia_item_id`). Ni un
 * UPDATE a `guia_items` ni a `guia_transporte`.
 *
 * 🔴 Y ES EL PASO QUE MUEVE EL ESTADO SOLO: atada al renglón, la etiqueta pasa
 * a «En GT-XXX»; borrado el renglón o la guía, vuelve sola a «Pendiente». Nadie
 * marca nada a mano, ni acá ni al revés.
 *
 * ⚠️ FALLA ABIERTA: si esto no corre (sin migración, sin red), la guía ya quedó
 * guardada y lo único que pasa es que las etiquetas siguen diciendo
 * «Pendiente». Nunca al revés.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ETIQUETAS_ROLES } from "@/lib/guias/etiquetas";
import { importarEtiquetas } from "@/lib/guias/etiquetas-server";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const guiaId = typeof b.guia_id === "string" ? b.guia_id.trim() : "";
  if (!UUID_RE.test(guiaId)) {
    return NextResponse.json({ error: "Falta la guía" }, { status: 400 });
  }
  const ids = Array.isArray(b.ids)
    ? b.ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  const r = await importarEtiquetas(guiaId, ids);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  if (r.atadas > 0) {
    await logActivity(
      auth.role,
      "guia_etiquetas_importar",
      "guias",
      { guiaId, atadas: r.atadas },
      auth.userName ?? undefined,
    );
  }
  return NextResponse.json({ ok: true, atadas: r.atadas });
}
