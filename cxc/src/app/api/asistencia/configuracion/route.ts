// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE ASISTENCIA — GET (todo) y PUT (una persona).
//
// GET devuelve TRES cosas juntas porque la pantalla las necesita juntas:
//   1. la lista de códigos que YA marcaron en el reloj (aunque nadie los haya
//      configurado — son los que hay que terminar de llenar),
//   2. la ficha guardada de cada uno (nombre, salario, jornada, empresa),
//   3. las reglas del cálculo.
//
// 🩸 EL UNIVERSO SON LOS CÓDIGOS DEL RELOJ, NO LAS FICHAS GUARDADAS. Si la lista
// saliera de `asistencia_personas`, arrancaría VACÍA y nadie sabría que hay 37
// personas marcando. El reloj manda códigos numéricos con el nombre en blanco:
// esta pantalla es el único lugar donde el código 6 se vuelve una persona con
// sueldo y empresa.
//
// ⚠️ Todo lo que se lee acá aguanta que la migración NO esté corrida: en vez de
// romperse, devuelve la lista del reloj sin fichas y avisa qué archivo falta.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { diaPanama } from "@/lib/asistencia/reporte";
import {
  validarPersona,
  rataPorHora,
  valorMinuto,
  REGLAS_DEFAULT,
  type Jornada,
} from "@/lib/asistencia/config";
import {
  leerReglas,
  leerPersonas,
  esTablaFaltante,
  avisoMigracion,
  TABLA_PERSONAS,
} from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ventana de marcaciones para armar el universo de códigos. Medio año cubre de
 *  sobra lo cargado (julio y agosto de 2026) sin traer la tabla entera. */
const DIAS_VENTANA = 180;

interface FilaMarca {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  dispositivo: string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const desde = new Date(Date.now() - DIAS_VENTANA * 86_400_000).toISOString();

    // Paginado con verificación contra el COUNT: PostgREST corta en 1.000 filas
    // EN SILENCIO, y con 3.287 marcaciones cargadas eso dejaría códigos afuera.
    const marcas = await leerTodoPaginado<FilaMarca>(
      "asistencia_marcaciones (configuración)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select(
            "empleado_codigo, empleado_nombre, ocurrio_en, dispositivo",
            pedirCount ? { count: "exact" } : {},
          )
          .gte("ocurrio_en", desde)
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    const [{ reglas, faltaMigracion: faltaReglas }, { filas, faltaMigracion: faltaPersonas }] =
      await Promise.all([leerReglas(), leerPersonas()]);

    // Qué se sabe de cada código POR EL RELOJ.
    interface Visto {
      marcaciones: number;
      ultima: string;
      nombreReloj: string | null;
      dispositivo: string | null;
    }
    const vistos = new Map<string, Visto>();
    for (const m of marcas) {
      const cod = (m.empleado_codigo ?? "").trim();
      if (!cod) continue;
      const v = vistos.get(cod);
      if (!v) {
        vistos.set(cod, {
          marcaciones: 1,
          ultima: m.ocurrio_en,
          // El reloj lo manda vacío en todas las filas medidas; se guarda igual
          // por si alguna vez llega, y sirve de semilla del nombre.
          nombreReloj: (m.empleado_nombre ?? "").trim() || null,
          dispositivo: m.dispositivo,
        });
      } else {
        v.marcaciones += 1;
        if (m.ocurrio_en > v.ultima) v.ultima = m.ocurrio_en;
        if (!v.nombreReloj && (m.empleado_nombre ?? "").trim()) {
          v.nombreReloj = (m.empleado_nombre ?? "").trim();
        }
        if (!v.dispositivo) v.dispositivo = m.dispositivo;
      }
    }

    const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));

    // Universo = códigos del reloj ∪ fichas guardadas. La unión importa: alguien
    // que dejó de marcar hace meses no debe desaparecer de su propia planilla.
    const codigos = new Set<string>([...vistos.keys(), ...fichas.keys()]);

    const personas = [...codigos].map((codigo) => {
      const v = vistos.get(codigo);
      const f = fichas.get(codigo);
      const salario =
        f?.salario_mensual === null || f?.salario_mensual === undefined
          ? null
          : Number(f.salario_mensual);
      const jornada = (Number(f?.jornada_semanal) === 40 ? 40 : 48) as Jornada;
      return {
        codigo,
        nombre: f?.nombre ?? v?.nombreReloj ?? null,
        salarioMensual: Number.isFinite(salario as number) ? (salario as number) : null,
        jornadaSemanal: jornada,
        empresa: f?.empresa ?? null,
        // `false` = el código marca en el reloj pero nadie dijo quién es. Es
        // exactamente lo que la pantalla tiene que destacar.
        configurado: !!f,
        // Falta el sueldo, pero la empresa ya está: se puede emitir la planilla
        // de las otras y saber a quién le falta el dato.
        faltaSalario: !!f && (salario === null || !Number.isFinite(salario as number)),
        marcaciones: v?.marcaciones ?? 0,
        ultimaMarca: v ? diaPanama(v.ultima) : null,
        dispositivo: v?.dispositivo ?? null,
        // Derivados, solo para mirar: confirman que los números configurados
        // producen una rata creíble antes de que se calcule ninguna planilla.
        rataHora: rataPorHora(salario, jornada, reglas),
        valorMinuto: valorMinuto(salario, jornada, reglas),
      };
    });

    // Primero los que faltan: es lo que hay que hacer.
    personas.sort((a, b) => {
      if (a.configurado !== b.configurado) return a.configurado ? 1 : -1;
      return (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo, "es", { numeric: true });
    });

    return NextResponse.json({
      personas,
      reglas,
      reglasDefault: REGLAS_DEFAULT,
      resumen: {
        total: personas.length,
        sinConfigurar: personas.filter((p) => !p.configurado).length,
        sinSalario: personas.filter((p) => p.faltaSalario).length,
        conMarcaciones: personas.filter((p) => p.marcaciones > 0).length,
      },
      faltaMigracion: faltaPersonas || faltaReglas,
      avisoMigracion: faltaPersonas || faltaReglas ? avisoMigracion() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/configuracion GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Guarda la ficha de UNA persona. La validación entera vive en el servidor. */
export async function PUT(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió lo que se envió." }, { status: 400 });
  }

  // 🔑 El cuerpo del PUT es la ÚNICA fuente: lo que el formulario haya dejado
  // pasar no importa. El validador recibe los valores crudos y convierte él —
  // con `Number()` afuera, un `null` llegaría como 0 y un salario 0 entraría.
  const r = validarPersona(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const p = r.valor;

  const { error } = await supabaseServer.from(TABLA_PERSONAS).upsert(
    {
      empleado_codigo: p.codigo,
      nombre: p.nombre,
      salario_mensual: p.salarioMensual,
      jornada_semanal: p.jornadaSemanal,
      empresa: p.empresa,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "empleado_codigo" },
  );

  if (error) {
    // Sin la migración corrida esto no es un error del usuario: es un paso que
    // falta. Se dice cuál, con el nombre del archivo.
    if (esTablaFaltante(error, TABLA_PERSONAS)) {
      return NextResponse.json({ error: avisoMigracion(), faltaMigracion: true }, { status: 503 });
    }
    console.error("[asistencia/configuracion PUT]", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persona: p });
}
