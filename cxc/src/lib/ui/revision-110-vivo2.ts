// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 — arreglos tras la SEGUNDA revisión en vivo (15-nov-2026). Los
// números son los de los mockups «vivo2-NN». Solo pantalla: ningún dato que se
// guarda ni ninguna cuenta de plata cambia. `false` = la pantalla de antes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 01 · Asistencia (celular): «2 días corregidos» que no cabe baja ENTERO debajo
 * del nombre. 🩸 El arreglo de #782 no se notaba: entre «17:00» y «2 días…» no
 * había ningún espacio (JSX borra el salto de línea), y entre dos dígitos el
 * navegador no tiene dónde partir la línea. Ahora va un espacio de ancho cero
 * (no mueve nada) antes de cada distintivo.
 */
export const DISTINTIVO_CON_ESPACIO = true;

/** 02 / 03 · Comisiones: «Comisión $X» y «Descuento $Y», cada rótulo en su línea pegado a su monto (computadora y celular). */
export const DESGLOSE_EN_DOS_LINEAS = true;

/** 04 · Multifashion (computadora): la barra «Multifashion · Actualizado · mes · Rango de fechas» se pega DEBAJO del encabezado. */
export const MULTIFASHION_BARRA_PEGAJOSA = true;

/** 05 · Búsqueda global › Ventas: «$271,799.09 · Vistana International · 13 nov 2026»; sin fecha, nada. */
export const BUSQUEDA_VENTAS_EMPRESA_Y_FECHA = true;

/** 06b · Catálogos (celular): ninguna línea de la tarjeta empieza con «·»; el punto va solo ENTRE dos datos del mismo renglón. */
export const STOCK_SIN_PUNTO_AL_INICIO = true;

/** 06c · Aprobaciones › Día (celular): «dom 1 nov ⌄» en una línea y la flecha no se monta sobre «4 colaboradores». */
export const DIA_SIN_ENCIMARSE = true;

/**
 * 02 · Comisiones (computadora): la tabla cabe y «Total» conserva su margen a la
 * derecha. 🩸 Desde #782 la ⌄ (44 px para el dedo) y el monto van en una línea,
 * y cuatro columnas crecieron hasta sacar la tabla 28 px de su caja. La ⌄ se
 * mete 8 px en el margen de su celda (el dedo la sigue tocando en 44 px) y las
 * seis columnas de empresa quedan con 8 px a cada lado también en pantalla ancha.
 */
export const FLECHA_EN_EL_MARGEN = true;
