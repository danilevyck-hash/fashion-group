// GET   /api/asistencia/planilla-guardada?empresa=vistana&desde=2026-08-01&hasta=2026-08-15
// GET   /api/asistencia/planilla-guardada?id=<uuid>        → el cuadro congelado
// POST  /api/asistencia/planilla-guardada   { empresa, desde, hasta }  → CERRAR
// PATCH /api/asistencia/planilla-guardada   { id, motivo }             → REABRIR
//
// ─────────────────────────────────────────────────────────────────────────────
// EL FLUJO QUE APROBÓ DANIEL:
//
//   elegir período → [Generar] → BORRADOR → revisar → [Cerrar quincena]
//                                       → CERRADA → [Reabrir] (con motivo)
//
// «Generar» y «revisar» YA EXISTEN: son /api/asistencia/planilla. Y BORRADOR no
// es una tabla —es el estado de un período que todavía no tiene una fila
// cerrada—, así que esta ruta es SOLO el cerrar, el reabrir y el leer lo cerrado.
// Guardar además una copia del borrador habría estrenado un segundo lugar donde
// vive «la planilla», con la garantía de que un día diga algo distinto del
// cálculo.
//
// ── 🔴 LO QUE SE CONGELA ES LO QUE LA RUTA CALCULA, NO LO QUE MANDÓ EL
//    NAVEGADOR
//
// Se guarda el RESULTADO, no la receta: los montos, uno por uno. El POST NO
// acepta montos. Recibe un rango y una empresa, y vuelve a pedirle el
// cuadro a `/api/asistencia/planilla` —el handler REAL, con la MISMA cookie— y
// congela ESO. Las dos razones apuntan al mismo lado:
//
//   1. SEGURIDAD. Un cuerpo con `netoPagar` adentro convierte a cualquiera que
//      tenga el módulo en alguien que puede escribir el sueldo que quiera en el
//      registro de lo que se pagó, sin dejar rastro de que el número no salió
//      del reloj.
//   2. UNA SOLA ARITMÉTICA. Es la misma decisión que ya tomó la pantalla de
//      Boston: *«reimplementar la planilla habría estrenado una SEGUNDA
//      aritmética de sueldos al lado de la que la contadora ya cotejó al
//      centavo, y su modo de fallo es que dos pantallas paguen distinto»*.
//      Recalcular acá sería exactamente eso.
//
// ⚠️ El precio, dicho: guardar cuesta un cálculo completo más. Es una vez por
// quincena y por empresa —seis veces al mes— contra la alternativa de tener dos
// motores de sueldo. No se discutió mucho.
//
// 🔑 Y hay un guard que lo cierra: si el cuadro que vuelve NO es de la empresa
// que se pidió (el aprobador acotado y David reciben la empresa FORZADA, no la
// del query), se rechaza. Congelar como «Vistana» un cuadro que trae las tres
// empresas sería inventar una planilla que nadie revisó.
//
// ── QUIÉN ENTRA, Y SON DOS PUERTAS DISTINTAS ────────────────────────────────
//
// 🔴 LEER: `asistenciaRoles()` — la secretaria puede mirar lo cerrado.
// 🔴 CERRAR y REABRIR: `cerrarPlanillaRoles()` = admin + contabilidad. Cerrar la
//    quincena es la firma de un pago y quien arma la planilla es la contadora.
//
// Y NINGUNA de las dos abre las otras dos puertas de /planilla: quien solo
// aprueba (Julio, con el usuario `bodega`) recibe ese cuadro SIN el bloque de
// dinero a propósito, y David lo recibe sin sueldos por `VE_SUELDOS_DE_BOSTON`.
// Dejarlos leer la tabla congelada sería devolverles por la ventana los sueldos
// que la otra ruta les recorta en el servidor.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { GET as calcularPlanilla } from "@/app/api/asistencia/planilla/route";
import {
  periodoDeQuincena,
  periodoDesdeRango,
  quincenaDesdeClave,
  type LineaPlanilla,
  type Periodo,
} from "@/lib/asistencia/planilla";
import {
  solapadasDe,
  textoSolapamiento,
  validarGuardado,
  esCerrada,
  estadoDelCuadro,
  frenosParaCerrar,
  textoFrenos,
  motivoReaperturaValido,
  cerrarPlanillaRoles,
  avisoMigracionPlanillaGuardada,
} from "@/lib/asistencia/planilla-guardada";
import type { SugerenciaPrestamo } from "@/lib/asistencia/prestamos-planilla";
import {
  cerrarPlanilla,
  leerCabecera,
  leerCabeceras,
  leerLineasGuardadas,
  reabrirPlanilla,
} from "@/lib/asistencia/planilla-guardada-server";

