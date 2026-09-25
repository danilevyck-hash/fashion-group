// ─────────────────────────────────────────────────────────────────────────────
// LEER LOS PUNTOS DE REFERENCIA — la única lectura.
//
// 🔴 FALLA ABIERTA. Sin la tabla (migración `20261220120000` sin correr), sin
// filas o con la lectura caída, devuelve un mapa VACÍO: la marca dice su lugar
// y ninguna distancia. Nunca se afirma una distancia por no haber podido leer.
//
// 🩸 ACÁ VIVÍA UNA DEDUCCIÓN QUE SE FUE ANTES DE NACER. La primera versión
// deducía el punto de una empresa sacando la MEDIANA de las marcas de su propia
// gente. Daniel corrigió la premisa el 25-sep-2026: *«Todos salen de la tienda,
// para eso es la app»* — las cinco personas que marcan por teléfono trabajan
// fuera, así que la mediana de sus marcas no es ningún lugar. Un punto deducido
// de gente que se mueve es peor que no tener punto: pondría un «a N km» medido
// contra el promedio de la nada. Los puntos de referencia se ESCRIBEN, o no
// existen.
//
// La regla de qué se dice con ese punto vive en el módulo PURO
// `lugar-de-marca.ts`. Acá solo se junta el dato.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { RADIO_REFERENCIA_M, type LugarReferencia } from "@/lib/asistencia/lugar-de-marca";

export type MapaDeReferencias = Map<string, LugarReferencia>;

/** Las referencias escritas, por `empresa_key`. Vacío si no se puede leer. */
export async function leerLugaresReferencia(): Promise<MapaDeReferencias> {
  try {
    const { data, error } = await supabaseServer
      .from("asistencia_lugares_referencia")
      .select("empresa_key, nombre, lat, lng, radio_m");
    if (error) return new Map();
    const mapa: MapaDeReferencias = new Map();
    for (const f of (data ?? []) as LugarReferencia[]) {
      if (typeof f.lat !== "number" || typeof f.lng !== "number") continue;
      mapa.set(String(f.empresa_key), {
        empresa_key: String(f.empresa_key),
        nombre: String(f.nombre ?? ""),
        lat: f.lat,
        lng: f.lng,
        radio_m: typeof f.radio_m === "number" ? f.radio_m : RADIO_REFERENCIA_M,
      });
    }
    return mapa;
  } catch {
    return new Map();
  }
}
