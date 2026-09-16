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
import { guardarMarcaciones } from "@/lib/asistencia/guardar-marcaciones";
import { esColumnaFaltante, type FilaDispositivo } from "@/lib/asistencia/agente";

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
    // 🩸 ACÁ SE MANDABA «Falló 3 veces seguidas» POR TELEGRAM. Se retiró el
    // 15-sep-2026: el reloj de Multifashion vive en la tienda, que cierra a las
    // 7, así que todas las noches se acumulaban tres fallas y sonaba el
    // teléfono (cuatro mensajes en 35 minutos, la noche que Daniel lo mostró).
    // Ahora avisa UN solo lugar, el vigía, a las 24 h sin poder LEER el reloj y
    // de lunes a viernes. Ver `agente.ts`.
    //
    // 🔴 NO SE TOCA `alertado_en` EN ESTA RAMA: es el candado del vigía, y un
    // reporte de error no cierra ni abre su episodio. Lo pone en NULL el camino
    // del ÉXITO, que es cuando el problema de verdad se arregló.
    //
    // `fallos_seguidos` se sigue llevando como DIAGNÓSTICO (la columna no se
    // dropea, patrón `mayor_lineas`): se ve en la base cuando hace falta
    // entender un episodio, y nadie decide nada con ella.
    const fallos = Math.max(0, previa?.fallos_seguidos ?? 0) + 1;
    await guardarEstado(
      { dispositivo, visto_en: ahora, ultimo_error: motivo, updated_at: ahora },
      { fallos_seguidos: fallos, ...extraPedido, ...extraVersion },
    );
    return NextResponse.json({ ok: true, registrado: "error", fallosSeguidos: fallos });
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
    // 🔴 SE ESCRIBE POR LA PUERTA ÚNICA (14-sep-2026). El upsert vivía acá
    // adentro y se mudó a `lib/asistencia/guardar-marcaciones.ts` cuando nació
    // la segunda FUENTE de marcaciones (el reloj del teléfono, /api/marcacion):
    // las dos tienen que escribir con el MISMO `onConflict` sobre
    // `(dispositivo, evento_id)` e `ignoreDuplicates`, que es el corazón del
    // diseño —el repaso nocturno vuelve a mandar días ya guardados y esto los
    // ignora en silencio en vez de duplicarlos—. Dos escrituras con dos formas
    // de deduplicar es exactamente cómo se duplicaron las 134 marcaciones de
    // agosto (ver `asistencia-una-sola-entrada.test.ts`).
    const { error } = await guardarMarcaciones(filas);
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
  // 🔴 ACÁ SE ESCRIBE `leido_ok_en`, Y SOLO ACÁ (15-sep-2026). Es el instante
  // en que el reloj se pudo LEER, que es lo que el vigía mide para decir «lleva
  // más de 24 horas sin poder leerse». No es `visto_en`: ese se mueve también
  // en la rama del error, y por eso un reloj inalcanzable con la PC prendida
  // —el caso de Multifashion— nunca habría sonado.
  //
  // ⚠️ Se escribe aunque no venga ni una marcación nueva: una vuelta que llegó
  // al reloj y encontró el día vacío ES una lectura buena. `leido_hasta`, en
  // cambio, solo avanza cuando hay algo que traer.
  //
  // 🩸 Y ACÁ SE MANDABA EL «ya volvieron a entrar las marcaciones». Se retiró
  // con el aviso de la caída: con un umbral de 24 h, tranquilizar por un bajón
  // corto no le sirve a nadie, y era la mitad del ruido nocturno.
  //
  // `alertado_en: null` SE QUEDA: es lo que rearma el candado del vigía cuando
  // el problema se arregló de verdad.
  await guardarEstado(
    {
      dispositivo,
      visto_en: ahora,
      ultimo_error: null,
      ...(hasta ? { leido_hasta: hasta } : {}),
      updated_at: ahora,
    },
    { fallos_seguidos: 0, alertado_en: null, leido_ok_en: ahora, ...extraPedido, ...extraVersion },
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
