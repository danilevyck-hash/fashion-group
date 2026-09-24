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
