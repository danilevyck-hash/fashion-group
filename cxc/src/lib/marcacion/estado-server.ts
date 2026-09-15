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
// ⚠️ Lo que NO se mira acá son las correcciones de HORA de la contadora
// (`asistencia_correcciones` que pisan o agregan): una hora que Roxana escribió
// a mano no le cambia el botón a la persona. Es deliberado — el botón refleja
// lo que ELLA marcó y lo que marcó el reloj, que es lo único que ella puede ver
// y entender. La planilla sí las aplica, como siempre.
//
// 🔴 LA ÚNICA EXCEPCIÓN, Y NACIÓ CON EL «DESHACER» (14-sep-2026): las
// correcciones que QUITAN una marca sí se miran. Una marca deshecha dejó de
// contar, así que no puede seguir apagando el botón ni saliendo en «Mis
// marcas» — si no, deshacer no haría nada visible, que es todo el punto. Es
// una sola clase de corrección (`quita`), no las de hora.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  diasDeLaQuincena,
  estadoDelBoton,
  marcasDelDia,
  notaDespuesDe,
  quincenaDeHoy,
  rotuloQuincena,
  type MarcaSimple,
} from "./marcacion";
import { queSePuedeDeshacer, type Deshacible, type MarcaGuardada } from "./deshacer";

const PANAMA = "-05:00";

/** El instante de Panamá en que empieza (o termina) un día-calendario. */
export function limiteDelDia(dia: string, fin: boolean): string {
  return new Date(
    `${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`,
  ).toISOString();
}

export interface MarcaDeLaQuincena extends MarcaSimple {
  id: string;
  dispositivo: string;
}

/**
 * Los `id` de las marcas que se deshicieron en ese rango: una corrección viva
 * con `quita`. Nunca lanza — sin la migración `20261128120000` la columna no
 * existe y la respuesta es «ninguna», que es exactamente la verdad: sin esa
 * columna no se puede deshacer nada.
 *
 * 🔴 SE LEE SOLO `quita = true`. Las correcciones de HORA no se tocan acá: una
 * marca corregida sigue siendo una marca.
 */
export async function leerMarcasQuitadas(
  codigo: string,
  desde: string,
  hasta: string,
): Promise<{ ids: Set<string>; sePuedeQuitar: boolean }> {
  try {
    const { data, error } = await supabaseServer
      .from("asistencia_correcciones")
      .select("marcacion_id")
      .eq("empleado_codigo", codigo)
      .eq("quita", true)
      .is("anulada_en", null)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .limit(500);
    if (error) {
      console.warn("[marcacion] sin marcas deshechas:", error.message);
      return { ids: new Set(), sePuedeQuitar: false };
    }
    const ids = (data ?? []).map((f) => String((f as { marcacion_id: string | null }).marcacion_id ?? ""));
    return { ids: new Set(ids.filter(Boolean)), sePuedeQuitar: true };
  } catch (e) {
    console.warn("[marcacion] sin marcas deshechas:", e instanceof Error ? e.message : e);
    return { ids: new Set(), sePuedeQuitar: false };
  }
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
): Promise<{
  quincena: { desde: string; hasta: string };
  marcas: MarcaDeLaQuincena[];
  /** Lo que se puede deshacer ahora mismo, o `null`. */
  deshacer: (Deshacible & { id: string }) | null;
}> {
  const quincena = quincenaDeHoy(hoy);
  const { data, error } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("id, ocurrio_en, dispositivo")
    .eq("empleado_codigo", codigo)
    .gte("ocurrio_en", limiteDelDia(quincena.desde, false))
    .lte("ocurrio_en", limiteDelDia(quincena.hasta, true))
    .order("ocurrio_en", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  // 🔴 SI NO SE PUEDE LEER LAS QUITADAS, NO SE OFRECE «DESHACER». Sin la
  // migración `20261128120000` la columna no existe: dibujar el botón sería
  // ofrecer algo que el servidor va a rechazar, y la persona no puede hacer
  // nada con ese mensaje. Un control que no ofrece nada no se dibuja.
  const quitadas = await leerMarcasQuitadas(codigo, quincena.desde, quincena.hasta);
  const marcas = (data ?? [])
    .map((m) => ({
      id: String((m as { id: string }).id ?? ""),
      ocurrioEn: String((m as { ocurrio_en: string }).ocurrio_en),
      dispositivo: String((m as { dispositivo: string }).dispositivo ?? ""),
    }))
    // 🔴 Una marca deshecha NO cuenta: ni para el botón, ni para «Mis marcas»,
    // ni para el tope de dos marcas al día. La fila sigue en la base.
    .filter((m) => !quitadas.ids.has(m.id));
  return {
    quincena,
    marcas,
    deshacer: quitadas.sePuedeQuitar
      ? queSePuedeDeshacer(marcas as MarcaGuardada[], new Date().toISOString())
      : null,
  };
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

/**
 * EL ESTADO QUE DIBUJA LA PANTALLA. Una sola forma para las tres puertas —el
 * GET, el POST que guarda una marca y el POST que deshace la última—, así
 * después de cualquiera de las tres la pantalla queda igual que si se hubiera
 * recargado.
 *
 * 🔑 Vive acá y no dentro de una ruta porque las rutas de Next no pueden
 * exportar otra cosa que sus métodos: dos copias de esta función es cómo se
 * llega a dos pantallas que dicen cosas distintas después de marcar.
 */
export async function armarEstadoDeLaPantalla(codigo: string, nombre: string | null) {
  const ahora = new Date().toISOString();
  const hoy = hoyPanama();
  const { quincena, marcas, deshacer } = await leerMarcasDeLaQuincena(codigo, hoy);
  const marcasHoy = marcasDelDia(marcas, hoy);
  return {
    codigo,
    nombre,
    ahora,
    // 🔴 QUÉ SE PUEDE DESHACER LO DICE EL SERVIDOR, no el teléfono: es él quien
    // sabe de qué reloj salió la última marca (la del teléfono se deshace; la
    // del reloj de la tienda, no). Viaja SIN el `id` de la marca a propósito —
    // la ruta de deshacer lo vuelve a calcular, así un teléfono no puede pedir
    // que se quite una marca cualquiera nombrándola.
    deshacer: deshacer ? { ocurrioEn: deshacer.ocurrioEn, tipo: deshacer.tipo } : null,
    hoy,
    marcasHoy,
    boton: estadoDelBoton(marcasHoy),
    nota: notaDespuesDe(marcasHoy),
    quincena,
    rotuloQuincena: rotuloQuincena(quincena),
    dias: diasDeLaQuincena(marcas, hoy),
    // 🔑 LAS MARCAS CRUDAS VIAJAN TAMBIÉN (≤32 en una quincena). No es un dato
    // de más: el teléfono le SUMA las que todavía esperan señal y vuelve a
    // pasar la lista por las MISMAS funciones puras (`marcasDelDia`,
    // `estadoDelBoton`, `diasDeLaQuincena`). Así, después de una marca sin
    // señal, el botón dice «Marcar salida» sin que el servidor se haya
    // enterado — y lo dice con la regla del servidor, no con una copia.
    marcas: marcas.map((m) => ({ ocurrioEn: m.ocurrioEn })),
  };
}
