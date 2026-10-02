// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA BARRA DEL CELULAR, COMO LA HARÍA APPLE (v2, 2-oct-2026).
//
// Daniel rechazó la v1: *«no me gustó tu visión. Pones en los 3 puntitos cosas
// más usables y gastas una línea sólo en buscador. ¿Cómo lo haría Apple?»*. Y
// rescató de otro mockup: los títulos grandes del celular, de 34 a ~22 px.
//
// LA REGLA (iOS Human Interface Guidelines), igual en todos los módulos:
//   1. BARRA DE NAVEGACIÓN de una línea: el título (22 px) a la izquierda —si el
//      módulo tiene pestañas, el título ES el selector— y, debajo y chico, el
//      período. A la derecha, los botones de uso frecuente como íconos de
//      44 px: buscar, descargar, filtrar. Lo raro (ayuda, configuración) va
//      en UN menú «···», al final.
//   2. BUSCAR no ocupa una fila: es la lupa de la barra; al tocarla se vuelve
//      el campo en esa misma línea, con «Cancelar».
//   3. POCAS OPCIONES (Colaborador | Día, Lista | Calendario): control
//      segmentado en una fila que ya existe, o un ícono que alterna. Nunca
//      escondidas en el «···».
//   4. La ACCIÓN PRINCIPAL, fija abajo; publica `--fg-alto-barra-fija`.
//
// El razonamiento pantalla por pantalla y las mediciones de uso están en
// `diseno-v2.md` (carpeta de capturas del 2-oct-2026).
//
// 🔑 ESTE MÓDULO NO TOCA EL DOM NI REACT: son las reglas solas, para probarlas
// sin montar una pantalla. Quien dibuja es `components/celular/BarraDeControles`.
//
// 🔴 En la computadora no cambia nada. Interruptor `BARRA_CELULAR_2026_10`:
// en `false` cada pantalla queda exactamente como hoy (títulos de 34 px incluidos).
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = cada pantalla del celular como estaba antes del 2-oct-2026. */
export const BARRA_CELULAR_2026_10 = false;

/** ¿Se dibuja la barra nueva? Solo con el interruptor prendido y en el celular. */
export function usaBarraCelular(esCelular: boolean, interruptor: boolean = BARRA_CELULAR_2026_10): boolean {
  return interruptor && esCelular;
}

/**
 * Lo que dice el título. 🔴 El nombre se dice UNA vez: con pestañas, el título
 * es la pestaña (el selector); sin pestañas, el módulo.
 */
export function textoDelTitulo(titulo: string, pestanaActiva: string | null | undefined): string {
  return pestanaActiva?.trim() ? pestanaActiva : titulo;
}

/** La línea chica bajo el título: el período y el filtro que esté puesto. */
export function subtituloDeLaBarra(partes: ReadonlyArray<string | null | undefined | false>): string {
  return partes.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" · ");
}

/** El tamaño del título en el celular: 22 px (Daniel, 2-oct-2026). */
export const TITULO_CELULAR_PX = 22;

/**
 * v3.3 (2-oct-2026). Daniel: «los números en CxC y Reclamos no sean en
 * negrita, que no manden tanto». Un número grande va a peso 400–500, nunca
 * negrita; apagado devuelve la clase de siempre, letra por letra.
 */
export function numeroSinNegrita(
  antes: string,
  peso: "font-normal" | "font-medium" = "font-normal",
  interruptor: boolean = BARRA_CELULAR_2026_10,
): string {
  if (!interruptor) return antes;
  return antes.replace(/(^|\s)font-(?:bold|semibold|extrabold)(?=\s|$)/, `$1${peso}`);
}

/**
 * La clase de un título grande del celular. Apagado devuelve la de siempre,
 * letra por letra; prendido baja el tamaño a 22 px y el peso a semibold, y
 * conserva lo demás (color, `truncate`, `break-words`).
 */
export function tituloCelular(antes: string, interruptor: boolean = BARRA_CELULAR_2026_10): string {
  if (!interruptor) return antes;
  return antes
    .replace(/(^|\s)text-(?:\[\d+px\]|2xl|3xl|4xl)(?=\s|$)/, `$1text-[${TITULO_CELULAR_PX}px]`)
    .replace(/(^|\s)font-bold(?=\s|$)/, "$1font-semibold")
    .replace(/(^|\s)leading-\[[\d.]+\](?=\s|$)/, "$1leading-tight");
}
