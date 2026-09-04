import { supabaseServer } from "@/lib/supabase-server";

/**
 * Abre un período de caja nuevo (numero = último + 1, incluidos los borrados:
 * `numero` tiene UNIQUE y un período eliminado sigue ocupando el suyo).
 *
 * Es el ÚNICO camino de creación: lo usan POST /api/caja/periodos (el botón
 * «+ Nuevo período») y el cierre («Cerrar y abrir el N»), que encadena
 * cerrar + abrir en una sola acción.
 */
export async function abrirPeriodo(fondo: number, createdBy: string | null) {
  const { data: last } = await supabaseServer
    .from("caja_periodos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (last?.numero || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .insert({ numero, fecha_apertura: today, fondo_inicial: fondo, estado: "abierto", created_by: createdBy })
    .select()
    .single();

  if (error) { console.error(error); return null; }
  return data;
}
