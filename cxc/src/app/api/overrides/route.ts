import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { guardarOverride, leerOverrides } from "@/lib/cxc/anotaciones";
import { carteraDeBody, carteraDeQuery, respuestaSiCarteraNoDisponible } from "@/lib/cxc/cartera-http";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  textoObligatorio,
  validarObligatorios,
} from "@/lib/campos-obligatorios";

// Ruta hermana de `/api/cxc/overrides` — la usa Cheques para dejar la nota del
// cheque rebotado en la ficha del cliente. Escribe la MISMA tabla, así que va
// por la MISMA puerta (`lib/cxc/anotaciones.ts`) y con la MISMA regla: la
// cartera es obligatoria. Cheques es del GRUPO (la cartera de Boston va por
// Brand It), y eso lo DICE el llamador, no lo asume este route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const cartera = carteraDeQuery(req);
  if (cartera instanceof NextResponse) return cartera;

  try {
    return NextResponse.json(await leerOverrides(cartera));
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    console.error(e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  const cartera = carteraDeBody(body);
  if (cartera instanceof NextResponse) return cartera;

  // `cxc_client_overrides.nombre_normalized` es NOT NULL sin default Y es parte
  // de la llave del `onConflict`: vacío no solo rompe el upsert, puede pisar la
  // fila equivocada. Su ruta hermana `/api/cxc/overrides` ya validaba esto — las
  // dos escriben la MISMA tabla y estaban desincronizadas.
  const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.cxc_client_overrides);
  if (falta) return falta;

  const { correo, telefono, celular, contacto, resultado_contacto, proximo_seguimiento } = body;

  // Solo se mandan los campos de seguimiento si el llamador los trajo: un
  // `undefined` explícito borraría la nota que ya estaba.
  const fila: Parameters<typeof guardarOverride>[1] = {
    nombre_normalized: textoObligatorio(body.nombre_normalized) as string,
    correo,
    telefono,
    celular,
    contacto,
  };
  if (resultado_contacto !== undefined) fila.resultado_contacto = resultado_contacto;
  if (proximo_seguimiento !== undefined) fila.proximo_seguimiento = proximo_seguimiento;

  try {
    return NextResponse.json(await guardarOverride(cartera, fila));
  } catch (e) {
    const noDisponible = respuestaSiCarteraNoDisponible(e);
    if (noDisponible) return noDisponible;
    const err = e as { message?: string; code?: string };
    return await respuestaErrorEscritura(
      { message: err?.message ?? String(e), code: err?.code },
      { tabla: "cxc_client_overrides", accion: "CXC › datos de contacto del cliente" },
    );
  }
}
