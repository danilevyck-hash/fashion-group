// ─────────────────────────────────────────────────────────────────────────────
// QUÉ DEL ARCHIVO ES NUEVO Y QUÉ YA ESTÁ EN SWITCH (17-sep-2026)
//
// Cambia lo que va a pasar al subir el archivo: lo nuevo se crea, lo que ya está
// se pisa. Hoy no se dice, y se ve recién del otro lado.
//
// 🔴 NO HACE FALTA SUBIR NADA NI PEDIRLE UN ARCHIVO A NADIE: se cuenta contra
// `switch_articulo_info`, que el sistema ya sincroniza de las seis empresas
// (medido contra producción el 17-sep-2026: active_shoes 1.763 · vistana 8.274 ·
// fashion_wear 5.117 · fashion_shoes 731 · active_wear 592 · joystep 207).
//
// 🔴 SE PREGUNTA POR `codigo`, ACOTADO A LA `empresa_key` QUE LA PANTALLA YA
// RECONOCIÓ. El mismo código nombra artículos distintos en dos empresas.
//
// ⚠️ FALLA ABIERTA. Cualquier cosa que salga mal —la empresa no se reconoció,
// no hay service role, la consulta falla, la empresa no tiene catálogo— contesta
// `{ ok: false }` con 200 y la pantalla no dibuja la línea. Esta ruta NUNCA
// puede frenar una descarga: el archivo sale igual desde 2026 sin ella.
//
// 🔑 Se manda la lista de códigos y vuelven DOS números, no 8.274 códigos: el
// catálogo entero de Vistana pesa ~100 KB y viajaría en cada archivo cargado.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { COMPANIAS_DEPURADOR } from "@/lib/depurador/logic";
import { contarContraSwitch, normalizarCodigo } from "@/lib/depurador/resumen-del-archivo";

export const dynamic = "force-dynamic";

/** Los mismos roles que el resto del módulo Plantilla Switch. */
const ALLOWED = ["admin", "secretaria"];

/** Tope de códigos por consulta. Un `in.(…)` viaja en la URL, así que se parte
 *  en pedazos chicos: 200 códigos son ~3 KB de URL, muy por debajo de cualquier
 *  límite, y 200 < 1.000 así que `db-max-rows` no puede recortar en silencio. */
const POR_TANDA = 200;

/** La respuesta de «no se pudo saber». Es 200 a propósito: no es un error de la
 *  pantalla, es que esta línea no se puede decir. */
const NO_SE_SABE = NextResponse.json({ ok: false });

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return NO_SE_SABE;

  let body: { empresa?: unknown; codigos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NO_SE_SABE;
  }

  const empresa = String(body.empresa ?? "");
  // La empresa tiene que ser una de las del módulo: nunca se arma un filtro con
  // lo que llegue del navegador.
  if (!COMPANIAS_DEPURADOR.some((c) => c.key === empresa)) return NO_SE_SABE;

  const crudos = Array.isArray(body.codigos) ? body.codigos : [];
  const codigos = [...new Set(crudos.map(normalizarCodigo).filter(Boolean))];
  if (codigos.length === 0) return NO_SE_SABE;

  const enSwitch = new Set<string>();
  for (let i = 0; i < codigos.length; i += POR_TANDA) {
    const tanda = codigos.slice(i, i + POR_TANDA);
    const { data, error } = await supabaseServer
      .from("switch_articulo_info")
      .select("codigo")
      .eq("empresa_key", empresa)
      .in("codigo", tanda);
    // Un pedazo que falla invalida la cuenta entera: decir «40 nuevos» cuando
    // faltó mirar la mitad del archivo es peor que no decir nada.
    if (error) return NO_SE_SABE;
    for (const r of data ?? []) enSwitch.add(normalizarCodigo((r as { codigo: string }).codigo));
  }

  const { nuevos, yaEstan } = contarContraSwitch(codigos, enSwitch);
  return NextResponse.json({ ok: true, nuevos, yaEstan });
}
