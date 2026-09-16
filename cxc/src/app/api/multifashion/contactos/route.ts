// ─────────────────────────────────────────────────────────────────────────────
// GET/POST /api/multifashion/contactos — a quién ya le escribió la tienda.
//
//   GET  → { hoy, porCliente: { "425": { canal, fecha } } }
//          El ÚLTIMO contacto de cada cliente, sea quien sea el que escribió.
//   POST { cliente_switch_id, canal } → deja la anotación.
//
// 🔴 ES DEL MÓDULO, NO DEL USUARIO. Daniel, 16-sep-2026: «desde la tienda, el
// ya se escribió debe de ser general por módulo, no por usuario ni nada de
// eso». El GET no recibe ni mira ningún usuario; el POST guarda quién escribió
// (`contactado_por`) solo para poder preguntar después. Hay candado.
//
// 🔴 LA IDENTIDAD ES EL CÓDIGO DE SWITCH (`cliente_switch_id`), nunca el
// nombre: medido el 16-sep-2026, tres personas distintas comparten el nombre
// «JOSE MORALES» y una sola persona (el código 425) sale partida en dos
// grafías. Un registro de contacto por nombre le escribiría al equivocado.
//
// ⚠️ LAS DOS PUNTAS FALLAN ABIERTAS mientras la migración
// `20261129120000_multifashion_contactos.sql` no haya corrido (la corre Daniel
// a mano): el GET devuelve el mapa vacío y el POST contesta que no se pudo
// anotar, PERO el botón de WhatsApp sigue abriendo igual. La marca gris es una
// ayuda para no repetir un mensaje, no un número de plata.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  esCanalContacto,
  ultimoContactoPorCliente,
  type FilaContacto,
} from "@/lib/multifashion/contacto-registro";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** ¿El error de PostgREST es «esa tabla todavía no existe»? */
function faltaLaTabla(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  if (!/multifashion_contactos/i.test(msg)) return false;
  return (
    /does not exist|schema cache|could not find/i.test(msg) ||
    err.code === "42P01" ||
    err.code === "PGRST205"
  );
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  const hoy = hoyPanama();

  // 🔴 Se leen TODAS las filas, paginando. No hay ventana de días que apague la
  // marca —el mockup que Daniel aprobó muestra «le escribieron hace 12 días»—,
  // así que hace falta el último contacto de cada cliente sin importar cuándo
  // fue. `db-max-rows` = 1000 y corta en silencio: con ~967 clientes esta tabla
  // pasa las 1.000 filas en cuanto la tienda lleve un par de rondas.
  try {
    const filas = await leerTodoPaginado<FilaContacto>(
      "multifashion_contactos",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("multifashion_contactos")
          .select("cliente_switch_id, canal, created_at", pedirCount ? { count: "exact" } : {})
          // El orden de NEGOCIO —el más nuevo primero— con `id` de desempate
          // único, que es lo que hace estable la paginación.
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
    return NextResponse.json({ hoy, porCliente: ultimoContactoPorCliente(filas) });
  } catch (err) {
    // Falla ABIERTA: sin la DDL (o con la lectura caída) la pantalla se dibuja
    // igual, solo sin la marca gris.
    if (!faltaLaTabla({ message: err instanceof Error ? err.message : "" })) {
      console.error("[multifashion/contactos] GET", err);
    }
    return NextResponse.json({ hoy, porCliente: {} });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = Number(body.cliente_switch_id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "cliente_switch_id requerido" }, { status: 400 });
  }
  const canal = body.canal ?? "whatsapp";
  if (!esCanalContacto(canal)) {
    return NextResponse.json({ error: "canal inválido" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("multifashion_contactos").insert({
    cliente_switch_id: id,
    canal,
    contactado_por: auth.userName ?? auth.userId ?? "desconocido",
  });

  if (error) {
    if (faltaLaTabla(error)) {
      // La DDL todavía no corrió. No es un error del usuario: el mensaje ya
      // salió por WhatsApp, lo único que no quedó es la anotación.
      return NextResponse.json({ ok: false, sinTabla: true });
    }
    console.error(`[multifashion/contactos] insert: ${error.message}`);
    return NextResponse.json({ error: "No se pudo anotar el contacto" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
