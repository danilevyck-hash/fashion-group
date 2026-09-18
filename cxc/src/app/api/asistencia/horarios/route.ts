// Horario por persona: días que trabaja, hora de entrada y salida (cuando
// marca en el reloj y cuando marca por el teléfono) y el almuerzo como dato.
//
// 🩸 Esta pantalla NO es un extra. El `Turno` de iVMS está mal en 12 de 31
// personas (medido): Ángela García figura "8 a 4:30" y sale 17:04. Con ese dato
// le salían 584 minutos de horas extra en 11 días. Lo que se fije acá MANDA.
//
// 🔴 DESDE EL 18-sep-2026 SE CONFIGURAN LOS DÍAS Y LOS DOS HORARIOS. Daniel:
// *«todo eso de horario que sea configurable por si hay cambios en un futuro»*.
// La regla vive en `lib/asistencia/horario-configurable.ts`; la lectura, en
// `horarios-server.ts` (la MISMA que usan el Reporte y la Planilla). Falla
// ABIERTA: sin la migración, la ruta guarda entrada y salida como siempre y
// DICE que los días y el horario de afuera todavía no se pueden guardar.
//
// GET  → todas las personas con marcaciones, con su horario guardado o el
//        SUGERIDO por sus salidas reales si todavía no tiene.
// PUT  → guarda uno.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { salidaSugerida, minutosDelDia, diaPanama } from "@/lib/asistencia/reporte";
import { ALMUERZO_FIJO_MIN, almuerzoDeEmpresa } from "@/lib/asistencia/config";
import { leerDirectorio } from "@/lib/asistencia/config-server";
import { compararPersonas } from "@/lib/asistencia/directorio";
import { leerHorarios, TABLA_HORARIOS } from "@/lib/asistencia/horarios-server";
import {
  COLUMNA_DIAS_LABORABLES,
  COLUMNA_ENTRADA_AFUERA,
  COLUMNA_SALIDA_AFUERA,
  avisoMigracionHorario,
  diasLaborablesDeEmpresa,
  esColumnaHorarioFaltante,
  limpiaHora,
  normalizarDiasLaborables,
  validarDiasLaborables,
  validarHora,
  validarHoraOpcional,
} from "@/lib/asistencia/horario-configurable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FilaMarca { empleado_codigo: string | null; empleado_nombre: string | null; ocurrio_en: string }

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    // Universo = quien tenga marcaciones. Se leen las de los últimos 90 días:
    // alcanza para sugerir un horario y evita traer la tabla entera.
    const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const marcas = await leerTodoPaginado<FilaMarca>(
      "asistencia_marcaciones (horarios)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select("empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", hace90)
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    // El traductor código → nombre. Es el MISMO que usan Justificaciones, el
    // Reporte y los exports: acá no se vuelve a consultar `asistencia_personas`.
    // 🔴 Y los horarios por la fuente ÚNICA, la misma del Reporte y la Planilla.
    const [horariosLeidos, { directorio, filas }] = await Promise.all([
      leerHorarios(),
      leerDirectorio(),
    ]);
    const porCodigo = new Map(horariosLeidos.horarios.map((h) => [h.empleado_codigo, h]));
    const empresaDe = new Map(filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));

    // Última marca de cada día por persona → mediana → salida sugerida.
    const ultimaPorDia = new Map<string, number>();
    for (const m of marcas) {
      const cod = (m.empleado_codigo ?? "").trim();
      if (!cod) continue;
      const k = `${cod}|${diaPanama(m.ocurrio_en)}`;
      const v = minutosDelDia(m.ocurrio_en);
      ultimaPorDia.set(k, Math.max(ultimaPorDia.get(k) ?? 0, v));
    }
    const salidas = new Map<string, number[]>();
    for (const [k, v] of ultimaPorDia) {
      const cod = k.split("|")[0];
      const l = salidas.get(cod);
      if (l) l.push(v); else salidas.set(cod, [v]);
    }

    // Universo = quien marcó ∪ quien tiene ficha. La unión importa: el código 47
    // tiene ficha y cero marcaciones, y sin él no se le puede fijar el horario.
    const codigos = new Set<string>([...salidas.keys(), ...directorio.codigos()]);

    const personas = [...codigos].map((cod) => {
      const g = porCodigo.get(cod);
      const sug = salidaSugerida(salidas.get(cod) ?? []);
      const p = directorio.persona(cod);
      const empresa = empresaDe.get(cod) ?? null;
      return {
        codigo: cod,
        // 🩸 El nombre sale del DIRECTORIO, no del reloj. `empleado_nombre` de
        // las marcaciones viene vacío en las 3.287 filas cargadas: confiar en él
        // era lo que hacía que esta tabla mostrara números pelados.
        nombre: p.nombre,
        etiqueta: p.etiqueta,
        // `false` = nadie le puso nombre todavía. Se muestra el código y se
        // marca como pendiente, nunca en blanco.
        configurado: p.configurado,
        entrada: g ? g.entrada : "08:00",
        salida: g ? g.salida : sug,
        // Se sigue devolviendo lo GUARDADO (la columna no se toca), pero ya no
        // se puede cambiar: la pantalla lo muestra como dato, no como opción.
        almuerzoMinutos: g?.almuerzo_minutos ?? ALMUERZO_FIJO_MIN,
        // 🔴 Los días que trabaja (18-sep-2026): los suyos, si no los de su
        // empresa. `diasPropios` dice si están escritos en su fila o si son
        // el punto de partida de la empresa. Sin la migración, lunes a
        // viernes y nada se puede cambiar.
        diasLaborables: [...(g?.dias_laborables ?? diasLaborablesDeEmpresa(empresa))],
        diasPropios: !!g?.dias_laborables,
        // 🔴 El horario de cuando marca por el TELÉFONO. Vacío = el mismo de
        // arriba.
        entradaAfuera: g?.entrada_afuera ?? null,
        salidaAfuera: g?.salida_afuera ?? null,
        // `false` = todavía es la sugerencia, nadie la confirmó. La pantalla lo
        // marca para que Daniel sepa qué le falta revisar.
        guardado: !!g,
        sugerida: sug,
        diasMedidos: (salidas.get(cod) ?? []).length,
      };
    });
    // Por NOMBRE, no por código como texto: ordenando texto el 5 cae después
    // del 49. El comparador es el mismo en todas las pantallas del módulo.
    personas.sort(compararPersonas);

    return NextResponse.json({
      personas,
      sinConfirmar: personas.filter((p) => !p.guardado).length,
      // 🔴 Se DICE cuando los días y el horario de afuera todavía no se pueden
      // guardar. La pantalla esconde esos controles mientras tanto.
      faltaMigracion: horariosLeidos.faltaMigracion ? avisoMigracionHorario() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/horarios GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface CuerpoPut {
  codigo?: string;
  nombre?: string | null;
  entrada?: string;
  salida?: string;
  diasLaborables?: unknown;
  entradaAfuera?: unknown;
  salidaAfuera?: unknown;
}

/** Lo guardado hoy para esa persona, con las columnas nuevas si existen. */
async function leerPrevia(codigo: string): Promise<{
  entrada: string | null;
  dias: number[] | null;
  entradaAfuera: string | null;
  salidaAfuera: string | null;
  faltaMigracion: boolean;
}> {
  const conNuevas = await supabaseServer
    .from(TABLA_HORARIOS)
    .select(`entrada, ${COLUMNA_DIAS_LABORABLES}, ${COLUMNA_ENTRADA_AFUERA}, ${COLUMNA_SALIDA_AFUERA}`)
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (!conNuevas.error) {
    const f = (conNuevas.data ?? null) as Record<string, unknown> | null;
    return {
      entrada: f?.entrada ? String(f.entrada).slice(0, 5) : null,
      dias: normalizarDiasLaborables(f?.[COLUMNA_DIAS_LABORABLES]),
      entradaAfuera: limpiaHora(f?.[COLUMNA_ENTRADA_AFUERA]),
      salidaAfuera: limpiaHora(f?.[COLUMNA_SALIDA_AFUERA]),
      faltaMigracion: false,
    };
  }
  if (!esColumnaHorarioFaltante(conNuevas.error)) throw new Error(conNuevas.error.message);
  const base = await supabaseServer
    .from(TABLA_HORARIOS)
    .select("entrada")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (base.error) throw new Error(base.error.message);
  const f = (base.data ?? null) as { entrada?: unknown } | null;
  return {
    entrada: f?.entrada ? String(f.entrada).slice(0, 5) : null,
    dias: null, entradaAfuera: null, salidaAfuera: null,
    faltaMigracion: true,
  };
}

export async function PUT(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  // ⚠️ `almuerzoMinutos` NO SE ACEPTA. El almuerzo es fijo por empresa (ver
  // abajo) y no se lee del cuerpo.
  let body: CuerpoPut;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const codigo = (body.codigo ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "Falta el colaborador" }, { status: 400 });
  const salidaV = validarHora(body.salida, "salida");
  if (!salidaV.ok) return NextResponse.json({ error: salidaV.error }, { status: 400 });
  // 🔴 La entrada AHORA SE PUEDE FIJAR (18-sep-2026). Si el cuerpo no la trae
  // —los pedidos viejos no la traían— se conserva la guardada, y sin fila las
  // 8:00 de siempre: exactamente lo que hacía la ruta hasta hoy.
  const entradaV = body.entrada === undefined || body.entrada === null || String(body.entrada).trim() === ""
    ? null
    : validarHora(body.entrada, "entrada");
  if (entradaV && !entradaV.ok) return NextResponse.json({ error: entradaV.error }, { status: 400 });
  const diasV = validarDiasLaborables(body.diasLaborables);
  if (!diasV.ok) return NextResponse.json({ error: diasV.error }, { status: 400 });
  const entradaAfueraV = validarHoraOpcional(body.entradaAfuera, "entrada por el teléfono");
  if (!entradaAfueraV.ok) return NextResponse.json({ error: entradaAfueraV.error }, { status: 400 });
  const salidaAfueraV = validarHoraOpcional(body.salidaAfuera, "salida por el teléfono");
  if (!salidaAfueraV.ok) return NextResponse.json({ error: salidaAfueraV.error }, { status: 400 });

  // 🔴 EL ALMUERZO LO DECIDE LA EMPRESA DE LA FICHA (10-sep-2026): 30 en las
  // tres de siempre, 60 en Multifashion. Sin ficha, los 30 de siempre. Sigue
  // sin leerse del cuerpo.
  const { data: ficha } = await supabaseServer
    .from("asistencia_personas")
    .select("empresa")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  const almuerzo = almuerzoDeEmpresa((ficha as { empresa?: string | null } | null)?.empresa);

  let previa: Awaited<ReturnType<typeof leerPrevia>>;
  try { previa = await leerPrevia(codigo); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const entrada = entradaV?.ok ? entradaV.valor : (previa.entrada ?? "08:00");

  const base = {
    empleado_codigo: codigo,
    empleado_nombre: body.nombre ?? null,
    entrada,
    salida: salidaV.valor,
    // 🔴 EL ALMUERZO NO SE LEE DEL CUERPO. Es lo que hace que "ya no se puede
    // elegir" sea verdad: esconder los botones de la pantalla es cosmético
    // —cualquiera manda un PUT con 60— y el almuerzo entra en la jornada con
    // la que se valúa una ausencia, o sea en plata. Lo decide la empresa.
    almuerzo_minutos: almuerzo,
    updated_at: new Date().toISOString(),
  };
  // 🔴 Lo nuevo entra solo con la migración corrida. Lo que el cuerpo NO
  // trae se conserva: guardar la salida no borra los días ni el horario de
  // afuera de nadie.
  const pidioNuevo =
    body.diasLaborables !== undefined || body.entradaAfuera !== undefined || body.salidaAfuera !== undefined;
  const fila = previa.faltaMigracion
    ? base
    : {
        ...base,
        [COLUMNA_DIAS_LABORABLES]: body.diasLaborables !== undefined ? diasV.valor : previa.dias,
        [COLUMNA_ENTRADA_AFUERA]: body.entradaAfuera !== undefined ? entradaAfueraV.valor : previa.entradaAfuera,
        [COLUMNA_SALIDA_AFUERA]: body.salidaAfuera !== undefined ? salidaAfueraV.valor : previa.salidaAfuera,
      };

  const { error } = await supabaseServer.from(TABLA_HORARIOS).upsert(fila, { onConflict: "empleado_codigo" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Se guardó la salida (y la entrada), pero lo nuevo no tiene dónde caer: se
  // DICE, no se calla. La pantalla no manda estos campos mientras el GET avise,
  // así que llegar acá es raro; igual se contesta con la verdad.
  if (previa.faltaMigracion && pidioNuevo) {
    return NextResponse.json({ ok: true, faltaMigracion: avisoMigracionHorario() });
  }
  return NextResponse.json({ ok: true });
}
