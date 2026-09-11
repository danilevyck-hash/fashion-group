// ═══════════════════════════════════════════════════════════════════════════
//   🩸 EL LECTOR DE FACTURAS DEJÓ DE LEER Y NADIE SE ENTERÓ.
//
//   La `ANTHROPIC_API_KEY` de producción estuvo INVÁLIDA un tiempo que no se
//   puede medir —no hay tabla que lo registre— y durante todo ese tiempo los
//   dos lectores de PDF del sistema fallaron EN SILENCIO:
//
//     · Marketing  → «+ Registrar gasto» y la pantalla del proyecto, que leen
//                    la factura del proveedor para llenar los seis campos.
//     · Reclamos   → la factura que se adjunta a un reclamo.
//
//   Las dos pantallas hacen lo correcto cuando la IA falla: dicen «no se pudo
//   leer» y dejan teclear a mano. Por eso nadie reportó nada, y por eso nadie
//   arregló la llave: el sistema se degradó a la versión de antes de la IA sin
//   decir una palabra. Daniel, textual (11-sep-2026):
//
//       «si se me acaba o algo que me llegue notificación a telegram»
//
// ── POR QUÉ ESTO NO ES UNA REGLA NUEVA DE 🔧 SISTEMA ─────────────────────────
// Es la regla 2 de siempre —«algo se rompió y no se arregló solo»— aplicada a
// un servicio de afuera en vez de a un cron. La lista de alertas de sistema no
// crece por inventar una regla: crece por UNA superficie más vigilada, y se
// anota en CLAUDE.md como «(+1) el lector de facturas dejó de leer».
//
// Cumple la regla de tres entera:
//   1. Es real — es la respuesta de Anthropic, no una deducción. Una llave
//      inválida contesta 401 y seguirá contestando 401 mañana.
//   2. No se arregla solo — ninguna de las tres causas se cura sola: la llave
//      hay que rotarla, el crédito hay que recargarlo, y el 429 que llega acá
//      ya sobrevivió los reintentos del SDK (ver `MAX_REINTENTOS` en
//      `lib/ia/anthropic.ts`).
//   3. Alguien tiene que hacer algo — y el texto dice exactamente qué pantalla
//      abrir y en qué orden.
//
// ── 🔴 LO QUE **NO** AVISA, Y ES LA MITAD DEL DISEÑO ─────────────────────────
// Un PDF ilegible, un escaneo torcido, un timeout, un 500 de Anthropic o un
// «overloaded» NO avisan. Son fallos de UN intento, se arreglan volviendo a
// subir el archivo, y la pantalla ya se lo dice a quien está ahí parado. Una
// alerta por cada PDF raro convertiría este aviso en ruido, y entonces el día
// que de verdad se acabe el crédito el mensaje ya no se va a leer.
//
// Por eso la clasificación es ESTRECHA y por causa, nunca «hubo un error».
// ═══════════════════════════════════════════════════════════════════════════

import { DIAS_ENTRE_AVISOS } from "@/lib/alertas/silencio-de-datos";

export { DIAS_ENTRE_AVISOS };

/**
 * Las TRES causas que ameritan Telegram. Cada una es una pantalla distinta de
 * console.anthropic.com, y por eso son tres y no un «falló la IA» genérico: el
 * mensaje tiene que decir qué hacer, y lo que hay que hacer cambia.
 */
export type CausaLector = "llave" | "credito" | "limite";

/** Las tres, en orden de gravedad. Exportada para que el candado las recorra. */
export const CAUSAS_LECTOR: readonly CausaLector[] = ["llave", "credito", "limite"];

/** Qué lector disparó el fallo. Solo se usa para el rastro, NO para el dedup:
 *  la llave es de la cuenta, no del módulo — si se venció, se venció para los
 *  dos, y dos mensajes diciendo lo mismo son uno de más. */
export type OrigenLector = "marketing" | "reclamos";

/** `tipo` en `cron_email_errors`: la clave del anti-loop, UNA POR CAUSA.
 *  Mismo mecanismo que el guard de montos y que el silencio de datos. */
export const TIPO_LECTOR = "lector_facturas";
export const tipoDeCausa = (causa: CausaLector): string => `${TIPO_LECTOR}:${causa}`;

