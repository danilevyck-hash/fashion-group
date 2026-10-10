// ─────────────────────────────────────────────────────────────────────────────
// UNA FICHA DADA DE BAJA NO MARCA (9-oct-2026).
//
// 🩸 Dar de baja la ficha y desactivar el usuario eran dos pasos sueltos: con
// el primero solo, la persona seguía marcando desde su teléfono. La ruta de
// marcar ahora mira la fecha de salida de la ficha, aunque el usuario siga
// activo. El día de la salida todavía se marca; desde el siguiente, no.
//
// 🔑 FALLA ABIERTA, como todo en esa ruta: si la ficha no se puede leer, la
// marca entra. Un problema de la base no deja a nadie sin marcar.
// ─────────────────────────────────────────────────────────────────────────────

import { avisoFichaDeBaja, deBajaElDia } from "@/lib/asistencia/alta-colaborador";
import { fechaLegible } from "@/lib/asistencia/vigencia";

/** El aviso si la ficha está de baja ese día (AAAA-MM-DD, Panamá); si no, `null`. */
export async function avisoSiEstaDeBaja(codigo: string, dia: string): Promise<string | null> {
  try {
    const { supabaseServer } = await import("@/lib/supabase-server");
    const { data, error } = await supabaseServer
      .from("asistencia_personas")
      .select("fecha_salida")
      .eq("empleado_codigo", codigo)
      .maybeSingle();
    if (error) return null;
    const salida = (data as { fecha_salida?: string | null } | null)?.fecha_salida ?? null;
    return deBajaElDia(salida, dia) ? avisoFichaDeBaja(fechaLegible(String(salida).slice(0, 10))) : null;
  } catch {
    return null;
  }
}
