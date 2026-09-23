// ============================================================================
// POST /api/marketing/zip/firmar-de-nuevo
//   body: { paths: string[] }   → { links: { path, url }[], vencen_en_dias: 30 }
//
// 🔴 POR QUÉ EXISTE. Desde el 22-sep-2026 los links del ZIP duran 30 días y no
// un año (Daniel). Un link de un año es una puerta a los papeles de la casa que
// nadie puede cerrar; treinta días alcanzan de sobra para que el encargado abra
// su reporte. Cuando uno vence, esta puerta lo vuelve a firmar por otros 30
// días — sin volver a armar el ZIP entero, que tarda y baja todas las fotos.
//
// Sirve para dos cosas, y son la misma: un link del Excel que ya venció, y el
// ZIP guardado en `marketing/periodos/<id>/<fecha>.zip` que se quiere volver a
// bajar.
//
// 🔴 SOLO DENTRO DEL BUCKET `marketing`, Y SOLO ADENTRO. Se rechaza cualquier
// path absoluto, con `..`, con `://` o vacío: firmar lo que llegue sería
// convertir esta ruta en una llave maestra de Storage.
//
// Entran admin y secretaria, los mismos que bajan el ZIP.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { firmarPathDelZip, ttlDeLinkDelZip } from "@/lib/marketing/storage";
import { esPathFirmable } from "@/lib/marketing/zip-e-impulsadoras";

export const dynamic = "force-dynamic";

/** Cuántos se firman de una vez. Un Excel de una marca no tiene más. */
const MAX_PATHS = 200;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const pedidos = Array.isArray(body.paths) ? body.paths : [];
  const paths = Array.from(
    new Set(pedidos.filter(esPathFirmable).map((p) => String(p).trim())),
  ).slice(0, MAX_PATHS);

  if (paths.length === 0) {
    return NextResponse.json(
      { error: "Dime qué archivo hay que volver a firmar." },
      { status: 400 },
    );
  }

  const links: Array<{ path: string; url: string }> = [];
  const fallaron: string[] = [];
  for (const path of paths) {
    try {
      links.push({ path, url: await firmarPathDelZip(path) });
    } catch {
      // Un archivo que ya no está no tumba los demás: se dice cuál falló.
      fallaron.push(path);
    }
  }

  if (links.length === 0) {
    return NextResponse.json(
      { error: "Ese archivo ya no está guardado. Vuelve a bajar el ZIP." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    links,
    fallaron,
    vencen_en_dias: Math.round(ttlDeLinkDelZip() / (60 * 60 * 24)),
  });
}
