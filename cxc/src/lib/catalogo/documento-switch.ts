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

// 🔴 `TEXTO_NO_RESERVA` (la frase larga de los 500 pares) SE BORRÓ el
// 25-ago-2026. Era lo último que quedaba del párrafo didáctico y se dibujaba en
// la confirmación, DESPUÉS de mandar. Daniel lo señaló en su captura, textual:
// ***"no siempre tiene que haber explicación, eso ensucia mi ERP"***.
//
// No se deja "por si acaso": una constante muerta con el párrafo adentro es el
// párrafo esperando a que alguien la vuelva a montar — el mismo motivo por el
// que `ElegirDocumentoSwitch.tsx` se borró en vez de dejarse sin usar. Lo que
// SÍ queda es el dato material, en el mínimo de palabras y donde se decide:
// `NOTA_COTIZACION` pegado a la opción, y la línea propia del aviso de Telegram
// ("No aparta mercancía — sigue disponible para los demás.").

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PALABRA QUE ACOMPAÑA AL NÚMERO — Y POR QUÉ LA DECIDE SWITCH
// (25-ago-2026)
//
// Daniel mandó TOM-027 como COTIZACIÓN, Switch la aceptó, y el papel que le
// llegó al cliente decía «Pedido: TOM-027». Textual: ***"esto fue una
// cotización, porque dice pedidos en pdf?"***. Una cotización NO aparta
// mercancía: llamarla «Pedido» en el papel que se manda es exactamente la
// confusión que el resto de este módulo existe para evitar.
//
// 🔴 EL IDENTIFICADOR NO CAMBIA. `TOM-027` es el número de la casa y se llama
// así siempre, salga como pedido o como cotización. Lo único que cambia es la
// PALABRA que lo acompaña.
//
// 🔴 MANDA LO QUE HAY EN SWITCH, porque es lo único comprobable: si salió como
// cotización, el papel dice «Cotización» aunque acá el pedido figure
// confirmado. Y si TODAVÍA NO SALIÓ no es ninguna de las dos: `palabraEnSwitch`
// devuelve `null` y no se le inventa etiqueta — cada pantalla se queda con la
// palabra que ya usaba, que es exactamente lo que decía antes de este cambio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los estados de envío que cuentan como «está en Switch». Es el MISMO criterio
 * que el candado de edición (`switch-lock.ts`) y que la pestaña de la lista: si
 * un pedido no se puede editar porque ya salió, entonces el papel tiene que
 * nombrar lo que salió. Dos definiciones de «está en Switch» se separan solas.
 */
export const ESTADOS_EN_SWITCH: readonly string[] = ["enviado", "verificado"];

/** Lo mínimo del envío activo para saber qué palabra va en el papel. */
export interface EnvioParaPalabra {
  estado?: string | null;
  /** Columna `documento`. Ausente (DDL 20260824160000 pendiente) = pedido. */
  documento?: DocumentoSwitch | string | null;
}

/**
 * «Pedido» · «Cotización» · `null` si el pedido NO salió a Switch.
 *
 * El `null` es el punto del módulo: un pedido que todavía no se mandó no es
 * ninguna de las dos, y rotularlo sería inventar. Quien llama decide con qué
 * palabra se queda mientras tanto (`palabraDelPapel`).
 */
export function palabraEnSwitch(envio: EnvioParaPalabra | null | undefined): string | null {
  if (!envio) return null;
  if (!ESTADOS_EN_SWITCH.includes(String(envio.estado ?? ""))) return null;
  return etiquetaDocumento(normalizarDocumento(envio.documento));
}

/**
 * La palabra que se pinta. Manda Switch; si no salió, la que esa pantalla ya
 * usaba (`siNoSalio`, por defecto «Pedido» — el `DOCUMENTO_POR_DEFECTO`, que es
 * lo único que este sistema sabía crear antes del 24-ago-2026).
 */
export function palabraDelPapel(
  envio: EnvioParaPalabra | null | undefined,
  siNoSalio: string = etiquetaDocumento(DOCUMENTO_POR_DEFECTO),
): string {
  return palabraEnSwitch(envio) ?? siNoSalio;
}

/** "Pedido creado en Switch" / "Cotización creada en Switch". */
export function tituloCreadoEnSwitch(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "Cotización creada en Switch" : "Pedido creado en Switch";
}

/** "Enviado a Switch" / "Cotización enviada a Switch" — el estado sin verificar. */
export function tituloEnviadoASwitch(d: DocumentoSwitch): string {
  return esCotizacion(d) ? "Cotización enviada a Switch" : "Enviado a Switch";
}

// 🔴 `etapaTelegram` SE BORRÓ el 25-ago-2026. Devolvía "COTIZACIÓN enviada a
// Switch" / "enviado a Switch" para deletrear la etapa en el aviso de Telegram.
// Daniel podó el aviso a dos líneas —textual: ***"lo quiero más simple… solo
// quiero lo útil"***— y esa etapa era lo mismo dicho tres veces: la primera
// palabra del aviso YA es «Cotización»/«Pedido» (`etiquetaDocumento`) y abajo va
// el número de Switch. No se deja la función sin usar: una etapa muerta es la
// etapa esperando a que alguien la vuelva a montar.
