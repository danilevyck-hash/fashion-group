// GET  /api/asistencia/planilla?quincena=2026-07-2&empresa=confecciones_boston
// POST /api/asistencia/planilla   { quincena, codigo, isr, prestamo, ... }
//
// El cuadro quincenal. Toda la regla vive en `lib/asistencia/planilla.ts`
// (puro) y los minutos salen del MISMO motor que el Reporte
// (`lib/asistencia/reporte.ts`), así que la pantalla de Asistencia y la de
// Planilla no pueden contradecirse en cuántos minutos llegó tarde alguien.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  armarReporte,
  SALIDA_DEFAULT,
  type Marcacion,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import {
  leerReglas,
  leerPersonas,
  vigenciasDeFilas,
  servicioProfesionalDeFila,
} from "@/lib/asistencia/config-server";
import { avisoMigracionServicioProfesional } from "@/lib/asistencia/participacion";
import {
  avisoMigracionBajas,
  codigosFueraDeRango,
  marcoDespuesDeLaBaja,
  ultimoDiaConMarcas,
} from "@/lib/asistencia/vigencia";
import {
  avisoMigracion,
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
} from "@/lib/asistencia/config";
import {
  armarPlanilla,
  jornadaDiariaMin,
  JORNADA_DIARIA_DEFAULT_MIN,
  normalizarManuales,
  periodoDeQuincena,
  periodoDesdeRango,
  quincenaDesdeClave,
  totalizar,
  type FichaPlanilla,
  type ManualesLinea,
  type Periodo,
} from "@/lib/asistencia/planilla";
import {
  avisoMigracionPlanilla,
  guardarManuales,
  leerManuales,
} from "@/lib/asistencia/planilla-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";
/** Tope del rango libre. Un año cubre cualquier pregunta real del negocio. */
const DIAS_MAX = 366;

