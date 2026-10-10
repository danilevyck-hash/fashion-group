// Lo del alta de un colaborador que necesita la base. Ver `alta-colaborador.ts`.
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_PERSONAS } from "@/lib/asistencia/config-server";
import { siguienteDeLaSerie } from "@/lib/asistencia/alta-colaborador";

/**
 * El siguiente código de la serie de esa empresa, SOLO si está libre en todo
 * el sistema: sin ficha (de ninguna empresa) y sin una sola marcación. Si no,
 * `null`: no se propone nada antes que adivinar.
 */
export async function siguienteCodigoLibre(empresa: string | null | undefined): Promise<string | null> {
  if (!empresa) return null;
  const { data } = await supabaseServer.from(TABLA_PERSONAS).select("empleado_codigo, empresa");
  const filas = (data ?? []) as { empleado_codigo: string; empresa: string | null }[];
  const candidato = siguienteDeLaSerie(
    filas.filter((f) => f.empresa === empresa).map((f) => String(f.empleado_codigo)),
  );
  if (!candidato || filas.some((f) => String(f.empleado_codigo) === candidato)) return null;
  const { data: marcas } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("id")
    .eq("empleado_codigo", candidato)
    .limit(1);
  return marcas && marcas.length > 0 ? null : candidato;
}
