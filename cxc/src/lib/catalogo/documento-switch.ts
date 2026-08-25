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
// 🔴 25-ago-2026 — SE OFRECEN LAS DOS DIRECTO, SIN VENTANA EN EL MEDIO.
// El 24-ago la elección costaba un toque extra en un modal con un párrafo
// explicando la diferencia. Daniel lo revirtió, textual: ***"quiero que en vez
// de que diga «enviar a switch», salga cotización o pedido como opción (sin
// párrafo explicando, btw no siempre hay q estar explicando todo, se vuelve
// tedioso)"***. Lo que NO se fue con el párrafo es el dato material: la
// cotización sigue diciendo, en letra chica y pegada a la opción, que no aparta
// mercancía (`NOTA_COTIZACION`). Y ningún candado del servidor se aflojó — el
// 422 sin cliente, `normalizarDocumento` y el at-most-once están intactos.
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
 * 🔴 LA FRASE LARGA. Desde el 25-ago-2026 ya NO se dibuja antes de mandar —la
 * elección es directa y ahí va la etiqueta corta (`NOTA_COTIZACION`)—, pero
 * sigue viva donde sí hay lugar para leerla: la confirmación DESPUÉS de mandar
 * y el aviso de Telegram. Español simple, sin jerga: "aparta" y no "reserva
 * stock"/"compromete inventario", y con el ejemplo de los pares adentro porque
 * el número es lo que hace entender la consecuencia.
 */
export const TEXTO_NO_RESERVA =
  "La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender.";

/**
 * 🔴 LA MISMA ADVERTENCIA, EN TRES PALABRAS — y es lo ÚNICO que queda del
 * párrafo (25-ago-2026). Daniel, textual: ***"que en vez de que diga «enviar a
 * switch», salga cotización o pedido como opción (sin párrafo explicando, btw
 * no siempre hay q estar explicando todo, se vuelve tedioso)"***.
 *
 * Las dos salidas se ofrecen DIRECTO, sin ventana intermedia. Pero el riesgo que
 * el paso intermedio protegía no desapareció: una cotización NO aparta
 * mercancía, y el que toca la equivocada manda 500 pares de la forma que no era.
 * Así que la información material sobrevive pegada a la opción, en el mínimo de
 * palabras posible. NO es un párrafo: es una etiqueta, y no puede crecer —
 * hay candado de largo.
 */
export const NOTA_COTIZACION = "no aparta mercancía";

/** Una salida, tal como se dibuja. El orden del array ES el orden de la pantalla. */
export interface OpcionDocumento {
  clave: DocumentoSwitch;
  /** Texto del botón. */
  titulo: string;
  /** La etiqueta en letra chica, pegada al título. Solo la cotización la lleva. */
  nota?: string;
}

/**
 * Las dos opciones, en el orden en que se leen. PEDIDO va primero: es lo que se
 * hace todos los días y lo que hacía el botón antes de que hubiera dos.
 */
export const OPCIONES_DOCUMENTO: readonly OpcionDocumento[] = [
  { clave: "pedido", titulo: "Pedido" },
  { clave: "cotizacion", titulo: "Cotización", nota: NOTA_COTIZACION },
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
