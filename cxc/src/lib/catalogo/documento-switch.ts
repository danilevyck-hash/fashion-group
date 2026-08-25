// ─────────────────────────────────────────────────────────────────────────────
// PEDIDO O COTIZACIÓN — LAS DOS SALIDAS DEL MISMO BOTÓN (24-ago-2026)
//
// Hasta hoy "Enviar a Switch" tenía UNA sola salida: `POST /apipedido/terminar`,
// que crea un PEDIDO. Daniel pidió poder mandar también una COTIZACIÓN y fue
// textual sobre cómo: ***"que estén los dos"*** — o sea que se elija cada vez,
// no que una reemplace a la otra.
//
// El endpoint de la cotización (`POST /apicotizacion/terminar`) NO está en
// `docs/api-switch.pdf` —el PDF solo documenta LEER cotizaciones (§5.31, §5.32)
// y mandarlas por correo (§5.33)— y se mapeó contra producción el 24-ago-2026
// mandando un campo a la vez contra `active_shoes`, sin `articulos` (sin líneas
// no puede crear nada: cada respuesta es solo una validación, y así se mapeó sin
// ensuciar la empresa). Valida en el MISMO orden que el del pedido:
//
//   {}                          → 400 code 0315 "VENDEDOR NO SE ENCUENTRA DISPONIBLE"
//   {vendedorId}                → 400 code 0316 "CLIENTE NO SE ENCUENTRA DISPONIBLE"
//   {vendedorId, clienteId}     → 400 code 0319 "INFORMACIÓN DE ARTICULOS INCORRECTA"
//
// O sea: MISMO contrato exacto que `/apipedido/terminar` (vendedorId + clienteId
// + articulos[] + descuentoGlobal opcional). Por eso el motor de envío es UNO
// solo y lo único que cambia es a qué ruta sale el POST.
//
// ⚠️ `/apicotizacion/crear`, `/guardar` y `/nueva` NO existen: devuelven la
// página de excepción de Switch con **HTTP 200** (200, no 404). Cualquier
// endpoint nuevo de este conector se prueba por el SHAPE de la respuesta, nunca
// por el status.
//
// 🔴 LO QUE LA PANTALLA TIENE QUE DECIR ANTES DE MANDAR, Y POR QUÉ VIVE ACÁ.
// Una cotización NO aparta mercancía: si se cotizan 500 pares, a los otros
// vendedores les siguen apareciendo disponibles y los pueden vender. Enterarse
// de eso DESPUÉS es el problema. Los textos son constantes de este módulo —no
// literales sueltos en cada pantalla— porque son tres las pantallas que ofrecen
// la elección (checkout, detalle del pedido y confirmación) y tres copias de una
// advertencia se separan solas; la que quede vieja es la que manda plata al ERP.
//
// Este módulo es PURO: no importa React ni Supabase. Lo usan el navegador (los
// tres botones) y el servidor (las dos rutas y el motor), y es la única
// definición de qué valores son válidos.
// ─────────────────────────────────────────────────────────────────────────────

/** Qué se crea en Switch. El valor viaja en el body y se guarda en la tabla de envíos. */
export type DocumentoSwitch = "pedido" | "cotizacion";

/**
 * El default es PEDIDO y es deliberado: es lo que el sistema hacía antes de que
 * existiera la elección. Un body viejo (o un reintento sin el campo) sigue
 * creando exactamente lo mismo que creaba ayer.
 */
export const DOCUMENTO_POR_DEFECTO: DocumentoSwitch = "pedido";

const VALIDOS: readonly DocumentoSwitch[] = ["pedido", "cotizacion"];

export function esDocumentoSwitch(v: unknown): v is DocumentoSwitch {
  return typeof v === "string" && (VALIDOS as readonly string[]).includes(v);
}

/**
 * Lo que llega del navegador → un valor válido. Cualquier cosa que no sea
 * exactamente "cotizacion" cae a PEDIDO: el modo de fallo aceptable es crear el
 * documento de siempre, nunca inventar una cotización que nadie pidió.
 */
export function normalizarDocumento(v: unknown): DocumentoSwitch {
  return esDocumentoSwitch(v) ? v : DOCUMENTO_POR_DEFECTO;
}

export const esCotizacion = (d: DocumentoSwitch): boolean => d === "cotizacion";

/** "Pedido" / "Cotización" — como se nombra en pantalla y en Telegram. */
export function etiquetaDocumento(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "Cotización" : "Pedido";
}

/**
 * 🔴 LA FRASE. Es lo único que la pantalla NO puede dejar de decir antes de
 * mandar una cotización, y por eso es una constante y no un texto inline.
 * Español simple, sin jerga: "aparta" y no "reserva stock"/"compromete
 * inventario", y con el ejemplo de los pares adentro porque el número es lo que
 * hace entender la consecuencia.
 */
export const TEXTO_NO_RESERVA =
  "La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender.";

/** Lo que sí hace el pedido, dicho con las mismas palabras. */
export const TEXTO_SI_RESERVA = "Aparta la mercancía para este cliente.";

/**
 * ⚠️ La consecuencia del candado at-most-once, dicha antes y no después. Un
 * pedido admite UN envío no-fallido: si sale como cotización, ese pedido ya no
 * vuelve a salir. Para vender de verdad se duplica (el botón "Duplicar" ya
 * existe y pregunta el cliente). El candado NO se tocó — ver switch-envio.ts.
 */
export const TEXTO_COTIZACION_DESPUES =
  "Si después lo compran, duplica el pedido y mándalo como pedido.";

/** Una salida, tal como se dibuja en el selector. El orden del array ES el orden de la pantalla. */
export interface OpcionDocumento {
  clave: DocumentoSwitch;
  /** Texto del botón. */
  titulo: string;
  /** Qué hace con la mercancía, en una línea. */
  queHace: string;
  /** Segunda línea, solo donde hace falta. */
  detalle?: string;
}

/**
 * Las dos opciones, en el orden en que se leen. PEDIDO va primero: es lo que se
 * hace todos los días y lo que hacía el botón antes de este cambio.
 */
export const OPCIONES_DOCUMENTO: readonly OpcionDocumento[] = [
  { clave: "pedido", titulo: "Pedido", queHace: TEXTO_SI_RESERVA },
  {
    clave: "cotizacion",
    titulo: "Cotización",
    queHace: TEXTO_NO_RESERVA,
    detalle: TEXTO_COTIZACION_DESPUES,
  },
];

/** "Pedido creado en Switch" / "Cotización creada en Switch". */
export function tituloCreadoEnSwitch(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "Cotización creada en Switch" : "Pedido creado en Switch";
}

/** "Enviado a Switch" / "Cotización enviada a Switch" — el estado sin verificar. */
export function tituloEnviadoASwitch(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "Cotización enviada a Switch" : "Enviado a Switch";
}

/**
 * La etapa que va en el aviso de Telegram. Quien lo lee no es técnico y lo que
 * necesita saber de un vistazo es cuál de las dos salió — un pedido aparta
 * mercancía y una cotización no.
 */
export function etapaTelegram(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "COTIZACIÓN enviada a Switch" : "enviado a Switch";
}
