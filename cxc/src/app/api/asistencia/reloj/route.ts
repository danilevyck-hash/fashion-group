// ─────────────────────────────────────────────────────────────────────────────
// EL RELOJ, VISTO DESDE LA PANTALLA.
//
//   GET  → cómo está cada reloj (¿está entrando la asistencia? ¿hace cuánto?)
//   POST → dejar un "Traer ahora" en el buzón
//
// 🩸 POR QUÉ EL BOTÓN NO PUEDE TRAER NADA POR SÍ MISMO.
// El reloj vive en `192.168.10.10`, una IP privada de la oficina. Esta función
// corre en Vercel, en un centro de datos. No hay ruta entre las dos y no la va
// a haber: es la razón entera por la que existe el agente local.
//
// Así que este POST **no llama al reloj**. Escribe `pedido_en` y el agente lo
// recoge en su vuelta siguiente (cada ~3 minutos). Es un buzón, no un timbre.
// La pantalla lo dice con esas palabras para que nadie espere magia.
//
// ⚠️ Y por eso mismo la pantalla tiene que poder decir "la PC está apagada".
// Un botón que gira para siempre es la peor respuesta posible: parece que algo
// está pasando cuando no está pasando nada.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import {
  DISPOSITIVO_FG,
  avisoMigracionAgente,
  esColumnaFaltante,
  estadoAgente,
  type FilaDispositivo,
} from "@/lib/asistencia/agente";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** `select("*")` a propósito: sin la migración corrida trae las columnas viejas
 *  y el estado se calcula igual — lo único que faltará es el pedido. */
async function leerRelojes(): Promise<{ filas: FilaDispositivo[]; error: string | null }> {
  const { data, error } = await supabaseServer
    .from("asistencia_dispositivos")
    .select("*")
    .order("dispositivo");
  if (error) return { filas: [], error: error.message };
  return { filas: (data ?? []) as FilaDispositivo[], error: null };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const { filas, error } = await leerRelojes();
  if (error) {
    console.error("[asistencia/reloj GET]", error);
    return NextResponse.json({ error: "No se pudo leer el estado del reloj." }, { status: 500 });
  }

  const ahora = Date.now();
  // Si todavía no hay ni un renglón, se muestra igual el del reloj de Fashion
  // Group con el cartel de "no está instalado". Una pantalla vacía no le
  // explica a nadie por qué no entran las marcaciones.
  const base: FilaDispositivo[] =
    filas.length > 0 ? filas : [{ dispositivo: DISPOSITIVO_FG }];

  return NextResponse.json({
    relojes: base.map((f) => ({
      dispositivo: f.dispositivo,
      leidoHasta: f.leido_hasta ?? null,
      agenteVersion: f.agente_version ?? null,
      ...estadoAgente(f, ahora),
    })),
    // `pedido_en` no está en la fila ⇒ la migración no corrió ⇒ el botón se
    // muestra deshabilitado con el nombre del archivo que falta.
    faltaMigracion: filas.length > 0 && !("pedido_en" in (filas[0] as object)),
    avisoMigracion: avisoMigracionAgente(),
  });
}

/**
 * Deja el pedido en el buzón. No espera al agente: responder rápido y dejar que
 * la pantalla haga *polling* es lo honesto — la respuesta real llega en la
 * vuelta siguiente del agente, no en este request.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let dispositivo = DISPOSITIVO_FG;
  try {
    const body = (await req.json()) as { dispositivo?: string };
    if (body?.dispositivo?.trim()) dispositivo = body.dispositivo.trim();
  } catch {
    /* sin cuerpo = el reloj de siempre */
  }

  const ahora = new Date().toISOString();
  const { error } = await supabaseServer.from("asistencia_dispositivos").upsert(
    {
      dispositivo,
      pedido_en: ahora,
      pedido_por: auth.userName ?? auth.role ?? null,
      updated_at: ahora,
    },
    { onConflict: "dispositivo" },
  );

  if (error) {
    if (esColumnaFaltante(error)) {
      return NextResponse.json(
        { error: avisoMigracionAgente(), faltaMigracion: true },
        { status: 503 },
      );
    }
    console.error("[asistencia/reloj POST]", error.message);
    return NextResponse.json({ error: "No se pudo enviar el pedido." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pedidoEn: ahora });
}
