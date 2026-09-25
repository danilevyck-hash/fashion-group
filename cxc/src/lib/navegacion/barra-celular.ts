// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EN EL CELULAR, LA BARRA DE ARRIBA SE ESCONDE AL BAJAR Y VUELVE AL SUBIR
// (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. Medido en píxeles sobre las fotos de Daniel del
// 24-sep, en un iPhone de 844 px de alto:
//
//     franja del reloj y la isla (safe area, intocable) ......  62 px
//     la barra: fila de 44 + la raya de color de 2 ...........  46 px
//     ──────────────────────────────────────────────────────────────
//     blanco fijo arriba ....................................  108 px
//     lo que queda para mirar ...............................  736 px
//
// Esos 46 px estaban ahí SIEMPRE, en las 22 pantallas, aunque la persona
// estuviera leyendo una lista de 40 renglones. Ahora se van al deslizar hacia
// abajo y vuelven al deslizar hacia arriba —el gesto que el teléfono ya enseñó
// en Safari y en Fotos—: **782 px en vez de 736**.
//
// 🔴 Y SE FUERON LA CAMPANA Y LA LUPA DEL CELULAR. Daniel, textual:
// *«no uso ni notificaciones ni buscar»*. Hasta `sm` la barra queda con tres
// cosas y nada más: **FG · el nombre del módulo · ☰**. En la computadora no
// cambia nada, y `⌘K` sigue abriendo la búsqueda igual que siempre.
//
// ⚠️ ESTO NO ES SOLO LA BARRA. Las barras pegajosas de contenido se cuelgan de
// `--fg-altura-encabezado` (`lib/ui/barra-pegajosa.ts`): si el encabezado se
// esconde y esa medida se queda en 46, la barra de filtros de la pantalla
// flota con una franja blanca encima. Por eso `alturaPublicada()` vive acá al
// lado de la decisión: cuando la barra se esconde, la medida pasa a **0**.
//
// 🔑 ESTE MÓDULO NO TOCA EL DOM NI REACT. Es la regla sola, para poder
// probarla sin montar una pantalla. Quien mira el scroll es
// `useBarraCelular.ts`.
//
// Interruptor `BARRA_QUE_SE_ESCONDE`: en `false` vuelve la barra de hoy —
// quieta, con campana y lupa—, sin tocar una línea de lo que se guarda.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Hoy PRENDIDO. `false` = la barra de siempre, con campana y lupa. */
export const BARRA_QUE_SE_ESCONDE = true;

/**
 * ¿Se dibujan la campana y la lupa en el celular?
 *
 * Se DERIVA del interruptor: con el arreglo prendido, no. Nunca se escribe
 * `false` a mano en el encabezado — así apagar el interruptor devuelve los dos
 * botones sin tener que acordarse de un segundo lugar.
 *
 * ⚠️ En la computadora (`sm` y para arriba) los dos siguen igual, pase lo que
 * pase: esto es solo del teléfono.
 */
export function campanaYLupaEnElCelular(): boolean {
  return !BARRA_QUE_SE_ESCONDE;
}

/** Hasta qué ancho manda esta regla: el mismo corte `sm` de Tailwind. */
export const CONSULTA_CELULAR = "(max-width: 639px)";

/** Cuándo el sistema no anima nada, porque el teléfono lo pide. */
export const CONSULTA_SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

/**
 * Cuánto hay que deslizar para que la barra reaccione, en píxeles.
 *
 * No es cero a propósito: el dedo nunca se queda quieto del todo y una barra
 * que parpadea con cada temblor es peor que una que no se mueve. Ocho píxeles
 * es menos de un renglón de texto — nadie los nota como demora.
 */
export const UMBRAL_ESCONDER = 8;
export const UMBRAL_MOSTRAR = 8;

/** Cuánto dura el movimiento. Corta: se tiene que sentir, no que esperar. */
export const MS_TRANSICION_BARRA = 160;

/** Dónde quedó la barra y desde qué punto se está midiendo el deslizamiento. */
export interface EstadoBarra {
  /** `true` = a la vista; `false` = escondida arriba. */
  visible: boolean;
  /** El último desplazamiento que movió la decisión. */
  ultimoY: number;
}

export const ESTADO_BARRA_INICIAL: EstadoBarra = { visible: true, ultimoY: 0 };

