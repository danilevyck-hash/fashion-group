// GET /api/asistencia/reporte?desde=&hasta=&dispositivo=&q=
//
// El reporte completo: marcaciones + horarios + justificaciones + feriados,
// pasados por el motor de `lib/asistencia/reporte.ts`. Toda la regla vive allá;
// acá solo se junta el dato.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  armarReporte,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import {
  aplicarCorrecciones,
  avisoMigracionCorrecciones,
  contarCorrecciones,
  type MarcacionConId,
} from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerDirectorio, leerPersonas, vigenciasDeFilas, leerJustificaciones,
  leerVacaciones,
} from "@/lib/asistencia/config-server";
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";

function limite(dia: string, fin: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const ms = Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const desde = (sp.get("desde") ?? "").trim();
  const hasta = (sp.get("hasta") ?? "").trim();
  const iDesde = limite(desde, false);
  const iHasta = limite(hasta, true);
  if (!iDesde || !iHasta) {
    return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha inicial es posterior a la final" }, { status: 400 });
  }
  const dispositivo = (sp.get("dispositivo") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().toLowerCase();

  try {
    // Paginado con verificación contra el COUNT: un mes de dos relojes con 4
    // marcas diarias pasa de 1.000 filas, y PostgREST corta ahí EN SILENCIO.
    // Un reporte de horas recortado sin avisar es peor que uno que falla.
    const marcaciones = await leerTodoPaginado<MarcacionConId>(
      "asistencia_marcaciones (reporte)",
      (pedirCount, from, to) => {
        let sel = supabaseServer
          .from("asistencia_marcaciones")
          // 🔑 El `id` es lo que ata la corrección a SU marcación. Sin él no se
          // podría saber cuál de las 4 marcas del día se corrigió.
          .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", iDesde)
          .lte("ocurrio_en", iHasta);
        if (dispositivo) sel = sel.eq("dispositivo", dispositivo);
        return sel.order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to);
      },
    );

    // Las reglas configuradas. Sin la migración corrida devuelve los valores por
    // defecto en vez de tirar: el reporte tiene que salir igual.
    // El directorio, en el mismo viaje: es el único lugar que traduce el código
    // del reloj a un nombre, y de él salen también el Excel y el PDF.
    const [{ reglas }, { directorio }, correcciones, personasDb] = await Promise.all([
      leerReglas(),
      leerDirectorio(),
      // Sin la tabla corrida devuelve CERO correcciones, o sea exactamente los
      // números que este reporte daba antes de que las correcciones existieran.
      leerCorrecciones(desde, hasta),
      // Las fichas: de acá sale QUIÉN estaba trabajando en el rango. Ver abajo.
      leerPersonas(),
    ]);
    const nombres = new Map<string, string>(
      directorio.codigos().map((c) => [c, directorio.etiqueta(c)]),
    );

    const [hRes, jRes, vRes, fRes] = await Promise.all([
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      // 🔑 Por la fuente ÚNICA, no con un `select` copiado: es lo que hace que
      // el reporte y la planilla no puedan leer distinto la misma fila.
      leerJustificaciones(desde, hasta),
      // 🔴 LAS VACACIONES, por la MISMA puerta que usa la planilla. Sin esto,
      // un día de vacaciones se leería como ausencia acá y como vacación allá.
      // Sin la tabla corrida devuelve CERO filas y el reporte es el de siempre.
      leerVacaciones(desde, hasta),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
    ]);
    if (hRes.error) throw new Error(hRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);

    // 🔴 LAS CORRECCIONES SE APLICAN ANTES DE CALCULAR NADA. Lo que se le pasa
    // al motor es la lista EFECTIVA: la del reloj con las horas corregidas
    // encima, más las marcaciones que el reloj nunca registró. La tabla
    // `asistencia_marcaciones` queda intacta — acá solo se toca una COPIA.
    const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);

    // 🔑 El filtro va DESPUÉS de aplicar: una marcación AGREGADA no trae nombre
    // del reloj, así que filtrarla antes la dejaría fuera de la búsqueda por
    // nombre justo en el día que alguien acaba de corregir.
    // 🩸 La búsqueda mira el nombre del DIRECTORIO además del código. Buscando
    // solo en la marcación, escribir "BRICEIDA" no encontraba nada: el reloj
    // manda `empleado_nombre` vacío en las 3.287 filas cargadas.
    const visibles = q
      ? efectivas.marcaciones.filter((m) => {
          const cod = (m.empleado_codigo ?? "").trim();
          return (
            cod.toLowerCase().includes(q) ||
            (m.empleado_nombre ?? "").toLowerCase().includes(q) ||
            (nombres.get(cod) ?? "").toLowerCase().includes(q)
          );
        })
      : efectivas.marcaciones;

    // ── 🔴 QUIÉN SALE: EL QUE ESTABA TRABAJANDO EN EL RANGO CONSULTADO ────────
    //
    // Daniel se dio de baja y siguió apareciendo en su propio reporte de "quién
    // marca mal" — textual: *"ya te dije q eliminares a DANIEL LEVY"*. Las
    // marcaciones históricas de un dado de baja NO se borran (son la prueba de
    // lo que pasó), pero la persona no tiene por qué salir en el reporte de hoy.
    //
    // 🔑 LA REGLA NO ES "ESCONDER A LOS INACTIVOS". Alguien que trabajó en julio
    // y se fue en agosto **tiene que seguir saliendo en el reporte de julio**: si
    // no, la planilla de julio y el reporte de julio dejan de cuadrar y no habría
    // forma de auditar el mes que ya se pagó. La pregunta correcta es *¿estaba
    // trabajando durante ESTE rango?* y la contesta `trabajaEnRango`
    // (`fecha_ingreso` / `fecha_salida`), la MISMA que ya usa la planilla — no
    // una segunda regla que pueda decir otra cosa.
    //
    // ⚠️ FALLA ABIERTO, en las dos formas en que puede fallar: sin la migración
    // de altas/bajas corrida las fichas vienen sin fechas y nadie queda fuera, y
    // un código que marca pero todavía no tiene ficha tampoco (`trabajaEnRango`
    // devuelve `true` sin ficha). Esconder a alguien por no haber podido leer su
    // ficha sería peor que mostrarlo de más.
    const vigencias = vigenciasDeFilas(personasDb.filas);
    const fuera = codigosFueraDeRango(vigencias, desde, hasta);
    const enRango = fuera.size
      ? visibles.filter((m) => !fuera.has((m.empleado_codigo ?? "").trim()))
      : visibles;
    // Cuántas personas se sacaron: la pantalla lo DICE. Una persona que
    // desaparece sin explicación se lee como un dato que falta.
    const fueraDelRango = fuera.size
      ? new Set(
          visibles
            .map((m) => (m.empleado_codigo ?? "").trim())
            .filter((c) => fuera.has(c)),
        ).size
      : 0;

    const personas = armarReporte({
      marcaciones: enRango,
      horarios: (hRes.data ?? []).map((h) => ({
        ...h,
        // Postgres devuelve time como "08:00:00"; el motor compara "HH:MM".
        entrada: String(h.entrada).slice(0, 5),
        salida: String(h.salida).slice(0, 5),
      })) as HorarioPersona[],
      justificaciones: jRes.filas,
      vacaciones: vRes.filas,
      feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
      desde,
      hasta,
      reglas,
      nombres,
      // 🔴 EL DÍA EN CURSO ES EL DE PANAMÁ (UTC−5 fijo), no el de UTC. Calculado
      // en UTC pelado, entre las 7 p.m. y la medianoche el día salta al
      // siguiente: el reporte dejaría de proteger el día real y empezaría a
      // "proteger" mañana, o sea se equivocaría todas las noches. `hoyPanama()`
      // ya existe y es la única definición de "hoy" del sistema — no se escribe
      // una segunda acá.
      // ⚠️ Se pasa SIEMPRE, sin mirar si cae dentro del rango: si el rango
      // termina antes de hoy, ningún día del recorrido coincide y no hay nada
      // que excluir. El borde se resuelve solo.
      diaEnCurso: hoyPanama(),
      // Solo para MOSTRAR: las horas corregidas ya vienen dentro de `enRango`.
      correccionesPorDia: efectivas.porDia,
    });

    return NextResponse.json({
      personas,
      desde,
      hasta,
      // Lo que la pantalla necesita para que NADIE lea un total sin enterarse
      // de que hay horas tocadas a mano.
      correcciones: contarCorrecciones(efectivas.porDia),
      // Sin la migración corrida la pantalla NO ofrece corregir y lo dice: un
      // botón que siempre falla es peor que no tenerlo.
      correccionesDisponible: !correcciones.faltaMigracion,
      avisoCorrecciones: correcciones.faltaMigracion ? avisoMigracionCorrecciones() : null,
      // Se devuelven para que la pantalla, el Excel y el PDF digan los MISMOS
      // números que usó el motor. Un pie de página que dice "5 de tolerancia"
      // mientras el cálculo usa 10 es peor que no decir nada.
      reglas,
      // Para que la pantalla pueda avisar si alguien no tiene horario fijado:
      // sin él se asume 17:00 y el número puede estar mal.
      sinHorario: personas.filter((p) => !(hRes.data ?? []).some((h) => h.empleado_codigo === p.codigo)).length,
      marcaciones: enRango.length,
      // Cuántas personas quedaron fuera por no estar trabajando en este rango
      // (se fueron antes o entraron después). La pantalla lo dice en una línea.
      fueraDelRango,
      // El día que sigue corriendo, si cae dentro del rango. `null` cuando el
      // rango termina antes de hoy: ahí no hay nada en curso que aclarar.
      diaEnCurso: hoyPanama() >= desde && hoyPanama() <= hasta ? hoyPanama() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/reporte]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
