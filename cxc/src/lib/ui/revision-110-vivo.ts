// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 — arreglos tras la revisión EN VIVO (14-nov-2026). Los números
// son los de los mockups «vivo-NN». Solo pantalla: ningún dato que se guarda
// ni ninguna cuenta de plata cambia. `false` = la pantalla de antes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 02 · Un aviso «⚠ sin actualizar desde el …» SÍ se puede partir: solo el ícono
 * va pegado a su primera palabra y la fecha queda entera. 🩸 El arreglo de
 * «textos sin partir» lo dejó en una sola línea y en el celular sacaba la
 * tarjeta Inventario de la pantalla (la página se movía de lado).
 */
export const AVISO_SE_PARTE = true;

/**
 * 01 · Cruzar los 640 px de ancho (ventana que se achica, iPad partido, o la
 * foto de página entera de Playwright, que un instante mide 1 px) NO vuelve a
 * montar la pantalla: el proveedor de la barra del celular se dibuja SIEMPRE
 * (en la computadora con valor `null`). 🩸 Antes cambiaba de `<>` a
 * `<Provider>` y React tiraba todo lo de adentro: Despachos › Pedidos volvía a
 * «Pendientes» y a «Cargando…».
 */
export const MONTAJE_ESTABLE = true;

/**
 * 05 · Ventas › Productos (computadora): el buscador a la izquierda llenando el
 * ancho, con el período y «Rango de fechas» a la derecha; Empresa, Departamento,
 * Género y Descripción en la línea de abajo con «Descargar en Excel» al final; y
 * «Actualizado hace N min ↻» al final de la línea del resumen (nunca solo).
 */
export const PRODUCTOS_BUSCADOR_ANCHO = true;

/**
 * 12 · Productos (celular), v2 aprobada por Daniel: «Actualizado h:mm ↻» al final
 * de la línea de filtros puestos («Fashion Wear ✕»); el resumen en dos líneas,
 * «N unidades · Venta $X» y «Utilidad $X · Margen N%», cada rótulo pegado a su
 * número. Sin filtros puestos, la frescura cierra la PRIMERA línea del resumen.
 * Regla: «Actualizado ↻» nunca queda solo en una línea.
 */
export const PRODUCTOS_RESUMEN_DOS_LINEAS = true;

/** 06 · Asistencia (celular): «1 día corregido» que no cabe al lado de un nombre largo baja entero, debajo del nombre. */
export const DISTINTIVO_BAJO_EL_NOMBRE = true;

/** 07 · Comisiones (celular): la fila de una empresa en negativo conserva su nombre; «Comisión $X · Descuento $Y» va debajo, en gris. */
export const DESGLOSE_DEBAJO = true;

/** 08 · Comisiones (computadora): la ⌄ va al lado del monto, en una línea, también en Vistana y en Total. */
export const FLECHA_AL_LADO = true;

/** 09 · Asistencia › Aprobaciones (computadora): «Buscar colaborador…» a la izquierda llenando el ancho; período, Colaborador · Día, Excel y «Aprobar pendientes» a la derecha. */
export const BUSCADOR_PRIMERO_APROBACIONES = true;

/** 10 · Vista general (computadora): «Gastos · registro pausado» mide una línea; no se estira al alto de Inventario por empresa. */
export const GASTOS_DEL_ALTO_DE_SU_LINEA = true;

/** 11 · Multifashion › Resumen: cada comparación se lee entera en su línea («▼ −46.4% vs octubre, al día 13» no se parte). */
export const COMPARACION_ENTERA = true;

/** 14 · Vista general › Alertas: los días de un reclamo salen de `diasDesde` (fecha de factura, «hoy» de Panamá), igual que en Reclamos: 650 d en las dos pantallas. */
export const DIAS_COMO_RECLAMOS = true;

/** 15 · Catálogos: la pastilla de orden lleva el ícono de línea (dos flechas) en vez del signo «↕». Las cuatro marcas y el público. */
export const ORDEN_ICONO_DE_LINEA = true;

/** 16 · Reclamos: la portada dice «Vistana International», como el resto del sistema. */
export const RECLAMOS_NOMBRE_COMPLETO = true;

/** Despachos › Pedidos: las unidades con separador de miles como el resto del sistema («1,552 unidades»). */
export const UNIDADES_CON_COMA = true;

/** 03 · Ventas › Resumen: la columna que queda junto a «Empresa» al abrir (hoy ABR) se ve entera; se mide en pantalla. */
export const ABR_MEDIDA_EN_PANTALLA = true;

/** 13 · Menú plegado (computadora): cabe en la ventana también con la escala de pantalla (zoom desde 1280 px); Usuarios queda a la vista en 1440 × 900. */
export const RAIL_ALTO_CON_ESCALA = true;
