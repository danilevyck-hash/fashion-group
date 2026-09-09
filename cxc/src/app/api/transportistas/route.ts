/**
 * Guías — los transportistas que ofrece el desplegable de la guía.
 *
 * 🩸 Daniel, textual (9-sep-2026): *«Ponme opción en configuración de guía para
 * poder agregar un transportista nuevo.»* Los seis de la lista se sembraron el
 * 26-may-2026 y desde entonces NADIE pudo agregar uno: esta ruta era solo GET.
 * Por eso se escribieron a mano en el campo de texto de la guía, saltándose la
 * lista («NUÑEZ GLOBAL SOLUTIONS», «CITY MODA», «SPORTING SHOES», «LUTY LUI» y
 * uno que dice «no»). Es el mismo cuento del destino «hola».
 *
 *   GET            → Transportista[]                (la forma de siempre)
 *   GET ?config=1  → { lista: TransportistaConfigurado[] }  (con cuántas guías)
 *   POST           → { nombre } → 201 { id }   (admin · secretaria · bodega)
 *   DELETE ?id=    → SOFT DELETE firmado       (admin · secretaria)
 *
 * ⚠️ El GET pelado devuelve el ARRAY tal cual, sin envolver: es lo que el
 * formulario de guías lee desde el 26-may-2026 y cambiarle la forma lo dejaría
 * sin transportistas. La cuenta de guías va detrás de `?config=1` porque solo
 * la pantalla de Configuración la necesita, y cuesta una lectura de guías.
 *
 * Quién puede qué: **agregar** es de quien arma la guía (el ＋ del desplegable
 * y la tarjeta de Configuración) — Daniel, textual, al preguntarle: *«Todos»*.
 * **Quitar** es de quien administra: agregar es un atajo, quitar es una
 * decisión que le cambia la lista a todo el equipo.
 *
 * 🔴 Esta ruta NO escribe una sola guía: las lee para contar, nada más.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";
import {
  TRANSPORTISTAS_ROLES_ESCRITURA,
  TRANSPORTISTAS_ROLES_LECTURA,
  validarTransportistaNuevo,
} from "@/lib/guias/transportistas";
import {
  agregarTransportista,
  desactivarTransportista,
  leerTransportistasActivos,
  leerTransportistasConGuias,
} from "@/lib/guias/transportistas-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...TRANSPORTISTAS_ROLES_LECTURA]);
  if (auth instanceof NextResponse) return auth;

  const conCuenta = req.nextUrl.searchParams.get("config") === "1";
  try {
    if (conCuenta) {
      return NextResponse.json({ lista: await leerTransportistasConGuias() });
    }
    return NextResponse.json(await leerTransportistasActivos());
  } catch (e) {
    console.error("[/api/transportistas] GET error:", (e as Error).message);
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...TRANSPORTISTAS_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarTransportistaNuevo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await agregarTransportista(v.valor, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id, revivido: r.revivido }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, [...CONFIG_GUIAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarTransportista(id, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
