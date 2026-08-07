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
import { enviarSistema } from "@/lib/alertas/canal";
import {
  decidirAlerta,
  esColumnaFaltante,
  textoCaido,
  textoRecuperado,
  type FilaDispositivo,
} from "@/lib/asistencia/agente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tope por lote. El agente parte los rangos grandes; esto es la red de
 *  seguridad para que un pedido enorme no tumbe la función. */
const MAX_EVENTOS = 5000;

/**
 * Guarda el estado del reloj AGUANTANDO QUE LA MIGRACIÓN NO ESTÉ CORRIDA.
 *
 * 🩸 En este proyecto los DDL los corre Daniel a mano y varios esperaron
 * semanas. Si el ingest se cayera con 500 porque falta `pedido_en`, el síntoma
 * sería "la asistencia dejó de entrar" — o sea, un archivo SQL sin correr
 * apagaría el módulo entero. Por eso: se intenta con los campos nuevos y, si
 * PostgREST dice que la columna no existe, se reintenta con los de siempre.
 *
 * `base` son los campos que existen desde la migración original; `extra` los
 * que agrega `20260806200000`. Solo `extra` puede fallar por esta razón.
 */
async function guardarEstado(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<{ faltaMigracion: boolean }> {
  const { error } = await supabaseServer
    .from("asistencia_dispositivos")
    .upsert({ ...base, ...extra }, { onConflict: "dispositivo" });
  if (!error) return { faltaMigracion: false };
  if (!esColumnaFaltante(error)) {
    console.error("[asistencia/ingest] no se pudo guardar el estado:", error.message);
    return { faltaMigracion: false };
  }
  await supabaseServer.from("asistencia_dispositivos").upsert(base, { onConflict: "dispositivo" });
  return { faltaMigracion: true };
}

/** El renglón actual del reloj. `select("*")` a propósito: trae las columnas
 *  que existan y no falla cuando faltan las nuevas. */
async function leerFila(dispositivo: string): Promise<FilaDispositivo | null> {
  const { data } = await supabaseServer
    .from("asistencia_dispositivos")
    .select("*")
    .eq("dispositivo", dispositivo)
    .maybeSingle();
  return (data as FilaDispositivo | null) ?? null;
}

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

  let body: {
    dispositivo?: string;
    eventos?: EventoCrudo[];
    error?: string;
    /** El `pedido_en` que el agente vio al arrancar esta vuelta. Ver más abajo
     *  por qué se manda el INSTANTE y no un simple `true`. */
    atendioPedido?: string;
    agenteVersion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const dispositivo = (body.dispositivo ?? "").trim();
  if (!dispositivo) {
    return NextResponse.json({ error: "falta `dispositivo`" }, { status: 400 });
  }

  const ahora = new Date().toISOString();
  const previa = await leerFila(dispositivo);

  /**
   * ⚠️ EL PEDIDO SE CIERRA COMPARANDO INSTANTES, NO CON UN BOOLEAN.
   *
   * El agente manda el `pedido_en` que leyó al ARRANCAR la vuelta. Si mientras
   * trabajaba alguien apretó "Traer ahora" otra vez, `pedido_en` en la base ya
   * es más nuevo y NO se cierra: queda pendiente para la vuelta siguiente. Con
   * un `atendido: true` esa segunda pulsación se habría perdido en silencio y
   * el usuario no tendría forma de notarlo.
   */
  const cierraPedido =
    !!body.atendioPedido &&
    !!previa?.pedido_en &&
    Date.parse(body.atendioPedido) >= Date.parse(previa.pedido_en);
  const extraPedido = cierraPedido ? { pedido_atendido_en: ahora } : {};
  const extraVersion = body.agenteVersion
    ? { agente_version: String(body.agenteVersion).slice(0, 40) }
    : {};

  // El agente también reporta cuando NO pudo leer el reloj. Ese caso deja
  // rastro y NO toca `leido_hasta`: si se moviera, el rango fallido quedaría
  // saltado para siempre y esas marcaciones no se recuperarían nunca.
  if (body.error) {
    const motivo = String(body.error).slice(0, 500);
    // Regla de las tres: se avisa a la TERCERA falla seguida, no a la primera.
    // Un reinicio del reloj o un corte de dos minutos se arregla solo, y eso es
    // el sistema funcionando bien — no un incidente que despierte a nadie.
    const d = decidirAlerta(
      { fallosSeguidos: previa?.fallos_seguidos ?? 0, alertadoEn: previa?.alertado_en ?? null },
      "falla",
      ahora,
    );
    const { faltaMigracion } = await guardarEstado(
      { dispositivo, visto_en: ahora, ultimo_error: motivo, updated_at: ahora },
      {
        fallos_seguidos: d.fallosSeguidos,
        alertado_en: d.alertadoEn,
        ...extraPedido,
        ...extraVersion,
      },
    );
    // Sin la migración corrida no hay contador que persista, así que NO se
    // avisa: mandar Telegram con un contador que siempre vale 1 sería avisar en
    // cada tropiezo, justo lo que la regla prohíbe. El vigía diario igual lo ve.
    if (d.alerta === "caido" && !faltaMigracion) {
      await enviarSistema(textoCaido(dispositivo, motivo));
    }
    return NextResponse.json({ ok: true, registrado: "error", fallosSeguidos: d.fallosSeguidos });
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
      // Tampoco se cierra el pedido: la vuelta no cumplió lo que se le pidió.
      await guardarEstado(
        {
          dispositivo,
          visto_en: ahora,
          ultimo_error: `guardar: ${error.message}`.slice(0, 500),
          updated_at: ahora,
        },
        extraVersion,
      );
      console.error("[asistencia/ingest] upsert falló:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // `leido_hasta` solo avanza si TODO salió bien.
  const hasta = ultimoInstante(filas);
  const d = decidirAlerta(
    { fallosSeguidos: previa?.fallos_seguidos ?? 0, alertadoEn: previa?.alertado_en ?? null },
    "exito",
    ahora,
  );
  const { faltaMigracion } = await guardarEstado(
    {
      dispositivo,
      visto_en: ahora,
      ultimo_error: null,
      ...(hasta ? { leido_hasta: hasta } : {}),
      updated_at: ahora,
    },
    { fallos_seguidos: 0, alertado_en: null, ...extraPedido, ...extraVersion },
  );

  // El "ya volvió" NO es ruido: sin él Daniel se queda con la última noticia
  // mala y va a la oficina a revisar algo que ya se arregló solo.
  if (d.alerta === "recuperado" && !faltaMigracion) {
    await enviarSistema(textoRecuperado(dispositivo));
  }

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
    pedidoCerrado: cierraPedido,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — dos cosas para el agente, en una sola llamada:
//
//   1. desde cuándo seguir (`leido_hasta`), para que el hilo no dependa de un
//      archivo en la PC — si alguien reinstala Windows no se pierde;
//   2. si hay un "Traer ahora" esperando (`pedido_en`).
//
// 🔑 ES EL AGENTE EL QUE PREGUNTA, no Vercel el que llama. El reloj y la PC
// están detrás de una IP privada: desde afuera no se les puede tocar la puerta.
// Por eso el botón deja un pedido en el buzón y el agente lo recoge.
//
// `select("*")` a propósito: sin la migración corrida devuelve lo que hay, sin
// `pedido_en`, y el agente simplemente no ve pedidos. Nada se rompe.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = claveValida(req);
  if (!auth.ok) return auth.res;

  const dispositivo = (req.nextUrl.searchParams.get("dispositivo") ?? "").trim();
  if (!dispositivo) {
    return NextResponse.json({ error: "falta `dispositivo`" }, { status: 400 });
  }
  const { data, error } = await supabaseServer
    .from("asistencia_dispositivos")
    .select("*")
    .eq("dispositivo", dispositivo)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fila = (data as FilaDispositivo | null) ?? null;
  const pedidoEn = fila?.pedido_en ?? null;
  const atendido = fila?.pedido_atendido_en ?? null;
  const pedidoPendiente =
    !!pedidoEn && (!atendido || Date.parse(atendido) < Date.parse(pedidoEn));

  return NextResponse.json({
    estado: fila ?? { dispositivo, leido_hasta: null },
    // Lo que el agente necesita decidir en una línea, sin re-implementar la
    // comparación de instantes en JavaScript de Windows.
    pedidoPendiente,
    pedidoEn: pedidoPendiente ? pedidoEn : null,
  });
}