/**
 * La regla entera, en una función: dónde queda la barra después de deslizar.
 *
 * 🔴 ARRIBA DEL TODO LA BARRA SIEMPRE ESTÁ. Mientras el desplazamiento no pasa
 * del alto de la propia barra, se muestra pase lo que pase: si no, al abrir
 * una pantalla corta —o al rebotar en el tope, que iOS deja llegar a números
 * negativos— podría quedar escondida sin que nadie la pueda traer de vuelta.
 *
 * Fuera de esa zona manda el SENTIDO del dedo, no la posición: bajar esconde,
 * subir muestra. Un movimiento más chico que el umbral no decide nada **y no
 * mueve el punto de medición**, así que un deslizamiento lento igual termina
 * sumando y la barra responde.
 */
export function siguienteEstadoBarra(
  estado: EstadoBarra,
  y: number,
  alturaBarra: number,
): EstadoBarra {
  const limpio = Number.isFinite(y) ? Math.max(0, y) : 0;
  const piso = Math.max(0, Number.isFinite(alturaBarra) ? alturaBarra : 0);

  if (limpio <= piso) {
    return estado.visible && estado.ultimoY === limpio
      ? estado
      : { visible: true, ultimoY: limpio };
  }

  const delta = limpio - estado.ultimoY;
  if (delta >= UMBRAL_ESCONDER) return { visible: false, ultimoY: limpio };
  if (delta <= -UMBRAL_MOSTRAR) return { visible: true, ultimoY: limpio };
  return estado;
}

/**
 * El alto que se publica en `--fg-altura-encabezado`.
 *
 * 🔴 Con la barra escondida es **0**, no el alto real: las barras pegajosas de
 * contenido se pegan a esa medida, y dejarles 46 px de aire arriba es
 * exactamente la franja blanca que el arreglo viene a evitar.
 */
export function alturaPublicada(visible: boolean, alturaBarra: number): number {
  if (!visible) return 0;
  return Math.max(0, Math.round(Number.isFinite(alturaBarra) ? alturaBarra : 0));
}

/**
 * Cuánto se corre la barra hacia arriba, en píxeles (negativo = se va).
 *
 * Se mide con el alto REAL del encabezado y no con un `-100%` porque el mismo
 * bloque lleva la tira del camino de migas en la computadora: un porcentaje
 * escondería de más si algún día esa tira aparece en el teléfono.
 */
export function corrimientoDeLaBarra(visible: boolean, alturaBarra: number): number {
  return visible ? 0 : -Math.max(0, Number.isFinite(alturaBarra) ? alturaBarra : 0);
}

/**
 * El `transition` del encabezado.
 *
 * 🔴 Con «reducir movimiento» prendido no hay animación: la barra aparece y
 * desaparece de golpe. Es la regla de la casa para todo lo que se mueve.
 */
