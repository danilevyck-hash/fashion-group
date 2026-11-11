// QUIÉN MARCÓ CADA DÍA (30-sep-2026) — para la regla 8 del día libre de la
// empresa: *«quien SÍ trabajó ese día cobra normal y no le nace ninguna
// deuda»*. Se lee con las correcciones encima, igual que el motor: una marca
// agregada a mano cuenta como trabajado y una quitada no.
//
// Devuelve `codigo|fecha` (día de Panamá).

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { aplicarCorrecciones, type MarcacionConId } from "./correcciones";
import { leerCorrecciones } from "./correcciones-server";
import { conCodigoPorReloj } from "./codigo-por-reloj";
import { leerMapaDeReloj } from "./codigo-por-reloj-server";
import { diaPanama } from "./reporte";

export async function leerQuienMarco(desde: string, hasta: string): Promise<Set<string>> {
  const [marcacionesCrudas, correcciones, mapaReloj] = await Promise.all([
    leerTodoPaginado<MarcacionConId>(
      "asistencia_marcaciones (quién marcó)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", new Date(`${desde}T00:00:00.000-05:00`).toISOString())
          .lte("ocurrio_en", new Date(`${hasta}T23:59:59.999-05:00`).toISOString())
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    ),
    leerCorrecciones(desde, hasta),
    leerMapaDeReloj(),
  ]);
  // 🔴 El mismo número en dos relojes es dos personas (11-nov-2026): se
  // resuelve igual que en el motor, antes de las correcciones.
  const marcaciones = conCodigoPorReloj(marcacionesCrudas, mapaReloj);
  const out = new Set<string>();
  for (const m of aplicarCorrecciones(marcaciones, correcciones.correcciones).marcaciones) {
    const cod = String(m.empleado_codigo ?? "").trim();
    if (cod) out.add(`${cod}|${diaPanama(m.ocurrio_en)}`);
  }
  return out;
}