/** El período que se pidió, por cualquiera de los dos caminos. */
function periodoDe(quincenaRaw: unknown, desde: string, hasta: string): Periodo | null {
  const clave = typeof quincenaRaw === "string" ? quincenaRaw.trim() : "";
  if (clave) {
    const q = quincenaDesdeClave(clave);
    return q ? periodoDeQuincena(q) : null;
  }
  return periodoDesdeRango(desde, hasta);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — qué hay cerrado
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const id = (sp.get("id") ?? "").trim();

  try {
    if (id) {
      const { cabecera, faltaTabla } = await leerCabecera(id);
      if (faltaTabla) {
        return NextResponse.json({ ok: true, cabecera: null, lineas: [], aviso: avisoMigracionPlanillaGuardada() });
      }
      if (!cabecera) {
        return NextResponse.json({ error: "Esa planilla guardada no existe." }, { status: 404 });
      }
      // 🔴 Los renglones se devuelven TAL CUAL se congelaron. Acá no se
      // recalcula ni se completa nada: si un número se ve raro, es el número que
      // se pagó, y taparlo con un cálculo de hoy sería perder el único registro.
      const lineas = await leerLineasGuardadas(id);
      return NextResponse.json({ ok: true, cabecera, lineas, aviso: null });
    }

    const empresa = (sp.get("empresa") ?? "").trim();
    if (!empresa) {
      return NextResponse.json({ error: "Falta la empresa." }, { status: 400 });
    }
    const { cabeceras, faltaTabla } = await leerCabeceras(empresa);
    if (faltaTabla) {
      return NextResponse.json({
        ok: true, empresa, estado: "borrador", cerrada: null, solapadas: [], historial: [],
        aviso: avisoMigracionPlanillaGuardada(),
      });
    }

    const desde = (sp.get("desde") ?? "").trim();
    const hasta = (sp.get("hasta") ?? "").trim();
    const rango = desde && hasta ? { desde, hasta } : null;
    // Las que PISAN el rango pedido. La que coincide exacto viaja además aparte
    // como `cerrada`: es la que la pantalla tiene que mostrar como «esta
    // quincena ya está cerrada, con botón de reabrir».
    const solapadas = rango ? solapadasDe(empresa, rango, cabeceras) : [];
    const cerrada = rango
      ? solapadas.find((c) => c.desde === rango.desde && c.hasta === rango.hasta) ?? null
      : null;

    return NextResponse.json({
      ok: true,
      empresa,
      // El vocabulario de Daniel, calculado en el servidor para que la pantalla
      // no tenga que deducirlo: o el período está CERRADO, o es un BORRADOR.
      estado: rango ? estadoDelCuadro(empresa, rango, cabeceras) : null,
      cerrada,
      // Las que se pisan SIN ser la misma: son las que impiden cerrar.
      solapadas: solapadas.filter((c) => c.id !== cerrada?.id),
      // ⚠️ El historial trae TAMBIÉN las reabiertas. Reabrir no borra, así que
      // lo que se pagó en su momento se tiene que poder seguir mirando.
      historial: cabeceras,
      aviso: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla-guardada GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — CERRAR LA QUINCENA (congelar)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 🔴 CERRAR es contabilidad y admin. La secretaria genera y mira; no firma.
  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // El período primero: de él salen las fechas con las que se valida todo lo
    // demás, y `?quincena=2026-08-1` tiene que dar EXACTAMENTE el mismo cuadro
    // que el rango que coincide con sus cortes (hay test en el motor que lo
    // exige, y acá se apoya en eso en vez de repetirlo).
    const periodo = periodoDe(
      body?.quincena,
      typeof body?.desde === "string" ? body.desde.trim() : "",
      typeof body?.hasta === "string" ? body.hasta.trim() : "",
    );
    if (!periodo) {
      return NextResponse.json({ error: "El período no sirve." }, { status: 400 });
    }

    const v = validarGuardado(body?.empresa, periodo.desde, periodo.hasta);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const { empresa, desde, hasta } = v;

    // 🔴 LA FIRMA SALE DE LA SESIÓN, NUNCA DEL CUERPO. Es la misma regla que las
    // correcciones de marcación: si «todos los de Asistencia pueden», sin firma
    // «todos pueden» se vuelve «nadie sabe quién fue».
    const usuario = String(auth.userName ?? "").trim();
    if (!usuario) {
      return NextResponse.json({ error: "La sesión no dice quién sos." }, { status: 400 });
    }

    // ── EL FRENO DEL SOLAPAMIENTO, ANTES DE ESCRIBIR NADA ──────────────────
    const { cabeceras, faltaTabla } = await leerCabeceras(empresa);
    if (faltaTabla) {
      // 503 y NO 200: decir «listo, cerrada» sobre algo que no se escribió es el
      // único desenlace inaceptable acá.
      return NextResponse.json(
        { ok: false, faltaTabla: true, aviso: avisoMigracionPlanillaGuardada() },
        { status: 503 },
      );
    }
    const solapadas = solapadasDe(empresa, { desde, hasta }, cabeceras);
    if (solapadas.length > 0) {
      return NextResponse.json(
        { ok: false, error: textoSolapamiento(solapadas), solapadas },
        { status: 409 },
      );
    }

    // ── EL CÁLCULO, POR EL CAMINO DE SIEMPRE ───────────────────────────────
    const url = new URL("/api/asistencia/planilla", req.nextUrl.origin);
    url.searchParams.set("empresa", empresa);
    url.searchParams.set("desde", desde);
    url.searchParams.set("hasta", hasta);
    // Solo la cookie: el resto de los encabezados son los del POST (content-type,
    // largo del cuerpo) y no tienen nada que hacer en un GET sin cuerpo.
    const headers = new Headers();
    const cookie = req.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const resp = await calcularPlanilla(new NextRequest(url, { headers }));
    if (resp.status !== 200) {
      const detalle = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: (detalle as { error?: string }).error ?? "No se pudo calcular la planilla." },
        { status: resp.status },
      );
    }
    const cuadro = (await resp.json()) as {
      empresa: string | null;
      periodo: { desde: string; hasta: string; claveManuales: string | null; factorBase: number };
      lineas: LineaPlanilla[];
      prestamos?: SugerenciaPrestamo[];
    };

    // 🔴 EL GUARD DE LA EMPRESA Y DEL PERÍODO. La otra ruta FUERZA la empresa
    // para David y para un aprobador acotado (se fuerza, no se valida, para que
    // un marcador viejo no deje la pantalla en blanco) — así que lo que vuelve
    // puede no ser lo que se pidió. Congelar un cuadro de las TRES empresas
    // rotulado «Vistana» sería inventar una planilla que nadie revisó.
    if (cuadro.empresa !== empresa || cuadro.periodo?.desde !== desde || cuadro.periodo?.hasta !== hasta) {
      return NextResponse.json(
        { ok: false, error: "El cuadro que se calculó no es el que se pidió. No se cerró nada." },
        { status: 409 },
      );
    }
    const lineas = Array.isArray(cuadro.lineas) ? cuadro.lineas : [];
    if (lineas.length === 0) {
      // Una planilla vacía no es un cuadro: es un rango sin gente. Cerrarla
      // dejaría un «se pagó $0» que además bloquea el rango.
      return NextResponse.json(
        { ok: false, error: "Ese período no tiene a nadie en esta empresa. No hay nada que cerrar." },
        { status: 400 },
      );
    }

    // ── 🔴 LOS FRENOS: sin aprobar, NO se cierra ───────────────────────────
    //
    // Hoy la planilla AVISA en ámbar y deja seguir, y mientras es un borrador
    // está bien. Al cerrar ya no: lo que queda escrito sería un pago sin las
    // horas que alguien trabajó de verdad, y el aviso no le devuelve la plata.
    // Se rechaza con 409 y el texto dice a qué pestaña ir.
    const frenos = frenosParaCerrar(lineas, cuadro.prestamos ?? []);
    if (frenos.length > 0) {
      return NextResponse.json(
        { ok: false, error: textoFrenos(frenos), frenos },
        { status: 409 },
      );
    }

    const r = await cerrarPlanilla({
      empresa,
      desde,
      hasta,
      // La clave de la quincena cuando el rango ES una quincena. `null` en un
      // rango libre: es la misma clave con la que se guardan los montos a mano,
      // y su CHECK no acepta otra cosa.
      quincena: cuadro.periodo?.claveManuales ?? null,
      factorBase: cuadro.periodo?.factorBase ?? periodo.factorBase,
      usuario,
      lineas,
      // De acá sale la VERSIÓN: las cabeceras ya se leyeron para el solapamiento
      // y no se vuelve a consultar la base para contar.
      yaGuardadas: cabeceras,
    });
    if (r.faltaTabla) {
      return NextResponse.json(
        { ok: false, faltaTabla: true, aviso: avisoMigracionPlanillaGuardada() },
        { status: 503 },
      );
    }
    if (r.choque) {
      // El EXCLUDE de la base. Se llega acá cuando dos personas cierran rangos
      // que se pisan casi al mismo tiempo: el chequeo de arriba no alcanza y la
      // base es el último freno.
      return NextResponse.json(
        { ok: false, error: "Alguien acaba de cerrar una quincena que se pisa con estas fechas. No se cerró nada." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true, id: r.id, version: r.version, totales: r.totales, empresa, desde, hasta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla-guardada POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — REABRIR
//
// 🔴 NO BORRA NADA. La cabecera y sus renglones se quedan enteros; lo único que
// cambia es el estado, y se firma quién y cuándo. El cuadro que se pagó se sigue
// pudiendo leer después de reabierto — es la misma forma que «deshacer» una
// corrección de marcación, que escribe `anulada_en` en vez de borrar la fila.
//
// 🔴 VERSIONES, NO EDICIONES: la v1 queda entera —sus montos, su firma, quién la
// cerró— y el próximo cierre del mismo período nace como v2.
//
// ⚠️ Reabrir LIBERA el rango: recién ahí el período vuelve a ser un BORRADOR y
// se puede volver a generar y cerrar. Eso es a propósito y es la razón de que
// reabrir exista.
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  // Reabrir deshace una firma de pago: la misma puerta que cerrar.
  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Falta cuál planilla reabrir." }, { status: 400 });

    const usuario = String(auth.userName ?? "").trim();
    if (!usuario) return NextResponse.json({ error: "La sesión no dice quién sos." }, { status: 400 });

    const { cabecera, faltaTabla } = await leerCabecera(id);
    if (faltaTabla) {
      return NextResponse.json(
        { ok: false, faltaTabla: true, aviso: avisoMigracionPlanillaGuardada() },
        { status: 503 },
      );
    }
    if (!cabecera) return NextResponse.json({ error: "Esa planilla guardada no existe." }, { status: 404 });
    if (!esCerrada(cabecera.estado)) {
      return NextResponse.json(
        { ok: false, error: `Esa quincena ya estaba reabierta${cabecera.reabiertaPor ? ` por ${cabecera.reabiertaPor}` : ""}.` },
        { status: 409 },
      );
    }

    // 🔴 EL MOTIVO ES OBLIGATORIO, igual que el de una corrección de marcación:
    // reabrir un cierre es tocar un pago ya firmado, y sin el porqué escrito
    // nadie puede reconstruir dentro de un mes por qué los números cambiaron.
    // ⚠️ Se valida ACÁ y en la base: `NOT NULL` a secas deja pasar `"   "`.
    const motivo = motivoReaperturaValido(body?.motivo);
    if (!motivo) {
      return NextResponse.json(
        { error: "Escribí por qué se reabre esta quincena. Queda registrado con tu nombre." },
        { status: 400 },
      );
    }
    const r = await reabrirPlanilla(id, usuario, motivo);
    if (r.faltaTabla) {
      return NextResponse.json(
        { ok: false, faltaTabla: true, aviso: avisoMigracionPlanillaGuardada() },
        { status: 503 },
      );
    }
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: "Esa quincena ya estaba reabierta." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla-guardada PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