export function transicionDeLaBarra(sinMovimiento: boolean): string {
  return sinMovimiento ? "none" : `transform ${MS_TRANSICION_BARRA}ms ease-out`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 SEGUNDA VUELTA: EN EL CELULAR NO HAY BARRA DE ARRIBA (24-sep-2026).
//
// Daniel miró la barra que se esconde y eligió la opción **a** del mockup: que
// la franja no exista. El nombre del módulo pasa a ser el **título grande de la
// página** —el que se lee una vez, arriba del contenido, y se va con el dedo—,
// y las tres rayas se mudan a un **botón redondo flotante** abajo a la derecha,
// donde ya descansa el pulgar.
//
// 🩸 LAS CUENTAS, sobre los mismos 844 px del iPhone de Daniel:
//
//     hoy · franja de 46 px ......... 717 px al abrir · 763 al deslizar
//     sin barra ..................... 763 px al abrir · 763 al deslizar
//
// O sea: **los 46 px se recuperan enteros y no se devuelven nunca**, ni
// siquiera el instante en que la barra volvía al subir el dedo.
//
// 🔴 UNA SOLA FUENTE DEL TÍTULO POR PANTALLA. Las portadas nuevas del celular
// —Asistencia, Cuentas por Cobrar, Multifashion, Reclamos, Marketing,
// Catálogos— ya dibujan su propio título grande. Ésas lo dicen (`AppHeader`
// recibe `tituloEnLaPantalla`) y el layout **no lo agrega**: el nombre del
// módulo se lee UNA vez o el arreglo se convierte en un defecto nuevo.
//
// ⚠️ EN LA COMPUTADORA NO CAMBIA NADA. Todo esto vive hasta `sm`
// (`CONSULTA_CELULAR`): el encabezado de escritorio, con su buscador, su
// campana, el usuario y la tira del camino de migas, queda igual.
//
// Interruptor `SIN_BARRA_ARRIBA`: en `false` vuelve la barra que se esconde de
// §5 —entera, con su regla de deslizamiento—, sin tocar una línea de lo que se
// guarda.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Hoy PRENDIDO. `false` = la barra que se esconde, tal como quedó en §5. */
export const SIN_BARRA_ARRIBA = true;

/**
 * ¿Se dibuja la franja de arriba en el celular?
 *
 * Se DERIVA del interruptor, igual que la campana: apagarlo devuelve la barra
 * sin tener que acordarse de un segundo lugar.
 */
export function hayFranjaEnElCelular(): boolean {
  return !SIN_BARRA_ARRIBA;
}

/** Lo que hace falta saber para decidir quién dice el nombre del módulo. */
export interface QuienDiceElTitulo {
  /** La pantalla ya dibuja el nombre del módulo en grande, ella sola. */
  tituloEnLaPantalla: boolean;
  /** Quien SOLO marca: una pantalla, sin menú y sin nombre de módulo. */
  soloMarca: boolean;
}

/**
 * ¿Lo pone el layout, el título grande del módulo?
 *
 * Sí cuando la franja se fue **y** la pantalla no lo dibuja por su cuenta. Con
 * el interruptor apagado no lo pone nunca: ahí el nombre del módulo vive en la
 * franja, como toda la vida.
 *
 * 🔴 A QUIEN SOLO MARCA NO SE LE PONE NINGUNO. Su pantalla tiene UN trabajo y
 * ya empieza con su nombre y la hora de 56 px; meterle «Marcación» arriba es
 * volver a bajar el botón, que es justo lo que el arreglo de «un toque» vino a
 * evitar. Sin la franja gana los 46 px enteros y no pierde nada: no tiene otro
 * módulo del que confundirse.
 */
export function elLayoutPoneElTitulo(quien: QuienDiceElTitulo): boolean {
  if (!SIN_BARRA_ARRIBA) return false;
  return !quien.tituloEnLaPantalla && !quien.soloMarca;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 TERCERA VUELTA: EL BOTÓN SE HACE MÁS CHICO Y SE METE EN LA ESQUINA
// (25-sep-2026, la **5b** del mockup de Ventas, y vale para TODO el sistema).
//
// 🩸 QUÉ VINO A ARREGLAR, medido el 25-sep-2026 a 390 px y sobre las fotos del
// iPhone de Daniel:
//
//     el botón, de 56 px a 16 del borde ....... ocupa x 318 – 374
//     los montos de Ventas › Resumen .......... terminan en x 337
//     la flechita de abrir la fila ............ está en x 345
//
// O sea: **19 px del final de TODO monto** y **la flechita entera**. Barriendo
// la pestaña de 40 en 40 px, en **10 de 16 posiciones** el botón estaba encima
// de un monto de verdad, incluido **$7.069.116,31, el total del grupo** (su
// foto IMG_3176: «$1,405,657.9…»). En Clientes tapaba la fecha en **13 de 31**
// posiciones —39 px de los 79 que mide «24 sept 2026»—, y en Comisiones se
// sentaba ENTERO sobre la columna COBRO de Configuración (x 298–386) y se
// comía el total: «TOTAL A PAGAR $5,97…».
//
// 🔴 LA CUENTA NUEVA. 44 px de botón a 8 px del borde ocupa **x 338 – 382** en
// un teléfono de 390: **un píxel después** de donde terminan los montos. Y 44
// es el piso de lo tocable de la casa (`toque-44`), no un número elegido de
// gusto: más chico que eso sería un defecto nuevo.
//
// 🔑 Y EL COLCHÓN SE VUELVE DOS. Abajo (la última fila) y **a la derecha** (la
// última fila de la pantalla, y toda barra de total que termine pegada al
// borde). Son la MISMA cuenta —botón + margen + 4 de aire— escrita una vez.
//
// ⚠️ LO QUE CUESTA, DICHO: el botón es 12 px más chico. Sigue pasando el piso
// de 44 y gana 12 px de monto en las 22 pantallas.
// ─────────────────────────────────────────────────────────────────────────────

/** El botón redondo: 44 px de lado a lado — el piso de lo tocable de la casa. */
export const DIAMETRO_FLOTANTE = 44;

/** Cuánto lo separa del borde de la pantalla, y de la barra fija si la hay. */
export const MARGEN_FLOTANTE = 8;

/**
 * El colchón que dejan las listas abajo, para que la última fila no quede
 * debajo del botón. 44 del botón + 8 del margen + 4 de aire = 56.
 */
export const COLCHON_DE_LA_LISTA = DIAMETRO_FLOTANTE + MARGEN_FLOTANTE + 4;

/**
 * 🔴 EL MISMO COLCHÓN, PERO A LA DERECHA.
 *
 * Lo usa toda fila o barra cuyo dato viva pegado al borde derecho —los montos
 * de una lista, el «Total grupo» de Ventas, la barra negra de «TOTAL A PAGAR»—
 * y que caiga a la altura del botón. Es el MISMO número que el de abajo: el
 * botón es redondo y tapa lo mismo en los dos sentidos.
 *
 * ⚠️ No se pone en todas las filas del sistema: una lista larga se desliza y
 * solo la que queda a la altura del botón está en riesgo. Se pone donde el
 * dato NO se puede mover — un total al pie, una barra fija — y ahí se mide.
 */
export const COLCHON_LATERAL_FLOTANTE = COLCHON_DE_LA_LISTA;

/**
 * Nombre de la variable CSS con el alto de la barra fija de abajo.
 *
 * La publica la propia barra (`usePublicarAltoBarraFija`), MEDIDA, nunca
 * escrita a mano: «Cobrar» y «Nuevo reclamo» no miden lo mismo, y la de
 * Reclamos crece cuando dice cuántos hay seleccionados.
 */
export const VAR_ALTO_BARRA_FIJA = "--fg-alto-barra-fija";

/** El atributo con el que una barra fija de abajo se deja reconocer. */
export const ATRIBUTO_BARRA_FIJA = "data-barra-fija-abajo";

/**
 * A qué altura del piso queda el botón flotante, en píxeles.
 *
 * 🔴 EL FLOTANTE SUBE; LOS BOTONES NEGROS FIJOS NO SE MUEVEN. Las portadas del
 * celular rematan con una barra fija de ANCHO COMPLETO —«Cobrar», «Nuevo
 * reclamo», «Decidir las 5», «Pedido»—, así que correr el flotante a la
 * izquierda no alcanzaría: no queda esquina libre. Y recortarle 72 px a la
 * derecha a cada barra sería tocar cinco módulos para arreglar uno, y dejar el
 * botón negro descentrado en las cinco.
 *
 * Entonces el flotante se apoya ENCIMA de la barra: la barra publica su alto y
 * el botón se sienta a `margen + ese alto`. Sin barra fija el valor es 0 y el
 * botón vuelve al piso, respetando la franja de iOS.
 *
 * ⚠️ Con barra NO se suma la franja de iOS: la barra ya la lleva adentro de su
 * propio relleno, y sumarla otra vez dejaría el botón flotando en el aire. Por
 * eso es un `max()` de los dos pisos y no una suma de los tres números.
 */
export function abajoDelFlotante(altoBarraFija: number, franjaIos = 0): number {
  const alto = Math.max(0, Number.isFinite(altoBarraFija) ? altoBarraFija : 0);
  const franja = Math.max(0, Number.isFinite(franjaIos) ? franjaIos : 0);
  return Math.round(Math.max(MARGEN_FLOTANTE + franja, MARGEN_FLOTANTE + alto));
}

/**
 * La MISMA regla, ya escrita en CSS, para que el botón no tenga que medir nada
 * ni volver a pintarse cuando la barra aparece.
 *
 * 🔑 Es la única forma en que el flotante conoce la barra: un `max()` que el
 * navegador resuelve solo. Sin barra, `var(...)` cae a `0px` y manda el piso de
 * siempre — o sea que **falla ABIERTA**: una pantalla que se olvide de publicar
 * su alto deja el botón donde estaba, nunca lo esconde.
 */
export const ABAJO_DEL_FLOTANTE_CSS =
  `max(calc(${MARGEN_FLOTANTE}px + env(safe-area-inset-bottom)), ` +
  `calc(${MARGEN_FLOTANTE}px + var(${VAR_ALTO_BARRA_FIJA}, 0px)))`;
