// ═══════════════════════════════════════════════════════════════════════════
//   UN SOLO PUNTO DE LLAMADA A ANTHROPIC (11-sep-2026).
//
//   Había DOS lectores de facturas —Marketing y Reclamos— y cada uno armaba su
//   propio cliente, su propio `try/catch` y su propio `console.error`. Los dos
//   se comportaban igual ante un fallo: devolver 500 y dejar teclear a mano. Y
//   por eso la llave de producción pudo estar inválida un tiempo que no se
//   puede medir sin que nada sonara (ver `lib/alertas/lector-facturas.ts`).
//
//   Acá vive el ÚNICO lugar que le habla a Anthropic. Que sea uno es lo que
//   hace que el aviso no se pueda olvidar en el próximo lector que nazca.
//
//   🔴 NO CAMBIA NI UN PROMPT NI UN MODELO. Cada lector sigue mandando los
//   suyos —Marketing tiene su prompt de seis campos, Reclamos el suyo con
//   renglones— y esta función no los mira: recibe el texto ya armado. Lo único
//   que se unificó es el TRANSPORTE y el aviso.
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";

import { clasificarFalloAnthropic, type OrigenLector } from "@/lib/alertas/lector-facturas";
import { avisarLectorCaido } from "@/lib/alertas/lector-facturas-io";

/**
 * Reintentos del SDK, declarados a propósito y no heredados del default.
 *
 * 🔑 Es lo que le da sentido a la palabra «persistente» del aviso de 429: un
 * rate limit que llega hasta acá ya se reintentó dos veces con espera, así que
 * no es el pico de un segundo — es la cuenta topada. Bajarlo a 0 convertiría
 * esa alerta en ruido; subirlo alargaría la espera de quien está mirando la
 * pantalla. Si se toca, hay que volver a pensar el mensaje de `limite`.
 */
export const MAX_REINTENTOS = 2;

export interface LecturaDePdf {
  /** Qué pantalla lo pidió. Va solo al rastro: la llave es de la CUENTA, así
   *  que si se venció se venció para los dos y el aviso es uno solo. */
  origen: OrigenLector;
  /** El modelo lo decide cada lector. Acá no se elige ninguno. */
  modelo: string;
  maxTokens: number;
  /** El PDF ya en base64. */
  pdfBase64: string;
  /** El prompt ya armado por el lector. */
  prompt: string;
}

/**
 * Manda un PDF a Anthropic y devuelve el TEXTO crudo de la respuesta (el primer
 * bloque de texto, cadena vacía si no vino ninguno). Parsear ese texto es
 * trabajo de cada lector, que tiene su propia forma.
 *
 * 🔴 LANZA igual que antes, y las dos rutas lo siguen atajando para contestar
 * 500 con su mensaje de siempre: el aviso a Telegram es un COLATERAL, no cambia
 * qué ve quien está subiendo la factura.
 */
export async function leerPdfConAnthropic(p: LecturaDePdf): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  // Sin llave no hay nada que intentar, y desde afuera se ve EXACTAMENTE igual
  // que con una llave vencida: el lector no lee. Por eso avisa por la misma
  // causa y con el mismo texto — la pantalla que hay que abrir es la misma.
  if (!apiKey) {
    await avisarLectorCaido("llave", p.origen);
    throw new Error("ANTHROPIC_API_KEY no configurada");
  }

  const client = new Anthropic({ apiKey, maxRetries: MAX_REINTENTOS });

  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model: p.modelo,
      max_tokens: p.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: p.pdfBase64 },
            },
            { type: "text", text: p.prompt },
          ],
        },
      ],
    });
  } catch (err) {
    // La clasificación es ESTRECHA: solo llave, crédito y tope persistente
    // avisan. Un PDF ilegible, un timeout o un 500 de Anthropic caen en `null`
    // y siguen su camino en silencio, como siempre.
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    const body = err instanceof Anthropic.APIError ? err.error : undefined;
    const causa = clasificarFalloAnthropic(status, body ?? (err instanceof Error ? err.message : undefined));
    if (causa) await avisarLectorCaido(causa, p.origen);
    throw err;
  }

  const textBlock = msg.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}