function instante(dia: string, fin: boolean): string {
  return new Date(
    Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`),
  ).toISOString();
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;

  // ── QUÉ PERÍODO SE PIDIÓ ────────────────────────────────────────────────────
  //
  // Dos caminos, y el viejo NO se toca: `?quincena=2026-07-2` sigue funcionando
  // igual que siempre (lo usan los enlaces guardados y cualquier cosa que ya
  // apunte acá). El nuevo es `?desde=…&hasta=…`.
  //
  // 🔑 Y si el rango COINCIDE con una quincena, `periodoDesdeRango` devuelve el
  // período de esa quincena: misma clave de montos manuales y factor 1. Los dos
  // caminos dan el MISMO cuadro hasta el centavo, y hay un test que lo exige.
  const desdeRaw = (sp.get("desde") ?? "").trim();
  const hastaRaw = (sp.get("hasta") ?? "").trim();
  let periodo: Periodo | null = null;

  if (desdeRaw || hastaRaw) {
    periodo = periodoDesdeRango(desdeRaw, hastaRaw);
    if (!periodo) {
      return NextResponse.json(
        { error: "Fechas inválidas. Se esperan dos fechas como 2026-07-25, y la de inicio no puede ser posterior a la del final." },
        { status: 400 },
      );
    }
    // ⚠️ Tope de un año. No es capricho: cada consulta pagina TODAS las
    // marcaciones del rango, y un rango de diez años sería una forma de tumbar
    // la base desde la barra de direcciones.
    if (periodo.diasCalendario > DIAS_MAX) {
      return NextResponse.json(
        { error: `El rango es muy largo: ${periodo.diasCalendario} días. El máximo es ${DIAS_MAX}.` },
        { status: 400 },
      );
    }
  } else {
    const quincena = quincenaDesdeClave(sp.get("quincena") ?? "");
    if (!quincena) {
      return NextResponse.json(
        { error: "Quincena inválida. Se espera algo como 2026-07-2." },
        { status: 400 },
      );
    }
    periodo = periodoDeQuincena(quincena);
  }
  const q = periodo;
  const empresaRaw = (sp.get("empresa") ?? "").trim();
  const empresa =
    empresaRaw && (EMPRESAS_ASISTENCIA as readonly string[]).includes(empresaRaw)
      ? empresaRaw
      : null;

  try {
    // Paginado y verificado contra el COUNT: PostgREST corta en 1.000 filas EN
    // SILENCIO y una quincena de 37 personas con 4 marcas diarias pasa de ahí.
    // Una planilla con las marcaciones recortadas sin avisar se paga igual.
    const marcaciones = await leerTodoPaginado<Marcacion>(
      "asistencia_marcaciones (planilla)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select(
            "empleado_codigo, empleado_nombre, ocurrio_en",
            pedirCount ? { count: "exact" } : {},
          )
          .gte("ocurrio_en", instante(q.desde, false))
          .lte("ocurrio_en", instante(q.hasta, true))
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    const [{ reglas }, personasDb, manualesLeidos, hRes, jRes, fRes] = await Promise.all([
      leerReglas(),
      leerPersonas(),
      // ⚠️ En un rango libre NO hay montos manuales: se guardan por quincena y
      // repartir un ISR por días sería inventar plata. Se avisa en la respuesta.
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      supabaseServer
        .from("asistencia_horarios")
        .select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      supabaseServer
        .from("asistencia_justificaciones")
        .select("empleado_codigo, desde, hasta, motivo")
        .lte("desde", q.hasta)
        .gte("hasta", q.desde),
      supabaseServer
        .from("asistencia_feriados")
        .select("fecha, nombre")
        .gte("fecha", q.desde)
        .lte("fecha", q.hasta),
    ]);
    if (hRes.error) throw new Error(hRes.error.message);
    if (jRes.error) throw new Error(jRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);

    const horarios = (hRes.data ?? []).map((h) => ({
      ...h,
      // Postgres devuelve `time` como "08:00:00"; el motor compara "HH:MM".
      entrada: String(h.entrada).slice(0, 5),
      salida: String(h.salida).slice(0, 5),
    })) as HorarioPersona[];

    // ── QUIÉN ENTRA A ESTA QUINCENA ──────────────────────────────────────────
    //
    // 🩸 EL FILTRO DE LAS BAJAS VA ACÁ, EN LA CAPA QUE ARMA LA LISTA, Y NO EN EL
    // MOTOR. `planilla.ts` convierte minutos en dólares; quién es parte de la
    // planilla es una pregunta de calendario que el motor no necesita para
    // multiplicar nada. Además así queda UN solo punto donde se decide, en vez
    // de una regla de fechas metida entre los recargos.
    //
    // 🔑 Y ES LO QUE HACE QUE UNA QUINCENA VIEJA NO CAMBIE NUNCA: la baja se
    // compara contra las fechas DE ESA QUINCENA, no contra hoy. Dar de baja a
    // alguien esta tarde no puede mover un centavo de la planilla de julio.
    const vigencias = vigenciasDeFilas(personasDb.filas);
    const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);

    const fichas = new Map<string, FichaPlanilla>();
    for (const f of personasDb.filas) {
      const codigo = String(f.empleado_codigo);
      if (fuera.has(codigo)) continue;
      fichas.set(codigo, {
        codigo,
        nombre: f.nombre ?? null,
        salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
        jornadaSemanal: f.jornada_semanal ?? null,
        empresa: f.empresa ?? null,
        // 🔴 Sin esto la bandera no llegaría al motor y a un servicio profesional
        // con salario cargado se le calcularía la quincena entera.
        servicioProfesional: servicioProfesionalDeFila(f),
      });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

    // 🩸 `incluirNoHabiles` es lo que hace visible el domingo trabajado. Sin
    // esto, las horas del domingo 26-jul (5 personas, medido) no existirían
    // para el cálculo y nadie las echaría de menos.
    const personas = armarReporte({
      marcaciones,
      horarios,
      justificaciones: (jRes.data ?? []) as Justificacion[],
      feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
      desde: q.desde,
      hasta: q.hasta,
      reglas,
      nombres,
      incluirNoHabiles: true,
    });

    // Cuánto dura el día de cada quien. Es lo que vale una ausencia.
    // 🔑 Con horario confirmado manda el SUYO —el mismo con el que se le mide la
    // tardanza y la hora extra—; sin horario son 8 horas, que es lo que usa la
    // contable en su Excel (ver `JORNADA_DIARIA_DEFAULT_MIN`). Antes se derivaba
    // del horario POR DEFECTO y daba 8,5 h para casi todo el mundo.
    const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
    const jornadaDeCodigo = (codigo: string) => jornadaDiariaMin(horarioDe.get(codigo));

    // 🩸 La baja tiene que sacar a la persona de las DOS listas. Si solo se
    // sacara la ficha, quien marcó después de irse volvería a entrar como "sin
    // ficha en Configuración" —con nombre en blanco y sin un dólar— que es peor
    // que dejarla: parece una persona nueva sin configurar.
    const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));

    // Marcó DESPUÉS del día en que se fue. No se esconde: o volvió —y hay que
    // reactivarla o la planilla le paga cero— o alguien más está usando su
    // huella. Se cuenta con el ÚLTIMO DÍA CON MARCAS, no con estar afuera de la
    // quincena: así también se ve el caso de quien se fue el 20 y marcó el 25
    // de su MISMA quincena, que sí entra al cuadro. El detalle con nombres vive
    // en Configuración, que es donde se arregla.
    const marcoDespuesDeIrse = personas.filter((p) =>
      marcoDespuesDeLaBaja(vigencias.get(p.codigo), ultimoDiaConMarcas(p.dias)),
    ).length;

    const lineas = armarPlanilla({
      personas: personasVigentes,
      fichas,
      manuales: manualesLeidos.porCodigo,
      jornadaDiariaMin: jornadaDeCodigo,
      reglas,
      empresa,
      // 🔴 Lo que prorratea el sueldo. 1 cuando el período es una quincena.
      factorBase: q.factorBase,
    });

    return NextResponse.json({
      // `quincena` se mantiene con el mismo nombre y forma para no romper a
      // nadie que ya lo lea; `periodo` es lo que la pantalla usa ahora.
      quincena: q.quincena ?? q,
      periodo: q,
      empresa,
      empresaEtiqueta: empresa ? etiquetaEmpresa(empresa) : null,
      lineas,
      totales: totalizar(lineas),
      reglas,
      // Los avisos que la pantalla tiene que poder pintar ANTES de que alguien
      // le descuente plata a nadie.
      avisos: {
        faltaMigracionConfiguracion: personasDb.faltaMigracion ? avisoMigracion() : null,
        faltaMigracionManual: manualesLeidos.faltaMigracion ? avisoMigracionPlanilla() : null,
        // Sin las columnas de la baja NADIE queda afuera —todos activos, como
        // hoy— pero se dice, porque si alguien ya dio de baja a una persona en
        // su cabeza va a esperar no verla en el cuadro.
        faltaMigracionBajas:
          !personasDb.faltaMigracion && personasDb.faltaColumnasBajas
            ? avisoMigracionBajas()
            : null,
        // Sin la columna nadie puede estar fuera de planilla —todos entran al
        // cuadro, como hoy— pero se dice: quien ya marcó a alguien como servicio
        // profesional en su cabeza va a esperar no verlo acá.
        faltaMigracionServicioProfesional:
          !personasDb.faltaMigracion && personasDb.faltaColumnaServicioProfesional
            ? avisoMigracionServicioProfesional()
            : null,
        // Cuántas personas se quedaron afuera de ESTA quincena por su fecha de
        // salida (o porque todavía no habían entrado). Sirve para que un cuadro
        // con menos gente que el mes pasado tenga una explicación a la vista.
        fueraPorBaja: fuera.size,
        marcoDespuesDeIrse,
        // Sin horario fijado se asume la salida por defecto, y con eso las
        // horas extra Y el valor de la ausencia pueden estar mal.
        sinHorario: lineas.filter((l) => !horarioDe.has(l.codigo)).length,
        salidaAsumida: SALIDA_DEFAULT,
        // Cuántas horas vale un día ausente sin horario confirmado. Va en la
        // respuesta para que la pantalla NO lo escriba a mano y no pueda
        // quedar diciendo 8,5 el día que el default cambie.
        horasAusenciaDefault: JORNADA_DIARIA_DEFAULT_MIN / 60,
        // Sábados trabajados: el cuadro no tiene columna y acá no se inventa
        // un recargo. Se avisa para que lo resuelva una persona.
        conSabado: lineas.filter((l) => l.horas.sabadoMin > 0).length,
        // 🔴 Lo que hay que saber ANTES de pagar por un rango libre.
        rangoLibre: !q.esQuincena,
        factorBase: q.factorBase,
        diasCalendario: q.diasCalendario,
      },
      marcaciones: marcaciones.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Guardar los montos que se escriben a mano de UNA persona. */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const q = quincenaDesdeClave(String(body?.quincena ?? ""));
    if (!q) {
      return NextResponse.json({ error: "Quincena inválida." }, { status: 400 });
    }
    const codigo = String(body?.codigo ?? "").trim();
    if (!codigo) {
      return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
    }

    // 🔑 La normalización la hace el módulo puro, no esta ruta: negativos a 0,
    // texto a número, basura a 0. Es la MISMA función que usa el cálculo, así
    // que lo que se guarda y lo que se suma no pueden separarse.
    const m: ManualesLinea = normalizarManuales(body as Partial<ManualesLinea>);
    const guardado = await guardarManuales(q.clave, codigo, m);

    return NextResponse.json(
      guardado
        ? { ok: true, manuales: m }
        : { ok: false, manuales: m, aviso: avisoMigracionPlanilla() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
