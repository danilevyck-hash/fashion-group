/**
 * Guías — la lista de nombres que ofrece el desplegable «Despachado por».
 *
 * 🩸 Daniel, textual (19-sep-2026): *«el + para agregar nombre debe de
 * guardarse para todos los navegadores, o más fácil ponlo en configuraciones
 * nada más y quita la opción de que sea en la creación de la guía»*. La lista
 * vivía mitad en una constante del código y mitad en el `localStorage` del
 * navegador (`fg_entregadores`): lo que agregaba una persona no lo veía nadie
 * más y no se podía quitar desde ninguna pantalla.
 *
 *   GET            → { lista: Despachador[] }               (activos, en orden)
 *   GET ?config=1  → { lista: DespachadorConfigurado[] }     (con cuántas guías)
 *   POST           → { nombre } → 201 { id }          (admin · secretaria)
 *   DELETE ?id=    → SOFT DELETE firmado              (admin · secretaria)
 *
 * 🔴 AGREGAR Y QUITAR SON DE LOS MISMOS: admin y secretaria, en Guías ›
 * Configuración. Acá NO se reparte «agregar de un lado, quitar del otro» como
 * en los destinos y los transportistas, justamente porque Daniel pidió que
 * agregar saliera de la pantalla de la guía.
 *
 * 🔴 Esta ruta NO escribe una sola guía: lee `guia_transporte` para contar.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  DESPACHADORES_ROLES_ESCRITURA,
  DESPACHADORES_ROLES_LECTURA,
  validarDespachadorNuevo,
} from "@/lib/guias/despachadores";
import {
  agregarDespachador,
  desactivarDespachador,
  leerDespachadoresConGuias,
  leerDespachadoresODefaults,
} from "@/lib/guias/despachadores-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...DESPACHADORES_ROLES_LECTURA]);
  if (auth instanceof NextResponse) return auth;

  const conCuenta = req.nextUrl.searchParams.get("config") === "1";
  try {
    if (conCuenta) {
      return NextResponse.json({ lista: await leerDespachadoresConGuias() });
    }
    // ⚠️ El desplegable pide los NOMBRES y nada más, y esta lectura falla
    // ABIERTA: sin la migración devuelve los cuatro de siempre y la pantalla
    // de la guía no se entera de nada.
    return NextResponse.json({ nombres: await leerDespachadoresODefaults() });
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      // 200 con la lista vacía, no un error: Configuración lo dice en palabras
      // y el formulario sigue ofreciendo lo de siempre.
      return NextResponse.json({ lista: [], sinTabla: true });
    }
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...DESPACHADORES_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarDespachadorNuevo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await agregarDespachador(v.valor, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id, revivido: r.revivido }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, [...DESPACHADORES_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarDespachador(id, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
