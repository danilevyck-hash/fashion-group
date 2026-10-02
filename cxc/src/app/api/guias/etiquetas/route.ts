/**
 * GUÍAS › ETIQUETAS — la lista y el alta (18-sep-2026).
 *
 *   GET  → { etiquetas: EtiquetaFila[] }            (admin · secretaria · bodega)
 *   POST → { ...EtiquetaNueva } → 201 { etiqueta }  (los mismos tres)
 *   POST → { empresa_key, cliente_codigo, cliente_nombre, destino,
 *            facturas: [{ switch_factura_id, secuencial, fecha_factura, cajas, nota }] }
 *        → 201 { etiquetas, envio_id }   🔴 UN ENVÍO (1-oct-2026), en UN insert:
 *          entran todas o ninguna, y el 409 dice CUÁLES facturas ya estaban.
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
  crearEnvio,
  crearEtiqueta,
  leerEtiquetas,
  type ErrorConTabla,
} from "@/lib/guias/etiquetas-server";
import { validarEnvioNuevo } from "@/lib/guias/etiquetas-por-envio";
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

  const quien = auth.userName ?? auth.userId ?? auth.role;

  // 🔴 LA FORMA NUEVA: un envío con varias facturas. La vieja (una factura
  // suelta) sigue entrando por abajo como envío de una.
  if (Array.isArray((body as { facturas?: unknown } | null)?.facturas)) {
    const ve = validarEnvioNuevo(body);
    if (!ve.ok) return NextResponse.json({ error: ve.error }, { status: 400 });
    const re = await crearEnvio(ve.valor, quien);
    if (!re.ok) {
      const cuerpo: Record<string, unknown> = { error: re.error };
      if (re.status === 409) cuerpo.yaEtiquetadas = re.yaEtiquetadas;
      return NextResponse.json(cuerpo, { status: re.status });
    }
    await logActivity(
      auth.role,
      "guia_etiquetas_crear",
      "guias",
      {
        envioId: re.etiquetas[0]?.envio_id ?? null,
        empresa_key: ve.valor.empresa_key,
        secuenciales: re.etiquetas.map((e) => e.secuencial),
        cajas: re.etiquetas.reduce((s, e) => s + e.cajas, 0),
      },
      auth.userName ?? undefined,
    );
    return NextResponse.json(
      { ok: true, etiquetas: re.etiquetas, envio_id: re.etiquetas[0]?.envio_id ?? null },
      { status: 201 },
    );
  }

  const v = validarEtiquetaNueva(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

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
