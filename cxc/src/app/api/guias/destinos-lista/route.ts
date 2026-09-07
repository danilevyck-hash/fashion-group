/**
 * Guías — la lista general de destinos que ofrece el campo Dirección.
 *
 * 🩸 Daniel, textual (7-sep-2026): *«lo de solo ver en mi pantalla no tiene
 * lógica, el sistema debe de trabajar todo igual, que sea para todo»* y
 * *«quítame hola»*. La lista vivía en el `localStorage` de cada navegador: lo
 * que agregaba una persona no lo veía nadie más, y no se podía quitar desde
 * ninguna pantalla.
 *
 *   GET    → { lista: DestinoDeLista[] } (activos, en orden)
 *   POST   → { destino } → 201 { id }        (admin · secretaria · bodega)
 *   DELETE → ?id= → SOFT DELETE firmado      (admin · secretaria)
 *
 * Quién puede qué: **agregar** es de quien arma la guía (el «＋» del campo);
 * **quitar** es de quien administra, en Guías › Configuración. Agregar es un
 * atajo; quitar es una decisión que le cambia la lista a todo el equipo.
 *
 * 🔴 Esta ruta NO toca `guia_items`: el histórico es lo que el transportista
 * firmó. Solo escribe en `guias_destino_lista`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";
import {
  DESTINOS_LISTA_ROLES_ESCRITURA,
  DESTINOS_LISTA_ROLES_LECTURA,
  validarDestinoDeLista,
} from "@/lib/guias/destinos-lista";
import {
  agregarALaLista,
  desactivarDeLaLista,
  leerListaConfigurada,
} from "@/lib/guias/destinos-lista-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...DESTINOS_LISTA_ROLES_LECTURA]);
  if (auth instanceof NextResponse) return auth;

  try {
    const lista = await leerListaConfigurada();
    return NextResponse.json({ lista });
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      // ⚠️ 200 con la lista vacía, no un error: el formulario cae a
      // `DESTINOS_BASE` y el campo sigue ofreciendo lo de siempre. Sin la
      // migración, la pantalla NO se rompe.
      return NextResponse.json({ lista: [], sinTabla: true });
    }
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...DESTINOS_LISTA_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarDestinoDeLista(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await agregarALaLista(v.valor, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, [...CONFIG_GUIAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarDeLaLista(id, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
