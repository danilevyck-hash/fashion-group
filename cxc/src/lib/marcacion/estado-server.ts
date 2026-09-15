// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LA PANTALLA DEL TELÉFONO NECESITA SABER (14-sep-2026).
//
// Una sola lectura: las marcas de ESA persona en la quincena en curso. De ahí
// salen las tres cosas que se ven — el botón (cuántas lleva hoy), la notita y
// «Mis marcas» —, y todas las decide el módulo PURO `marcacion.ts`: acá solo
// se va a buscar el dato.
//
// 🔴 SE CUENTAN LAS MARCAS DE TODOS LOS RELOJES, no solo las del teléfono.
// Daniel: *«el sistema junta todo»*. Si alguien marcó entrada en el reloj de
// la tienda y después abre el teléfono, el botón le dice «Marcar salida», no
// «Marcar entrada». Por eso la consulta NO filtra por `dispositivo`.
//
// ⚠️ Lo que NO se mira acá son las correcciones de la contadora
// (`asistencia_correcciones`): una hora que Roxana agregó a mano no le cambia
// el botón a la persona. Es deliberado — el botón refleja lo que ELLA marcó y
// lo que marcó el reloj, que es lo único que ella puede ver y entender. La
// planilla sí las aplica, como siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { quincenaDeHoy, type MarcaSimple } from "./marcacion";

const PANAMA = "-05:00";

/** El instante de Panamá en que empieza (o termina) un día-calendario. */
export function limiteDelDia(dia: string, fin: boolean): string {
  return new Date(
    `${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`,
  ).toISOString();
}

export interface MarcaDeLaQuincena extends MarcaSimple {
  dispositivo: string;
}

/**
 * Las marcas de esa persona en la quincena de `hoy`. Cero peticiones extra:
 * es la MISMA lista con la que se cuenta el día y se dibuja «Mis marcas».
 *
 * Una quincena de una persona son ≤ 32 filas: no hace falta paginar.
 */
export async function leerMarcasDeLaQuincena(
  codigo: string,
  hoy: string,
): Promise<{ quincena: { desde: string; hasta: string }; marcas: MarcaDeLaQuincena[] }> {
  const quincena = quincenaDeHoy(hoy);
  const { data, error } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("ocurrio_en, dispositivo")
    .eq("empleado_codigo", codigo)
    .gte("ocurrio_en", limiteDelDia(quincena.desde, false))
    .lte("ocurrio_en", limiteDelDia(quincena.hasta, true))
    .order("ocurrio_en", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const marcas = (data ?? []).map((m) => ({
    ocurrioEn: String((m as { ocurrio_en: string }).ocurrio_en),
    dispositivo: String((m as { dispositivo: string }).dispositivo ?? ""),
  }));
  return { quincena, marcas };
}

/** ¿Esta marca ya está guardada? Un reenvío sin señal tiene que poder saberlo
 *  sin escribir nada: el teléfono la saca de su cola y no la vuelve a mandar. */
export async function marcaYaGuardada(
  dispositivo: string,
  eventoId: string,
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("id")
    .eq("dispositivo", dispositivo)
    .eq("evento_id", eventoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** El nombre de la ficha, para guardarlo junto a la marca como hace el reloj. */
export async function nombreDeLaFicha(codigo: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("asistencia_personas")
    .select("nombre")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (error) {
    console.warn("[marcacion] no se pudo leer la ficha:", error.message);
    return null;
  }
  const n = String((data as { nombre?: string | null } | null)?.nombre ?? "").trim();
  return n === "" ? null : n;
}
