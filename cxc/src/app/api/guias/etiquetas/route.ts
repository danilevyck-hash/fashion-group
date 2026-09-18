/**
 * GUÍAS › ETIQUETAS — la lista y el alta (18-sep-2026).
 *
 *   GET  → { etiquetas: EtiquetaFila[] }            (admin · secretaria · bodega)
 *   POST → { ...EtiquetaNueva } → 201 { etiqueta }  (los mismos tres)
 *
 * 🔴 FALLA ABIERTA SIN LA MIGRACIÓN: el GET contesta **200 con la lista vacía**
 * y `sinTabla: true`, y la pantalla dibuja la pestaña diciendo que falta correr
 * la migración. Nada más se rompe — ni Guías, ni Nueva guía.
 *
 * 🔴 EL ANTI-DUPLICADO LO DECIDE EL SERVIDOR: etiquetar una factura que ya
 * tiene etiquetas vivas contesta **409** con la etiqueta que ya existe, aunque
 * la pantalla haya ofrecido el botón.
 *
 * 🔴 Esta ruta NO escribe una sola fila de `guia_items` ni de `guia_transporte`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ETIQUETAS_ROLES, validarEtiquetaNueva } from "@/lib/guias/etiquetas";
import {
  AVISO_MIGRACION,
  crearEtiqueta,
  leerEtiquetas,
  type ErrorConTabla,
} from "@/lib/guias/etiquetas-server";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  try {
    const etiquetas = await leerEtiquetas();
    return NextResponse.json({ etiquetas });
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) {
      return NextResponse.json({ etiquetas: [], sinTabla: true, aviso: AVISO_MIGRACION });
    }
    console.error("[guias/etiquetas] GET:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "No se pudieron cargar las etiquetas. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const v = validarEtiquetaNueva(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const quien = auth.userName ?? auth.userId ?? auth.role;
  const r = await crearEtiqueta(v.valor, quien);
  if (!r.ok) {
    const cuerpo: Record<string, unknown> = { error: r.error };
    if (r.status === 409 && "yaEtiquetada" in r) cuerpo.yaEtiquetada = r.yaEtiquetada;
    return NextResponse.json(cuerpo, { status: r.status });
  }

  await logActivity(
    auth.role,
    "guia_etiquetas_crear",
    "guias",
    {
      etiquetaId: r.etiqueta.id,
      empresa_key: r.etiqueta.empresa_key,
      secuencial: r.etiqueta.secuencial,
      cajas: r.etiqueta.cajas,
    },
    auth.userName ?? undefined,
  );

  return NextResponse.json({ ok: true, etiqueta: r.etiqueta }, { status: 201 });
}
