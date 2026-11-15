// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 — ajustes tras revisar en producción (14-nov-2026).
// Solo pantalla: ningún dato que se guarda, ninguna llamada a Switch y ninguna
// regla de plata cambia. Cada punto con su interruptor; `false` = la pantalla
// de antes. Los números son los de la lista de defectos de la revisión.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1 · Ningún texto guía de un buscador se corta a mitad de palabra. 🩸 Safari
 * le guarda ~22 px a la ✕ de un `type="search"` aunque esté vacío: con eso
 * «Buscar colaborador» salía «Buscar colaborad». Vacío, la ✕ no ocupa lugar
 * (`globals.css`, `html[data-r110-ajustes]`); y si aun así no cabe, dice «Buscar».
 */
export const PLACEHOLDER_ENTERO = true;

/** 2 · La guía pendiente (el formulario con «Despachar» y las firmas) esconde la barra de pestañas. */
export const FORMULARIO_SIN_TAB_BAR = true;

/** 3 · Las hojas y la barra fija del celular no abren su portal hasta hidratar (🩸 #418/#422 en /clientes). */
export const HIDRATACION_SIN_PORTAL = true;

/** 3 · Clientes (celular): «Todos ▾ · Ordenar ▾ · Actualizado h:mm ↻» cabe sin deslizar de lado (el ↻ desbordaba 4 px). */
export const FRESCURA_SIN_DESBORDE = true;

/**
 * 4 · Textos que no se parten mal en el celular: «(24 %)», «−$1,234.00»,
 * «Saldo a favor $X», «Registro de gastos pausado», «Fashion Wear»,
 * «el más viejo, 17 d», «vs 1–14 nov 2025».
 */
export const TEXTOS_SIN_PARTIR = true;

/** Espacio que no parte (U+00A0). */
export const NBSP = " ";

/** «sábado (24 %)»: el número y su % nunca quedan en líneas distintas. */
export function pegarPorcentaje(texto: string): string {
  return texto.replace(/(\d) %/g, `$1${NBSP}%`);
}

/** 11 · Planilla: el aviso nombra el selector como se ve: «con «Todas las empresas» no se paga nada». */
export const TODAS_EN_EL_AVISO = true;

/** 6 · Íconos de línea (lucide) en vez de emoji en la pantalla: Recordatorios (💵 🔔), «⚠ sin actualizar» de Vista general y los demás. */
export const ICONOS_DE_LINEA_EN_TODO = true;

/** 8 · Vista general: con el registro pausado, Boston («Carga manual») no impide la línea única de Gastos ni la Rentabilidad compacta. */
export const PAUSA_CUENTA_CARGA_MANUAL = true;

/** 5 · Celular: el buscador, el total y la lista empiezan en el mismo borde (Comisiones; Guías, la tarjeta pendiente). */
export const BORDES_ALINEADOS = true;

/** 7 · Ventas › Resumen (computadora): abre al final con el mes proyectado entero y su encabezado, y ninguna columna medio cortada. */
export const TABLA_SIN_COLUMNA_CORTADA = true;

/** 9 · Despachos › Guías (computadora): cliente y destino ganan el ancho que se iba en huecos (aviso en la columna de «Pendiente», menos aire). */
export const GUIAS_COLUMNAS_ANCHAS = true;

/** 9 · Despachos (computadora): las pestañas Pedidos · Etiquetas · Guías · Configuración alineadas al borde izquierdo del contenido. */
export const PESTANAS_A_LA_IZQUIERDA = true;

/** 10 · Computadora: el buscador a la izquierda llenando el ancho y los demás mandos en la MISMA fila (Préstamos, Marketing › Gastos, Ventas › Productos). */
export const BUSCADOR_EN_LA_FILA = true;

/** 11 · Asistencia (computadora): casilla, código, nombre y hora de salida no se parten; los distintivos bajan enteros. */
export const NOMBRE_SIN_PARTIR = true;

/** 15 · Menú plegado (Inicio): todos los íconos caben en el alto de la ventana; si no, se desliza. Ninguno medio cortado. */
export const RAIL_CABE_ENTERO = true;

/** 16 · Clientes (computadora): el correo con más lugar y entero al pasar el mouse. */
export const CORREO_ENTERO = true;
