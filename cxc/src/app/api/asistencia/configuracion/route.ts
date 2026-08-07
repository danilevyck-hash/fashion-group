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
  valorMinuto,
  REGLAS_DEFAULT,
  type Jornada,
} from "@/lib/asistencia/config";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import {
  leerReglas,
  leerPersonas,
  esTablaFaltante,
  avisoMigracion,
  TABLA_PERSONAS,
  DIAS_VENTANA_PERSONAS,
} from "@/lib/asistencia/config-server";
import { crearDirectorio, compararPersonas } from "@/lib/asistencia/directorio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La ventana de marcaciones es la MISMA que la del resto del módulo: una
 *  pantalla que ve 180 días y otra que ve 90 mostrarían universos distintos. */
const DIAS_VENTANA = DIAS_VENTANA_PERSONAS;

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
    // El MISMO traductor que usan Justificaciones, Horarios, el Reporte y los
    // exports. Se arma con las fichas ya leídas: no hay una segunda consulta.
    const directorio = crearDirectorio(filas);

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
        // Del directorio, no de un `??` escrito acá: la regla de respaldo vive
        // en un solo lugar. El nombre del reloj queda de último por si algún día
        // el aparato empieza a mandarlo (hoy viene vacío en las 3.287 filas).
        nombre: directorio.nombre(codigo) ?? v?.nombreReloj ?? null,
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
        //
        // 🔴 `rataPorHoraCalculo` y NO `rataPorHora`: la primera devuelve la
        // rata A CENTAVOS, que es la que multiplica de verdad en `planilla.ts`.
        // La segunda devuelve 4 decimales y la pantalla enseñaba `$3.0201` donde
        // la planilla de la contable dice `$3.02`. Ver `lib/asistencia/rata.ts`.
        rataHora: rataPorHoraCalculo(salario, jornada, reglas),
        valorMinuto: valorMinuto(salario, jornada, reglas),
      };
    });

    // ⚠️ ACÁ el orden es al revés que en el resto del módulo, y a propósito:
    // primero los que FALTAN, porque esta pantalla es la lista de pendientes.
    // Dentro de cada grupo manda el comparador compartido, que ordena por nombre
    // y —entre los que no tienen— por número de verdad (5 antes que 49).
    personas.sort((a, b) => {
      if (a.configurado !== b.configurado) return a.configurado ? 1 : -1;
      const pa = { codigo: a.codigo, nombre: a.nombre, etiqueta: a.nombre ?? a.codigo, configurado: a.nombre !== null };
      const pb = { codigo: b.codigo, nombre: b.nombre, etiqueta: b.nombre ?? b.codigo, configurado: b.nombre !== null };
      return compararPersonas(pa, pb);
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
