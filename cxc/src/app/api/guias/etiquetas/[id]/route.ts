/**
 * GUÍAS › ETIQUETAS — corregir los bultos y borrar (18-sep-2026).
 *
 *   PATCH  { cajas } → 200 { etiqueta }
 *   DELETE           → 200 { ok }   (SOFT DELETE FIRMADO, nunca un DELETE)
 *
 * 🔴 SOLO MIENTRAS ESTÁ PENDIENTE. Una etiqueta que ya salió en una guía está
 * BLOQUEADA, **y lo rechaza el servidor con 409**, no solo el botón apagado de
 * la pantalla. La regla es una sola (`puedeCorregirse`) y la leen los dos
 * lados.
 *
 * 🔴 Borrar no borra: `deleted = true` con quién y cuándo. Por el índice único
 * PARCIAL de la tabla, esa misma factura se puede volver a etiquetar después.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ETIQUETAS_ROLES, validarCajas } from "@/lib/guias/etiquetas";
import { borrarEtiqueta, corregirCajas } from "@/lib/guias/etiquetas-server";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

function idDe(params: { id: string }): number | null {
  const n = Number(params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const id = idDe(params);
  if (id === null) return NextResponse.json({ error: "Falta el id de la etiqueta" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarCajas((body as Record<string, unknown>)?.cajas);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await corregirCajas(id, v.valor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  await logActivity(
    auth.role,
    "guia_etiquetas_corregir",
    "guias",
    { etiquetaId: id, cajas: v.valor },
    auth.userName ?? undefined,
  );
  return NextResponse.json({ ok: true, etiqueta: r.etiqueta });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const id = idDe(params);
  if (id === null) return NextResponse.json({ error: "Falta el id de la etiqueta" }, { status: 400 });

  const quien = auth.userName ?? auth.userId ?? auth.role;
  const r = await borrarEtiqueta(id, quien);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  await logActivity(
    auth.role,
    "guia_etiquetas_borrar",
    "guias",
    { etiquetaId: id, secuencial: r.etiqueta.secuencial },
    auth.userName ?? undefined,
  );
  return NextResponse.json({ ok: true });
}
