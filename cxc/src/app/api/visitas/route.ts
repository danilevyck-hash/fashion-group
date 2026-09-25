// ─────────────────────────────────────────────────────────────────────────────
// POST /api/visitas — «esta persona abrió este módulo».
//
// La puerta más barata del sistema: recibe `{ modulo, aparato }`, suma uno en la
// base y contesta **204 sin cuerpo**. No devuelve datos, no hace una segunda
// consulta y nunca le muestra un error a nadie — el navegador la llama sin
// esperar la respuesta.
//
// 🔴 QUIÉN ES SALE DE LA COOKIE FIRMADA, NUNCA DEL CUERPO. `user_id`, `role` y
// el nombre los pone el servidor. Del navegador solo se acepta el módulo (que
// tiene que estar en `ALL_MODULES`, o es 400) y el aparato (que ante la duda es
// `computadora`). Nadie puede inflar la medición de otra persona.
//
// 🔴 SIN SESIÓN, 204 Y NADA. No es un error: el login, el catálogo público y
// los pedidos públicos no tienen a quién anotar.
//
// 🔴 FALLA ABIERTA. Mientras `20261221120000_visitas_modulo.sql` no corra, la
// función no existe: se contesta 204 y no se escribe. La app no se entera.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { hoyPanama } from "@/lib/fecha-panama";
import { ALL_MODULE_KEYS } from "@/lib/modules";
import { RPC_REGISTRAR_VISITA, aparatoValido } from "@/lib/visitas/registro";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** 204: recibido, no hay nada que contar. Se construye en cada llamada a
 *  propósito: una `Response` compartida entre peticiones es un cuerpo ya
 *  consumido esperando a morder. */
function nada(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** ¿El error de PostgREST es «la tabla o la función todavía no existen»? */
function faltaLaDdl(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" ||
    err.code === "42883" ||
    err.code === "PGRST202" ||
    err.code === "PGRST205" ||
    /does not exist|schema cache|could not find the (table|function)/i.test(msg)
  );
}

export async function POST(req: NextRequest) {
  const sesion = verifySession(req.cookies.get("cxc_session")?.value);
  // Sin sesión —o con una sesión sin `userId`— no hay a quién anotar.
  if (!sesion?.userId) return nada();

  let cuerpo: { modulo?: unknown; aparato?: unknown };
  try {
    cuerpo = (await req.json()) as typeof cuerpo;
  } catch {
    cuerpo = {};
  }

  const modulo = typeof cuerpo.modulo === "string" ? cuerpo.modulo : "";
  if (!ALL_MODULE_KEYS.includes(modulo)) {
    // Esto NO es «no pasa nada»: una key que no existe es un error de
    // programación, y callarlo dejaría la medición con un módulo fantasma.
    return NextResponse.json({ error: "Ese módulo no existe" }, { status: 400 });
  }

  const { error } = await supabaseServer.rpc(RPC_REGISTRAR_VISITA, {
    p_dia: hoyPanama(),
    p_user_id: sesion.userId,
    p_user_name: sesion.userName ?? "",
    p_role: sesion.role ?? "",
    p_modulo: modulo,
    p_aparato: aparatoValido(cuerpo.aparato),
  });

  if (error && !faltaLaDdl(error)) {
    // Se registra en el log del servidor y se contesta 204 igual: una visita
    // perdida no vale una pantalla rota.
    console.error("[visitas] no se pudo anotar:", error.message);
  }

  return nada();
}
