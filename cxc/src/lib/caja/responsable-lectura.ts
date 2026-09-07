import { supabaseServer } from "@/lib/supabase-server";
import {
  codigoNormalizado,
  nombreEnPantalla,
  type PersonaDeAsistencia,
} from "./responsable";

/**
 * Lee de Asistencia el nombre de las responsables de una lista de períodos y se
 * lo pega a cada uno como `responsable_nombre`.
 *
 * 🔴 El nombre NO se guarda en Caja: se lee por `empleado_codigo`, que es la
 * identidad de un colaborador en toda la casa. Guardarlo al lado del código es
 * exactamente lo que produjo tres «Angelas» en el papel impreso.
 *
 * Falla ABIERTA: si la columna todavía no existe (DDL 20261013120000 sin
 * aplicar) o Asistencia no contesta, los períodos vuelven sin nombre y la
 * pantalla se comporta como antes en vez de romperse.
 */
export async function pegarResponsables<T extends Record<string, unknown>>(
  periodos: T[],
): Promise<Array<T & { responsable_nombre: string | null }>> {
  const codigos = Array.from(
    new Set(
      periodos
        .map((p) => codigoNormalizado(p.responsable_empleado_codigo as string | null))
        .filter((c) => c.length > 0),
    ),
  );

  const porCodigo = new Map<string, string>();
  if (codigos.length > 0) {
    const { data } = await supabaseServer
      .from("asistencia_personas")
      .select("empleado_codigo, nombre")
      .in("empleado_codigo", codigos);
    for (const p of (data || []) as PersonaDeAsistencia[]) {
      porCodigo.set(codigoNormalizado(p.empleado_codigo), nombreEnPantalla(p.nombre));
    }
  }

  return periodos.map((p) => {
    const codigo = codigoNormalizado(p.responsable_empleado_codigo as string | null);
    return {
      ...p,
      responsable_nombre: codigo ? porCodigo.get(codigo) || null : null,
    };
  });
}
