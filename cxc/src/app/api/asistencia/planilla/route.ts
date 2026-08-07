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
  ENTRADA_DEFAULT,
  SALIDA_DEFAULT,
  type Marcacion,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import { leerReglas, leerPersonas } from "@/lib/asistencia/config-server";
import {
  avisoMigracion,
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
  type ReglasAsistencia,
} from "@/lib/asistencia/config";
import {
  armarPlanilla,
  normalizarManuales,
  quincenaDesdeClave,
  totalizar,
  type FichaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import {
  avisoMigracionPlanilla,
  guardarManuales,
  leerManuales,
} from "@/lib/asistencia/planilla-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";

function instante(dia: string, fin: boolean): string {
  return new Date(
    Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`),
  ).toISOString();
}

function hhmmAMin(hhmm: string): number {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const q = quincenaDesdeClave(sp.get("quincena") ?? "");
  if (!q) {
    return NextResponse.json(
      { error: "Quincena inválida. Se espera algo como 2026-07-2." },
      { status: 400 },
    );
  }
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
      leerManuales(q.clave),
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

    const fichas = new Map<string, FichaPlanilla>();
    for (const f of personasDb.filas) {
      fichas.set(String(f.empleado_codigo), {
        codigo: String(f.empleado_codigo),
        nombre: f.nombre ?? null,
        salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
        jornadaSemanal: f.jornada_semanal ?? null,
        empresa: f.empresa ?? null,
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

    // Cuánto dura el día de cada quien, según SU horario. Es lo que vale una
    // ausencia. 🔑 Se usa el MISMO horario con el que se le mide la tardanza y
    // la hora extra: con otra base, el mismo día valdría dos cosas distintas.
    const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
    const jornadaDiariaMin = (codigo: string) => {
      const h = horarioDe.get(codigo);
      const entrada = hhmmAMin(h?.entrada ?? ENTRADA_DEFAULT);
      const salida = hhmmAMin(h?.salida ?? SALIDA_DEFAULT);
      const almuerzo = h?.almuerzo_minutos ?? (reglas as ReglasAsistencia).almuerzoDefaultMin;
      return Math.max(0, salida - entrada - almuerzo);
    };

    const lineas = armarPlanilla({
      personas,
      fichas,
      manuales: manualesLeidos.porCodigo,
      jornadaDiariaMin,
      reglas,
      empresa,
    });

    return NextResponse.json({
      quincena: q,
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
        // Sin horario fijado se asume la salida por defecto, y con eso las
        // horas extra Y el valor de la ausencia pueden estar mal.
        sinHorario: lineas.filter((l) => !horarioDe.has(l.codigo)).length,
        salidaAsumida: SALIDA_DEFAULT,
        // Sábados trabajados: el cuadro no tiene columna y acá no se inventa
        // un recargo. Se avisa para que lo resuelva una persona.
        conSabado: lineas.filter((l) => l.horas.sabadoMin > 0).length,
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
