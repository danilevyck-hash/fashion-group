// ─────────────────────────────────────────────────────────────────────────────
// POST /api/asistencia/ingest — por acá entran las marcaciones del reloj.
//
// La manda el agente que corre DENTRO de la oficina (el reloj vive en la red
// local y Vercel no puede alcanzarlo). Ver la migración
// 20260803180000_asistencia_marcaciones.sql para el porqué del diseño.
//
// ── AUTENTICACIÓN: CLAVE PROPIA, NO `CRON_SECRET` ────────────────────────────
// Esta credencial va a vivir en una PC de la oficina, que es un lugar mucho
// menos controlado que Vercel. Si se filtrara, `ASISTENCIA_INGEST_SECRET` solo
// deja escribir marcaciones; `CRON_SECRET` dejaría disparar TODOS los crons del
// sistema. Por eso es una llave aparte y no se reusa la que ya existe.
//
// Se compara en tiempo constante: comparar con `===` filtra el largo y los
// primeros caracteres por el tiempo que tarda.
//
// ── FAIL-CLOSED ──────────────────────────────────────────────────────────────
// Sin la variable configurada responde 503, nunca abierto. Un olvido de
// configuración no puede convertirse en una puerta sin llave.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizarEventos, ultimoInstante, type EventoCrudo } from "@/lib/asistencia/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tope por lote. El agente parte los rangos grandes; esto es la red de
 *  seguridad para que un pedido enorme no tumbe la función. */
const MAX_EVENTOS = 5000;

function claveValida(req: NextRequest): { ok: true } | { ok: false; res: NextResponse } {
  const esperado = process.env.ASISTENCIA_INGEST_SECRET;
  if (!esperado) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "ASISTENCIA_INGEST_SECRET no configurado en el servidor" },
        { status: 503 },
      ),
    };
  }
  const dado =
    req.headers.get("authorization")?.replace(/^Bearer /i, "") ??
    req.headers.get("x-asistencia-secret") ??
    "";
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  const igual = a.length === b.length && timingSafeEqual(a, b);
  if (!igual) {
    return { ok: false, res: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = claveValida(req);
  if (!auth.ok) return auth.res;

  let body: { dispositivo?: string; eventos?: EventoCrudo[]; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const dispositivo = (body.dispositivo ?? "").trim();
  if (!dispositivo) {
    return NextResponse.json({ error: "falta `dispositivo`" }, { status: 400 });
  }

  // El agente también reporta cuando NO pudo leer el reloj. Ese caso deja
  // rastro y NO toca `leido_hasta`: si se moviera, el rango fallido quedaría
  // saltado para siempre y esas marcaciones no se recuperarían nunca.
  if (body.error) {
    await supabaseServer.from("asistencia_dispositivos").upsert(
      {
        dispositivo,
        visto_en: new Date().toISOString(),
        ultimo_error: String(body.error).slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dispositivo" },
    );
    return NextResponse.json({ ok: true, registrado: "error" });
  }

  const eventos = Array.isArray(body.eventos) ? body.eventos : [];
  if (eventos.length > MAX_EVENTOS) {
    return NextResponse.json(
      { error: `demasiados eventos en un lote (${eventos.length} > ${MAX_EVENTOS})` },
      { status: 400 },
    );
  }

  const { filas, descartados } = normalizarEventos(dispositivo, eventos);

  if (filas.length > 0) {
    // `ignoreDuplicates` es el corazón del diseño: el repaso nocturno vuelve a
    // mandar días ya guardados y esto los ignora en silencio en vez de
    // duplicarlos. Sin esto, las horas trabajadas se inflarían cada noche.
    const { error } = await supabaseServer
      .from("asistencia_marcaciones")
      .upsert(filas, { onConflict: "dispositivo,evento_id", ignoreDuplicates: true });
    if (error) {
      // No se avanza `leido_hasta`: el rango se vuelve a pedir en la próxima
      // corrida. Preferimos repetir trabajo antes que perder una marcación.
      await supabaseServer.from("asistencia_dispositivos").upsert(
        {
          dispositivo,
          visto_en: new Date().toISOString(),
          ultimo_error: `guardar: ${error.message}`.slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "dispositivo" },
      );
      console.error("[asistencia/ingest] upsert falló:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // `leido_hasta` solo avanza si TODO salió bien.
  const hasta = ultimoInstante(filas);
  await supabaseServer.from("asistencia_dispositivos").upsert(
    {
      dispositivo,
      visto_en: new Date().toISOString(),
      ultimo_error: null,
      ...(hasta ? { leido_hasta: hasta } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dispositivo" },
  );

  if (descartados.length > 0) {
    // Nunca en silencio: si el reloj empieza a mandar algo que no entendemos,
    // tiene que quedar en el log del servidor.
    console.error(
      `[asistencia/ingest] ${dispositivo}: ${descartados.length} evento(s) descartado(s)`,
      descartados.slice(0, 3),
    );
  }

  return NextResponse.json({
    ok: true,
    recibidos: eventos.length,
    guardados: filas.length,
    descartados: descartados.length,
    leido_hasta: hasta,
  });
}

// GET — para que el agente sepa desde cuándo seguir sin depender de un archivo
// en la PC. Si alguien reinstala Windows, el hilo no se pierde.
export async function GET(req: NextRequest) {
  const auth = claveValida(req);
  if (!auth.ok) return auth.res;

  const dispositivo = (req.nextUrl.searchParams.get("dispositivo") ?? "").trim();
  if (!dispositivo) {
    return NextResponse.json({ error: "falta `dispositivo`" }, { status: 400 });
  }
  const { data, error } = await supabaseServer
    .from("asistencia_dispositivos")
    .select("dispositivo, leido_hasta, visto_en, ultimo_error")
    .eq("dispositivo", dispositivo)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ estado: data ?? { dispositivo, leido_hasta: null } });
}
