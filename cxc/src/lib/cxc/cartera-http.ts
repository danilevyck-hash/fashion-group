/**
 * Leer la CARTERA de un request, y contestar bien cuando falta o no está lista.
 *
 * Vive aparte de `cartera.ts` (que es puro y no conoce Next) y aparte de
 * `anotaciones.ts` (que no conoce HTTP). Existe para que los cinco routes que
 * tocan anotaciones NO repitan el mismo `if`: cinco copias son cinco lugares
 * donde alguien puede poner un default silencioso.
 */
import { NextRequest, NextResponse } from "next/server";
import { CarteraNoDisponibleError, parseCartera, type Cartera } from "./cartera";

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
