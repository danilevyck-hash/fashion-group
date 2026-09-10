/* ─────────────────────────────────────────────────────────────────────────────
 * IGNORAR (y volver a mostrar) UN CÓDIGO DEL RELOJ.
 *
 * 🔴 LO DECIDE QUIEN TOCA LAS FICHAS: Daniel y la contadora. Es la MISMA lista
 * derivada de siempre (`puedeCerrar`), no una cuarta escrita a mano.
 *
 * ⚠️ Esconder no borra: ni las marcaciones —append-only, con barrido estático
 * que lo prohíbe— ni la ficha. Ver `codigos-ignorados.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles, cerrarPlanillaRoles } from "@/lib/asistencia/roles";
import { codigoValido, motivoDeIgnorado } from "@/lib/asistencia/codigos-ignorados";
import {
  ignorarCodigo,
  leerIgnorados,
  volverAMostrar,
} from "@/lib/asistencia/codigos-ignorados-server";

export const dynamic = "force-dynamic";

/** La lista de escondidos. La ve todo el que entra a Asistencia. */
export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  try {
    const { lista } = await leerIgnorados();
    return NextResponse.json({
      ignorados: lista,
      // Para no dibujar un botón que va a contestar 403.
      puedeIgnorar: cerrarPlanillaRoles().includes(String(auth.role ?? "")),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/codigos-ignorados GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Esconder un código. */
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const codigo = codigoValido(body?.codigo);
    if (!codigo) return NextResponse.json({ error: "Falta el código." }, { status: 400 });
    const usuario = String(auth.userName ?? "").trim() || String(auth.role ?? "");
    await ignorarCodigo({ codigo, motivo: motivoDeIgnorado(body?.motivo), usuario });
    return NextResponse.json({ ok: true, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/codigos-ignorados POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Volver a mostrarlo. */
export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;
  try {
    const codigo = codigoValido(new URL(req.url).searchParams.get("codigo"));
    if (!codigo) return NextResponse.json({ error: "Falta el código." }, { status: 400 });
    const usuario = String(auth.userName ?? "").trim() || String(auth.role ?? "");
    await volverAMostrar({ codigo, usuario });
    return NextResponse.json({ ok: true, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/codigos-ignorados DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
