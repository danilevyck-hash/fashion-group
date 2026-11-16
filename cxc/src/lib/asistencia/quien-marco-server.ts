// QUIÉN MARCÓ CADA DÍA (30-sep-2026) — para la regla 8 del día libre de la
// empresa: *«quien SÍ trabajó ese día cobra normal y no le nace ninguna
// deuda»*. Se lee con las correcciones encima, igual que el motor: una marca
// agregada a mano cuenta como trabajado y una quitada no.
//
// Devuelve `codigo|fecha` (día de Panamá).
//
// 🔑 16-nov-2026: la lectura EFECTIVA (marcas paginadas → `conCodigoPorReloj`
// → `aplicarCorrecciones`) vive en `leerMarcasEfectivas` y la usan también
// «Mis marcaciones» y los recordatorios de Marcación. Un solo orden: la hora
// que ve la colaboradora es la misma que paga la planilla.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { aplicarCorrecciones, type MarcacionConId } from "./correcciones";
import { leerCorrecciones } from "./correcciones-server";
import { codigosQueCaenEn, conCodigoPorReloj } from "./codigo-por-reloj";
import { leerMapaDeReloj } from "./codigo-por-reloj-server";
import { diaPanama } from "./reporte";

/**
 * Las marcas de un rango de días de Panamá, con el reloj resuelto y las
 * correcciones vivas encima (las quitadas no salen, las agregadas sí).
 * Con `codigo`, SOLO las de esa persona.
 */
export async function leerMarcasEfectivas(
  desde: string,
  hasta: string,
  codigo?: string,
): Promise<MarcacionConId[]> {
  const mapaReloj = await leerMapaDeReloj();
  const codigos = codigo ? codigosQueCaenEn(codigo, mapaReloj) : null;
  const [marcacionesCrudas, correcciones] = await Promise.all([
    leerTodoPaginado<MarcacionConId>(
      "asistencia_marcaciones (quién marcó)",
      (pedirCount, from, to) => {
        const q = supabaseServer
          .from("asistencia_marcaciones")
          .select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", new Date(`${desde}T00:00:00.000-05:00`).toISOString())
          .lte("ocurrio_en", new Date(`${hasta}T23:59:59.999-05:00`).toISOString());
        return (codigos ? q.in("empleado_codigo", codigos) : q)
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
      },
    ),
    leerCorrecciones(desde, hasta),
  ]);
  // 🔴 El mismo número en dos relojes es dos personas (11-nov-2026): se
  // resuelve igual que en el motor, antes de las correcciones.
  const marcaciones = conCodigoPorReloj(marcacionesCrudas, mapaReloj);
  const propias = codigo
    ? correcciones.correcciones.filter((c) => String(c.empleadoCodigo ?? "").trim() === codigo)
    : correcciones.correcciones;
  const efectivas = aplicarCorrecciones(marcaciones, propias).marcaciones;
  return codigo ? efectivas.filter((m) => String(m.empleado_codigo ?? "").trim() === codigo) : efectivas;
}

export async function leerQuienMarco(desde: string, hasta: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const m of await leerMarcasEfectivas(desde, hasta)) {
    const cod = String(m.empleado_codigo ?? "").trim();
    if (cod) out.add(`${cod}|${diaPanama(m.ocurrio_en)}`);
  }
  return out;
}
