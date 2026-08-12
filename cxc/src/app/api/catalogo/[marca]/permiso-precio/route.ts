// GET /api/catalogo/[marca]/permiso-precio
//
// ¿El usuario de API de ESTA empresa puede mandar un precio distinto al de
// lista (proceso 0001 de Switch)? Se pregunta mientras se EDITA el precio, no
// al final: antes Daniel armaba el pedido entero, tocaba enviar y recién ahí se
// enteraba de que no podía cambiarlo.
//
// ⚠️ EL PERMISO ES POR EMPRESA. Cada marca es una empresa de Switch con su
// propio usuario de API (reebok→active_shoes, joybees→joystep,
// tommy→fashion_shoes, calvin→vistana). Por eso se consulta EN VIVO por
// empresa y no hay ninguna constante escrita a mano.
//
// ⚠️ SESIÓN ÚNICA: la consulta abre sesión en Switch. Tres frenos para que no
// se vuelva un martillo — (1) la pantalla solo la dispara cuando hay un precio
// editado DE VERDAD y una sola vez por sesión de navegador, (2) el resultado se
// cachea en `permiso-precio.ts`, el MISMO caché que usa el envío, así que
// preguntar acá y volver a preguntar al enviar cuesta UNA sesión, y (3) el
// `finally` cierra la sesión (POST /cierresesion) para no dejar un token vivo
// que mate el login del próximo cron.
//
// FAIL-OPEN: si no se puede verificar responde `permiso: true` +
// `verificado: false` — igual que el motor de envío. Nunca traba el trabajo por
// no poder preguntar.

import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { requireRole } from "@/lib/requireRole";
import { createSwitchClient, logoutAllSwitchSessions } from "@/lib/switch-api/client";
import {
  PROCESO_CAMBIO_PRECIO,
  TEXTO_PERMISO_NO_VERIFICADO,
  TEXTO_SIN_PERMISO_PRECIO,
  permisoCambiarPrecio,
} from "@/lib/catalogo/permiso-precio";

export const dynamic = "force-dynamic";
// Un login + una consulta a Switch: el default de 10s se queda corto cuando el
// ERP está lento.
export const maxDuration = 60;

// Los mismos roles que pueden enviar el pedido: quien edita el precio es quien
// necesita saber si Switch se lo va a aceptar.
const ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  try {
    const client = createSwitchClient(cfg.empresaKey);
    const r = await permisoCambiarPrecio(cfg.empresaKey, () =>
      client.verificarPermiso(PROCESO_CAMBIO_PRECIO),
    );
    return NextResponse.json({
      permiso: r.permiso,
      verificado: r.verificado,
      mensaje: r.permiso ? (r.verificado ? null : TEXTO_PERMISO_NO_VERIFICADO) : TEXTO_SIN_PERMISO_PRECIO,
    });
  } catch {
    // Ni siquiera se pudo construir el client (env vars de la empresa): mismo
    // fail-open, la pantalla no bloquea nada.
    return NextResponse.json({ permiso: true, verificado: false, mensaje: TEXTO_PERMISO_NO_VERIFICADO });
  } finally {
    await logoutAllSwitchSessions();
  }
}
