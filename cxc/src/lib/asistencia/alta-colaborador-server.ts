// Lo del alta de un colaborador que necesita la base. Ver `alta-colaborador.ts`.
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_PERSONAS } from "@/lib/asistencia/config-server";
import { TABLA_HORARIOS } from "@/lib/asistencia/horarios-server";
import {
  horarioDeAlta, masUsado, siguienteDeLaSerie, type ValoresPorOmision,
} from "@/lib/asistencia/alta-colaborador";

interface FilaFicha { empleado_codigo: string; empresa: string | null; jornada_semanal?: number | null; fecha_salida?: string | null }

async function leerFichas(): Promise<FilaFicha[]> {
  const { data } = await supabaseServer.from(TABLA_PERSONAS).select("empleado_codigo, empresa, jornada_semanal, fecha_salida");
  return (data ?? []) as FilaFicha[];
}

/**
 * El siguiente código libre de la serie de esa empresa: desde su mayor código
 * numérico más uno, sube hasta el primero que no tenga ficha (de NINGUNA
 * empresa) ni una sola marcación. Los códigos del reloj físico se comparten:
 * por eso se comprueba contra todo el sistema. `null` si la empresa no tiene
 * códigos numéricos (no se inventa una serie).
 */
export async function siguienteCodigoLibre(empresa: string | null | undefined): Promise<string | null> {
  if (!empresa) return null;
  const filas = await leerFichas();
  const primero = siguienteDeLaSerie(filas.filter((f) => f.empresa === empresa).map((f) => String(f.empleado_codigo)));
  if (!primero) return null;
  const conFicha = new Set(filas.map((f) => String(f.empleado_codigo)));
  for (let n = Number(primero); n < Number(primero) + 50; n++) {
    const candidato = String(n);
    if (conFicha.has(candidato)) continue;
    const { data: marcas } = await supabaseServer
      .from("asistencia_marcaciones").select("id").eq("empleado_codigo", candidato).limit(1);
    if (!marcas || marcas.length === 0) return candidato;
  }
  return null;
}

/**
 * Con qué nace el formulario: el horario, los días y la jornada MÁS USADOS
 * entre los colaboradores activos de esa empresa. Sin datos, el de siempre.
 */
export async function valoresPorOmision(empresa: string | null | undefined): Promise<ValoresPorOmision> {
  const base = horarioDeAlta(empresa);
  const porOmision: ValoresPorOmision = {
    entrada: base.entrada, salida: base.salida, diasLaborables: base.diasLaborables,
    almuerzoMinutos: base.almuerzoMinutos, jornadaSemanal: 40,
  };
  if (!empresa) return porOmision;
  const activos = (await leerFichas()).filter((f) => f.empresa === empresa && !f.fecha_salida);
  const codigos = new Set(activos.map((f) => String(f.empleado_codigo)));
  const { data } = await supabaseServer.from(TABLA_HORARIOS).select("empleado_codigo, entrada, salida, dias_laborables");
  const horarios = ((data ?? []) as { empleado_codigo: string; entrada: string | null; salida: string | null; dias_laborables: number[] | null }[])
    .filter((h) => codigos.has(String(h.empleado_codigo)) && h.entrada && h.salida);
  const turno = masUsado(horarios.map((h) => `${String(h.entrada).slice(0, 5)}|${String(h.salida).slice(0, 5)}`));
  const dias = masUsado(horarios.filter((h) => Array.isArray(h.dias_laborables)).map((h) => JSON.stringify(h.dias_laborables)));
  const jornada = masUsado(activos.filter((f) => f.jornada_semanal).map((f) => String(f.jornada_semanal)));
  return {
    ...porOmision,
    ...(turno ? { entrada: turno.split("|")[0], salida: turno.split("|")[1] } : {}),
    ...(dias ? { diasLaborables: JSON.parse(dias) as number[] } : {}),
    ...(jornada ? { jornadaSemanal: Number(jornada) } : {}),
  };
}
