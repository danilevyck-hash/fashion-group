// ─────────────────────────────────────────────────────────────────────────────
// Ventas › Resumen: lecturas pesadas GUARDADAS unos minutos (25-nov-2026).
//
// 🔴 Ningún número cambia: es la MISMA lectura, guardada bajo una llave que
// cambia cuando el dato puede cambiar — el día de Panamá, el día UTC (hay RPC
// que miran CURRENT_DATE) y la última corrida buena de CUALQUIER sync de Switch
// (cron, «Actualizar», reconciliación). Además vence a los 5 min. Un error
// NUNCA se guarda. Lo guardado no depende de quién mira: solo de los
// parámetros, que van TODOS en la llave.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";

export const GUARDADO_SEGUNDOS = 300;

/** Cuándo terminó bien la última carga de Switch (cualquier tipo); `null` si no se pudo leer. */
async function ultimaCargaDeSwitch(): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .select("finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return null;
    return (data?.[0]?.finished_at as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** La llave: si cambia un parámetro, el día (Panamá o UTC) o entra una carga nueva, se relee. */
export function llaveGuardado(parametros: (string | number)[], hoy: string, hoyUtc: string, ultimaCarga: string): string {
  return [...parametros, hoy, hoyUtc, ultimaCarga].join("|");
}

class ErrorDeLectura extends Error {
  constructor(readonly original: unknown) {
    super("lectura");
  }
}

export async function guardadoHastaLaProximaCarga<T>(
  nombre: string,
  parametros: (string | number)[],
  leer: () => Promise<T>,
): Promise<T> {
  const ultima = await ultimaCargaDeSwitch();
  // Sin saber cuándo fue la última carga no se arriesga un dato viejo.
  if (!ultima) return leer();
  const llave = llaveGuardado(parametros, hoyPanama(), new Date().toISOString().slice(0, 10), ultima);
  try {
    return await unstable_cache(
      async (_llave: string) => {
        try {
          return await leer();
        } catch (e) {
          throw new ErrorDeLectura(e);
        }
      },
      [nombre],
      { revalidate: GUARDADO_SEGUNDOS },
    )(llave);
  } catch (e) {
    if (e instanceof ErrorDeLectura) throw e.original;
    // La caché misma falló (fuera de Next, por ejemplo): se lee directo.
    return leer();
  }
}
