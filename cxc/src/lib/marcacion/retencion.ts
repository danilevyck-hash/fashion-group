// ─────────────────────────────────────────────────────────────────────────────
// LAS SELFIES SE BORRAN SOLAS A LOS 90 DÍAS (14-sep-2026).
//
// Daniel, sobre las fotos: *«se borran solas a los 90 días»*. Mismo criterio
// que la retención de los Excel del Depurador (`cleanup-depurador-archivos`) y
// que la de los cheques depositados: el ARCHIVO se va, la FILA se queda.
//
// 🔴 NO SE TOCA UNA SOLA FILA DE `asistencia_marcaciones`. La tabla es
// append-only y hay barrido estático que prohíbe `update` y `delete` sobre
// ella: la marca, su hora y su ubicación quedan para siempre —son lo que la
// planilla paga— y lo único que vence es la foto. Por eso tampoco se vacía
// `foto_path`: la pantalla de la contadora pide la foto, no la encuentra y lo
// DICE («La foto ya se retiró»), que es más honesto que un campo en blanco.
//
// 🔑 QUÉ ESTÁ VENCIDO LO DICE EL PROPIO BUCKET, no una lista en la base. El
// path es `<codigo>/<día>/<evento>.jpg`, así que la carpeta ES la fecha: se
// listan las carpetas, se borran las que pasaron los 90 días, y al desaparecer
// dejan de listarse. Sin eso, cada corrida reintentaría borrar todo lo que
// alguna vez se borró.
//
// ⚠️ SIN CRON NUEVO: esto cuelga de `asistencia-vigia`, que ya corre 3 veces
// al día todos los días y ya es el cron de este módulo. Es el patrón de
// `cheques-alert`, que hace la retención de 365 días de los cheques
// depositados dentro del cron que ya existía. Un cron más para borrar unos
// pocos archivos sería una entrada más de las 100 de Vercel y otra fila que
// vigilar en `cron_heartbeats`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { BUCKET_SELFIES } from "./selfie-servidor";
import { selfieVencida } from "./marcacion";

/** Tope por corrida. Son 4 personas y ≤2 fotos por día: no se llega ni cerca,
 *  pero un tope evita que una corrida se coma la función entera algún día. */
const MAX_POR_CORRIDA = 500;

export interface ResultadoRetencion {
  borradas: number;
  carpetas: number;
  error?: string;
}

/** `hoy` entra por parámetro (día de Panamá): acá no se mira el reloj. */
export async function borrarSelfiesVencidas(hoy: string): Promise<ResultadoRetencion> {
  let borradas = 0;
  let carpetas = 0;
  try {
    const { data: codigos, error } = await supabaseServer.storage
      .from(BUCKET_SELFIES)
      .list("", { limit: 1000 });
    // Sin el bucket (migración sin aplicar) no hay nada que borrar: se calla.
    if (error || !codigos) return { borradas: 0, carpetas: 0 };

    for (const codigo of codigos) {
      const { data: dias } = await supabaseServer.storage
        .from(BUCKET_SELFIES)
        .list(codigo.name, { limit: 1000 });
      for (const dia of dias ?? []) {
        if (!selfieVencida(dia.name, hoy)) continue;
        if (borradas >= MAX_POR_CORRIDA) return { borradas, carpetas };
        const { data: archivos } = await supabaseServer.storage
          .from(BUCKET_SELFIES)
          .list(`${codigo.name}/${dia.name}`, { limit: 1000 });
        const paths = (archivos ?? []).map((a) => `${codigo.name}/${dia.name}/${a.name}`);
        if (paths.length === 0) continue;
        const { error: errBorrar } = await supabaseServer.storage
          .from(BUCKET_SELFIES)
          .remove(paths);
        if (errBorrar) {
          console.warn("[marcacion/retencion] no se pudo borrar", dia.name, errBorrar.message);
          continue;
        }
        borradas += paths.length;
        carpetas += 1;
      }
    }
    return { borradas, carpetas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[marcacion/retencion]", msg);
    return { borradas, carpetas, error: msg };
  }
}
