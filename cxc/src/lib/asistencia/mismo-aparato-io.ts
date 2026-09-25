// ═══════════════════════════════════════════════════════════════════════════
//   El lado que toca la base y Telegram de «dos personas, un solo teléfono».
//   Toda la DECISIÓN vive en `mismo-aparato.ts`, que es PURO — mismo reparto
//   que el silencio de datos y que los crons que avisan.
//
//   🔴 SE REVISA AL RECIBIR UNA MARCA, NO EN UN CRON DE MEDIANOCHE. Daniel se
//   entera el mismo día, en el momento; un cron a las 11:30 p.m. le contaría
//   catorce horas después algo sobre lo que ya no puede preguntar. Y de paso
//   el sistema no gasta una de las 100 entradas de cron de Vercel.
//
//   🔴 NUNCA FRENA UNA MARCA. Todo esto corre DESPUÉS de que la fila ya entró,
//   dentro de su propio `try`, y cualquier error sale como «no avisé». Que
//   Telegram esté caído no puede impedir que alguien fiche.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseServer } from "@/lib/supabase-server";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";
import { logCronError } from "@/lib/cron-telemetry";
import { DISPOSITIVO_TELEFONO } from "@/lib/marcacion/marcacion";
import { SELLO_DEL_APARATO, selloValido } from "@/lib/marcacion/sello-del-aparato";
import {
  aparatosCompartidos,
  llaveDelAviso,
  textoDelAviso,
  type MarcaConSello,
} from "./mismo-aparato";

/** Días que callan un aviso ya dado. Es un aviso por (aparato, día). */
const DIAS_ANTI_LOOP = 2;

/**
 * ¿Ya se avisó por este aparato en este día?
 *
 * **Fail-OPEN**: si no se puede leer el registro se avisa igual. Repetir un
 * mensaje cuesta menos que perderlo — el mismo criterio de `datos-frescos.ts`.
 */
async function yaAvisado(llave: string): Promise<boolean> {
  try {
    const desde = new Date(Date.now() - DIAS_ANTI_LOOP * 86_400_000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", llave)
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** La empresa de la ficha, para que el mensaje diga de qué tienda habla. */
async function empresaDe(codigo: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from("asistencia_personas")
      .select("empresa")
      .eq("empleado_codigo", codigo)
      .maybeSingle();
    if (error || !data) return null;
    return String((data as { empresa?: string | null }).empresa ?? "") || null;
  } catch {
    return null;
  }
}

/**
 * Mira el día de ESTE aparato y, si hubo dos personas distintas, se lo dice a
 * Daniel. Devuelve `true` solo si mandó el mensaje.
 *
 * `desdeIso` / `hastaIso` acotan el día de Panamá de la marca recién entrada;
 * los calcula quien llama, que ya lo tiene.
 */
export async function revisarMismoAparato(
  aparatoId: string | null | undefined,
  desdeIso: string,
  hastaIso: string,
): Promise<boolean> {
  if (!SELLO_DEL_APARATO) return false;
  if (!selloValido(aparatoId)) return false;

  try {
    const { data, error } = await supabaseServer
      .from("asistencia_marcaciones")
      .select("empleado_codigo, empleado_nombre, ocurrio_en, aparato_id")
      .eq("dispositivo", DISPOSITIVO_TELEFONO)
      .eq("aparato_id", aparatoId)
      .gte("ocurrio_en", desdeIso)
      .lte("ocurrio_en", hastaIso)
      .limit(200);
    // Sin la columna (migración sin correr) esto falla y se calla: falla ABIERTA
    // hacia el lado de no molestar, que acá es el correcto — no hay sellos que
    // comparar.
    if (error) return false;

    const casos = aparatosCompartidos((data ?? []) as MarcaConSello[]);
    if (casos.length === 0) return false;

    let mando = false;
    for (const caso of casos) {
      const llave = llaveDelAviso(caso);
      if (await yaAvisado(llave)) continue;
      const empresa = await empresaDe(caso.personas[0]?.codigo ?? "");
      const enviado = await enviarNegocioPrivado(textoDelAviso(caso, empresa));
      // 🔴 La llave del dedup se escribe DESPUÉS de que Telegram confirme.
      // Escribirla antes quema el único aviso del día si el envío falló.
      if (!enviado) continue;
      await logCronError(llave, `mismo aparato: ${caso.personas.length} personas`, null, {
        telegram: false,
      });
      mando = true;
    }
    return mando;
  } catch {
    return false;
  }
}
