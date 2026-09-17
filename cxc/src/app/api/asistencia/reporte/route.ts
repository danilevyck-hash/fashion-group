// GET /api/asistencia/reporte?desde=&hasta=&dispositivo=&q=
//
// El reporte completo: marcaciones + horarios + justificaciones + feriados,
// pasados por el motor de `lib/asistencia/reporte.ts`. Toda la regla vive allá;
// acá solo se junta el dato.

import { NextRequest, NextResponse } from "next/server";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
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
  leerReglas, leerDirectorio, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, cobraHorasExtraDeFila, leerJustificaciones,
  leerVacaciones, leerTrabajaAfuera,
} from "@/lib/asistencia/config-server";
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerMarcasDelTelefono } from "@/lib/marcacion/reporte-server";
import { senalarQuitadas } from "@/lib/marcacion/en-el-reporte";
// 🔴 LA COLUMNA «EXTRAS» DICE CUÁNTO ESTÁ APROBADO (16-sep-2026). Acá solo se
// junta la DECISIÓN ya tomada; el reparto lo hace el módulo puro en pantalla,
// sobre los MISMOS días que la columna ya suma. No cambia qué se paga.
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import { claveDia, decisionDe } from "@/lib/asistencia/aprobaciones";

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
  // 🔴 UNA SOLA PERSONA, POR CÓDIGO (10-sep-2026). Lo pide la página de la
  // persona, que muestra SUS días del período.
  //
  // 🔑 ES OTRA PREGUNTA QUE `q`, y por eso es otro parámetro. `q` busca TEXTO
  // en el código y en el nombre: con `q=1` entrarían el 1, el 11, el 13 y el
  // 21. Acá la identidad es el código EXACTO, como en todo el sistema.
  //
  // ⚠️ ADITIVO: sin este parámetro la ruta se comporta exactamente como antes.
  const soloCodigo = (sp.get("codigo") ?? "").trim();
  // 🔴 Filtro POR EMPRESA (10-sep-2026): lo aplica el servidor para que la
  // tabla, los totales y el Excel/PDF digan lo mismo. Sin ficha no hay empresa:
  // esos códigos solo salen con «Todas».
  const empresaFiltro = empresaParaPedir(sp.get("empresa"));

  try {
    // 🔑 LAS NUEVE LECTURAS VAN EN UN SOLO VIAJE (14-sep-2026). Eran TRES olas
    // en serie —las marcaciones con su propio `await`, después cuatro lecturas,
    // después otras cuatro— y ninguna de las ocho de abajo usa nada de las
    // anteriores: todas se arman con `desde`/`hasta`, que vienen de la URL. La
    // pantalla esperaba tres idas y vueltas donde alcanzaba una. NADA cambia de
    // lo que devuelve la ruta: mismas consultas, mismos datos, mismo `catch`.
    //
    // ⚠️ `leerDirectorio()` y `leerPersonas()` leen `asistencia_personas` con el
    // MISMO select —la primera devuelve esas filas en `DirectorioLeido.filas`—,
    // o sea que es la misma consulta dos veces. Se dejan las dos A PROPÓSITO:
    // ahora salen en el mismo viaje, así que la consulta de más no cuesta
    // tiempo, y quitarla obliga a tocar el stub de
    // `asistencia-reporte-hoy-y-vigencia.test.ts`, que mockea `leerDirectorio`
    // SIN `filas`. Unificarlas es una decisión aparte, no un colateral de esto.
    //
    // Paginado con verificación contra el COUNT: un mes de dos relojes con 4
    // marcas diarias pasa de 1.000 filas, y PostgREST corta ahí EN SILENCIO.
    // Un reporte de horas recortado sin avisar es peor que uno que falla.
    const [marcaciones, { reglas }, { directorio }, correcciones, personasDb, afuera, hRes, jRes, vRes, fRes, telefono, aprRes] = await Promise.all([
      leerTodoPaginado<MarcacionConId>(
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
      ),
      // Las reglas configuradas. Sin la migración corrida devuelve los valores por
      // defecto en vez de tirar: el reporte tiene que salir igual.
      leerReglas(),
      // El directorio: es el único lugar que traduce el código del reloj a un
      // nombre, y de él salen también el Excel y el PDF. Sus `filas` son LAS
      // FICHAS, de donde sale QUIÉN estaba trabajando en el rango.
      leerDirectorio(),
      // Sin la tabla corrida devuelve CERO correcciones, o sea exactamente los
      // números que este reporte daba antes de que las correcciones existieran.
      leerCorrecciones(desde, hasta),
      // Las fichas: de acá sale QUIÉN estaba trabajando en el rango. Ver abajo.
      leerPersonas(),
      // 🔴 QUIÉN TRABAJA AFUERA (14-sep-2026). Lectura APARTE y tolerante: con
      // la migración sin aplicar viene vacía y el reporte es el de siempre.
      leerTrabajaAfuera(),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      // 🔑 Por la fuente ÚNICA, no con un `select` copiado: es lo que hace que
      // el reporte y la planilla no puedan leer distinto la misma fila.
      leerJustificaciones(desde, hasta),
      // 🔴 LAS VACACIONES, por la MISMA puerta que usa la planilla. Sin esto,
      // un día de vacaciones se leería como ausencia acá y como vacación allá.
      // Sin la tabla corrida devuelve CERO filas y el reporte es el de siempre.
      leerVacaciones(desde, hasta),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
      // 🔴 LAS MARCAS DEL RELOJ DEL TELÉFONO (14-sep-2026), para que la
      // contadora vea la selfie, el mapa y si se marcó sin señal. Lectura
      // APARTE y tolerante a propósito: las columnas nuevas NO se le agregan al
      // `select` de arriba, porque con la migración sin aplicar eso tiraría el
      // reporte entero de todo el mundo. Sin ella, esto viene vacío y la
      // pantalla es la de siempre. NADA de lo que calcula el motor depende de
      // esta lectura: para el cálculo, una marca del teléfono ya era una marca
      // más (la primera del día es la entrada y la última la salida).
      leerMarcasDelTelefono(iDesde, iHasta),
      // 🔴 LAS DECISIONES SOBRE LAS HORAS EXTRA (16-sep-2026). La MISMA
      // lectura que usa Aprobaciones y la planilla: la columna «Extras» del
      // Reporte no puede decir que se paga algo que la planilla no paga.
      leerAprobaciones(desde, hasta),
    ]);
    const nombres = new Map<string, string>(
      directorio.codigos().map((c) => [c, directorio.etiqueta(c)]),
    );
    if (hRes.error) throw new Error(hRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);

    // 🔴 LAS CORRECCIONES SE APLICAN ANTES DE CALCULAR NADA. Lo que se le pasa
    // al motor es la lista EFECTIVA: la del reloj con las horas corregidas
    // encima, más las marcaciones que el reloj nunca registró. La tabla
    // `asistencia_marcaciones` queda intacta — acá solo se toca una COPIA.
    const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);

    // 🔴 LA MARCA QUE ALGUIEN DESHIZO SE VE TACHADA, NO SE ESCONDE (14-sep-2026).
    // El motor ya dejó de contarla dos líneas arriba; acá se señala en la línea
    // del teléfono, atándola por `id` y nunca por hora. Sin correcciones que
    // quiten nada, esto devuelve el MISMO objeto y no cuesta nada.
    const telefonoConQuitadas = senalarQuitadas(
      telefono,
      new Set(
        correcciones.correcciones
          .filter((c) => c.quita && c.marcacionId)
          .map((c) => String(c.marcacionId)),
      ),
    );

    // 🔑 El filtro va DESPUÉS de aplicar: una marcación AGREGADA no trae nombre
    // del reloj, así que filtrarla antes la dejaría fuera de la búsqueda por
    // nombre justo en el día que alguien acaba de corregir.
    // 🩸 La búsqueda mira el nombre del DIRECTORIO además del código. Buscando
    // solo en la marcación, escribir "BRICEIDA" no encontraba nada: el reloj
    // manda `empleado_nombre` vacío en las 3.287 filas cargadas.
    const porCodigo = soloCodigo
      ? efectivas.marcaciones.filter(
          (m) => (m.empleado_codigo ?? "").trim() === soloCodigo,
        )
      : efectivas.marcaciones;

    const visibles = q
      ? porCodigo.filter((m) => {
          const cod = (m.empleado_codigo ?? "").trim();
          return (
            cod.toLowerCase().includes(q) ||
            (m.empleado_nombre ?? "").toLowerCase().includes(q) ||
            (nombres.get(cod) ?? "").toLowerCase().includes(q)
          );
        })
      : porCodigo;

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
      // 🔴 A quien trabaja afuera, el día hábil sin marca deja de ser ausencia
      // (14-sep-2026): la MISMA lectura y la MISMA regla que usa la planilla,
      // para que las dos pantallas no digan cosas distintas del mismo día.
      trabajaAfuera: afuera,
      // 🔴 El día anterior al ingreso —o posterior a la salida— no es ausencia
      // (15-sep-2026). El MISMO mapa que ya se lee arriba para
      // `codigosFueraDeRango`, y la MISMA regla que usa la planilla: la
      // pantalla de Asistencia no puede marcarle una falta a alguien que ese
      // día todavía no trabajaba acá.
      vigencias,
    });

    // 🔴 QUIEN NO COBRA HORAS EXTRA NO LAS CUENTA EN EL REPORTE. Hasta el
    // 14-sep-2026 acá se miraba `servicioProfesionalDeFila` (3-sep-2026,
    // Daniel sobre Yulissa: *«es solo para ver sus tardanzas y ausencias»*).
    // Hoy se mira la CASILLA de la ficha —`cobra_horas_extra`—, que es la
    // misma que lee la planilla: Daniel, textual, *«los servicios profesionales
    // de fashion wear sí llevan horas extras»*, *«solo yulissa no cobra, todos
    // los demás sí»*. Yulissa (26) la tiene en NO y sigue con «—»; un servicio
    // profesional con la casilla en SÍ ve su número como todos. La bandera de
    // servicio profesional sigue viajando, informativa. El motor no se toca:
    // tardanzas y ausencias salen igual que las de todos.
    const sinHorasExtra = new Set(
      personasDb.filas.filter((f) => !cobraHorasExtraDeFila(f)).map((f) => String(f.empleado_codigo)),
    );
    const servicioProfesional = new Set(
      personasDb.filas.filter(servicioProfesionalDeFila).map((f) => String(f.empleado_codigo)),
    );
    const empresaDe = new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
    const personasConBandera = personas
      .map((p) => ({ ...p, empresa: empresaDe.get(p.codigo) ?? null }))
      .map((p) => (servicioProfesional.has(p.codigo) ? { ...p, servicioProfesional: true } : p))
      .map((p) => (sinHorasExtra.has(p.codigo) ? { ...p, cobraHorasExtra: false } : p))
      .filter((p) => !empresaFiltro || p.empresa === empresaFiltro);

    // 🔴 QUIÉNES no tienen su hora de salida confirmada, con nombre y código.
    const conHorario = new Set((hRes.data ?? []).map((h) => String(h.empleado_codigo)));
    const sinHorarioLista = personasConBandera
      .filter((p) => !conHorario.has(p.codigo))
      .map((p) => ({ codigo: p.codigo, nombre: p.nombre ?? null }));

    // 🔴 `codigo|fecha → 'si' | 'no'`. Lo PENDIENTE no viaja: no tener fila ES
    // pendiente (ver `estaAprobado`), así que mandarlo sería decir dos veces lo
    // mismo y abrir la puerta a que las dos se separen.
    const decisionesExtra: Record<string, "si" | "no"> = {};
    for (const a of aprRes.filas) {
      const d = decisionDe(a);
      if (d) decisionesExtra[claveDia(a.codigo, a.fecha)] = d;
    }

    return NextResponse.json({
      personas: personasConBandera,
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
      sinHorario: sinHorarioLista.length,
      // 🔴 Y QUIÉNES SON, CON SU CÓDIGO (16-sep-2026). Daniel: *«debería de
      // haber un link directo para ir al problema»*. El aviso decía el número y
      // nada más, así que había que ir a buscar a mano quién era.
      // ⚠️ Son los del PERÍODO QUE SE MIRA, no todos los del sistema: es lo que
      // ya contaba el número y está bien así.
      sinHorarioLista,
      marcaciones: enRango.length,
      // Cuántas personas quedaron fuera por no estar trabajando en este rango
      // (se fueron antes o entraron después). La pantalla lo dice en una línea.
      fueraDelRango,
      // El día que sigue corriendo, si cae dentro del rango. `null` cuando el
      // rango termina antes de hoy: ahí no hay nada en curso que aclarar.
      diaEnCurso: hoyPanama() >= desde && hoyPanama() <= hasta ? hoyPanama() : null,
      // Las marcas del teléfono, por `codigo|fecha`. Vacío = no hay ninguna (o
      // la migración todavía no corrió): la pantalla no dibuja nada de más.
      marcasTelefono: telefonoConQuitadas,
      // 🔴 Lo que ya se decidió sobre las horas extra del período. La pantalla
      // reparte con esto el MISMO número que ya mostraba: aprobado + rechazado
      // + pendiente es el total, por construcción.
      decisionesExtra,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/reporte]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
