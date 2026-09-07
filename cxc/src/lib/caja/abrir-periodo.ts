import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";

export interface AperturaDePeriodo {
  /** El período recién abierto, o `null` si no se abrió ninguno. */
  periodo: { id: string; numero: number; [k: string]: unknown } | null;
  /** Por qué no se abrió. `null` cuando sí se abrió. */
  motivo: string | null;
}

/**
 * Abre un período de caja nuevo (numero = último + 1, incluidos los borrados:
 * `numero` tiene UNIQUE y un período eliminado sigue ocupando el suyo).
 *
 * Es el ÚNICO camino de creación: lo usan POST /api/caja/periodos (el botón
 * «+ Nuevo período») y el cierre («Cerrar y abrir el N»), que encadena
 * cerrar + abrir en una sola acción.
 *
 * 🔴 NO ABRE UN PERÍODO SI YA HAY OTRO ABIERTO (7-sep-2026). El cierre
 * encadenaba la apertura sin mirar nada: con dos abiertos habría creado un
 * tercero. La caja es UNA sola y su ciclo también. La pantalla ya escondía el
 * botón cuando había uno abierto, pero eso es el navegador — el freno vive
 * aquí, que es por donde pasan los dos caminos, y DICE por qué.
 *
 * 🔴 ABRIR UN PERÍODO DEJA RASTRO. Hasta hoy el registro guardaba cierres,
 * ediciones y borrados de gasto, pero crear un período no se anotaba en ningún
 * lado.
 */
export async function abrirPeriodo(
  fondo: number,
  createdBy: string | null,
  opciones?: {
    responsableEmpleadoCodigo?: string | null;
    rol?: string | null;
    userName?: string | null;
  },
): Promise<AperturaDePeriodo> {
  // ¿Ya hay uno abierto? Un fallo de lectura NO cambia la conducta de siempre:
  // ante la duda se abre, que es lo que este mismo camino hacía hasta hoy.
  const { data: abierto, error: errorAbierto } = await supabaseServer
    .from("caja_periodos")
    .select("id, numero")
    .eq("estado", "abierto")
    .eq("deleted", false)
    .limit(1)
    .maybeSingle();
  if (!errorAbierto && abierto?.id) {
    return {
      periodo: null,
      motivo: `Ya hay un período abierto (Nº ${abierto.numero}). La caja lleva un solo ciclo a la vez: ciérralo antes de abrir otro.`,
    };
  }

  const { data: last } = await supabaseServer
    .from("caja_periodos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (last?.numero || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  const fila: Record<string, unknown> = {
    numero,
    fecha_apertura: today,
    fondo_inicial: fondo,
    estado: "abierto",
    created_by: createdBy,
  };
  const codigo = String(opciones?.responsableEmpleadoCodigo ?? "").trim();
  if (codigo) fila.responsable_empleado_codigo = codigo;

  // `responsable_empleado_codigo` llega con la DDL 20261013120000. Mientras esa
  // migración no corra la columna no existe: se abre igual, sin responsable.
  let { data, error } = await supabaseServer
    .from("caja_periodos").insert(fila).select().single();
  if (error && codigo) {
    delete fila.responsable_empleado_codigo;
    ({ data, error } = await supabaseServer
      .from("caja_periodos").insert(fila).select().single());
  }

  if (error) { console.error(error); return { periodo: null, motivo: "Error interno" }; }

  await logActivity(
    opciones?.rol || "unknown",
    "caja_periodo_open",
    "caja",
    { periodoId: data?.id, numero, fondo_inicial: fondo, responsable_empleado_codigo: codigo || null },
    opciones?.userName || undefined,
  );

  return { periodo: data as AperturaDePeriodo["periodo"], motivo: null };
}
