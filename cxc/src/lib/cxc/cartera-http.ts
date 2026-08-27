/**
 * Leer la CARTERA de un request, y contestar bien cuando falta o no está lista.
 *
 * Vive aparte de `cartera.ts` (que es puro y no conoce Next) y aparte de
 * `anotaciones.ts` (que no conoce HTTP). Existe para que los cinco routes que
 * tocan anotaciones NO repitan el mismo `if`: cinco copias son cinco lugares
 * donde alguien puede poner un default silencioso.
 */
import { NextRequest, NextResponse } from "next/server";
import { CarteraNoDisponibleError, CARTERA_BOSTON, parseCartera, type Cartera } from "./cartera";
import { esGerenteBoston } from "@/lib/boston/rol";

const FALTA =
  "Falta indicar de qué cartera es (grupo o boston). Esta pantalla no puede escribir sin decirlo.";

/** La cartera del query string (`?cartera=grupo`), o un 400 listo para devolver. */
export function carteraDeQuery(req: NextRequest): Cartera | NextResponse {
  const c = parseCartera(req.nextUrl.searchParams.get("cartera"));
  return c ?? NextResponse.json({ error: FALTA }, { status: 400 });
}

/** La cartera del cuerpo del POST, o un 400 listo para devolver. */
export function carteraDeBody(body: unknown): Cartera | NextResponse {
  const c = parseCartera((body as Record<string, unknown> | null)?.cartera);
  return c ?? NextResponse.json({ error: FALTA }, { status: 400 });
}

/**
 * Si el error es "la cartera aparte todavía no está habilitada" (falta correr el
 * DDL), devuelve un 503 con el mensaje para la persona. Si no, `null` y que lo
 * maneje el llamador — un error de verdad NO se disfraza de "todavía no".
 */
export function respuestaSiCarteraNoDisponible(e: unknown): NextResponse | null {
  if (!(e instanceof CarteraNoDisponibleError)) return null;
  return NextResponse.json({ error: e.message }, { status: 503 });
}

/**
 * 🔴 EL RECORTE DE `gerente_boston` — David anota en SU cartera y en ninguna otra.
 *
 * Su rol entró a `ROLES_BOSTON` para poder leer la cartera de Boston, y esa
 * misma lista es la que abre los cinco routes de anotaciones (favoritos, notas,
 * contactos). Sin este `if`, la estrella y la nota que pone en Boston serían la
 * misma puerta hacia `cartera=grupo`.
 *
 * ⚠️ Hoy eso NO le mostraría un nombre del grupo —las anotaciones se leen por
 * `userId`, y el suyo está vacío— pero el argumento "hoy no alcanza para nada"
 * es exactamente el que dejó latentes las dos fugas de frescura del #522. El
 * tabique se pone donde se puede razonar, no donde se nota.
 *
 * Devuelve un 403 listo para devolver, o `null` si el pedido es legítimo.
 */
export function respuestaSiCarteraAjena(
  rol: string | null | undefined,
  cartera: Cartera,
): NextResponse | null {
  if (!esGerenteBoston(rol) || cartera === CARTERA_BOSTON) return null;
  return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
}