/** Texto del body de Anthropic que delata que se acabó el saldo.
 *  Se mira el MENSAJE y no el status porque el cobro llega como 400
 *  `invalid_request_error`, que es el mismo status de un PDF que no se pudo
 *  procesar — y ése no tiene que avisar. */
const DICE_CREDITO = /credit balance|credit_balance|billing|insufficient[_ ]quota|out of credits|saldo/i;

function leerBody(body: unknown): { tipo: string; mensaje: string } {
  if (!body || typeof body !== "object") {
    return { tipo: "", mensaje: typeof body === "string" ? body : "" };
  }
  const raiz = body as Record<string, unknown>;
  // La forma de Anthropic es { type: "error", error: { type, message } }; el SDK
  // a veces entrega ya desanidado. Se aceptan las dos sin adivinar.
  const interno = (raiz.error && typeof raiz.error === "object" ? raiz.error : raiz) as Record<
    string,
    unknown
  >;
  return {
    tipo: typeof interno.type === "string" ? interno.type : "",
    mensaje: typeof interno.message === "string" ? interno.message : "",
  };
}

/**
 * ¿Este fallo de Anthropic amerita un 🔧 SISTEMA? `null` = no, y `null` es la
 * respuesta por defecto: solo las tres causas declaradas salen.
 *
 * Es PURO a propósito — status y body entran como datos, así que el texto del
 * mensaje y la frontera entre «avisa» y «no avisa» se revisan en un test sin
 * llave, sin red y sin Telegram, que es la única forma de mirar de verdad un
 * aviso que ojalá casi nunca salga.
 */
export function clasificarFalloAnthropic(
  status: number | undefined,
  body: unknown,
): CausaLector | null {
  const { tipo, mensaje } = leerBody(body);

  // El saldo se mira PRIMERO: llega como 400 y se reconoce por el texto, así
  // que si se mirara después de los status quedaría tapado por el «ninguno».
  if (status === 402 || DICE_CREDITO.test(mensaje) || DICE_CREDITO.test(tipo)) return "credito";

  if (status === 401 || status === 403) return "llave";
  if (tipo === "authentication_error" || tipo === "permission_error") return "llave";

  if (status === 429 || tipo === "rate_limit_error") return "limite";

  // Todo lo demás —PDF ilegible (400), timeout, 500, 529 overloaded— se arregla
  // solo o volviendo a intentar. No es noticia.
  return null;
}

/** La primera línea, la que se lee en la notificación del iPhone sin abrirla. */
const QUE_PASO: Record<CausaLector, string> = {
  llave:
    "El lector de facturas no está leyendo: la llave de Anthropic no sirve (está vencida, borrada o mal puesta).",
  credito: "El lector de facturas no está leyendo: se acabó el crédito de Anthropic.",
  limite:
    "El lector de facturas no está leyendo: la cuenta de Anthropic llegó al tope de uso y sigue rebotando.",
};

const QUE_HACER: Record<CausaLector, string> = {
  llave:
    "Qué hacer: entra a console.anthropic.com → API Keys, crea una llave nueva y ponla en Vercel " +
    "(Settings → Environment Variables → ANTHROPIC_API_KEY, Production). Después sube un PDF de prueba para comprobar.",
  credito:
    "Qué hacer: entra a console.anthropic.com → Billing y recarga el saldo. La llave no hay que cambiarla. " +
    "Después sube un PDF de prueba para comprobar.",
  limite:
    "Qué hacer: espera unos minutos y vuelve a intentar. Si sigue igual, entra a console.anthropic.com → Limits " +
    "para ver el tope de la cuenta.",
};

/**
 * El mensaje que sale por 🔧 SISTEMA: qué pasó / qué significa para el negocio /
 * qué hacer. Sin nombres de tabla, sin códigos HTTP y sin el texto crudo del
 * proveedor — eso queda en la consola, que es donde sirve.
 */
export function mensajeLectorFacturas(causa: CausaLector): string {
  return [
    QUE_PASO[causa],
    "",
    "Qué significa: Marketing y Reclamos no pueden leer el PDF de una factura para llenar los campos solos. " +
      "No se perdió nada y nadie queda trabado: la factura se sigue escribiendo a mano como siempre.",
    "",
    QUE_HACER[causa],
    "",
    `Mientras siga así, este aviso se repite una vez cada ${DIAS_ENTRE_AVISOS} días, no en cada factura.`,
  ].join("\n");
}
