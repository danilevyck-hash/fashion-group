// ─────────────────────────────────────────────────────────────────────────────
// LAS PESTAÑAS DE VENTAS — de CINCO a TRES (5-sep-2026).
//
// Resumen · Clientes · Productos. «Utilidad» pasó a ser un MODO de Clientes y
// «Comisiones» volvió a su módulo, completa.
//
// 🔑 VIVE EN UN MÓDULO PURO Y NO EN `VentasShell`. Dos motivos, y los dos ya
// costaron algo en este repo:
//
//   · `ClientesView` necesita la lista de modos y `VentasShell` monta a
//     `ClientesView`: tenerla en el shell es un import circular esperando a que
//     alguien lo despierte.
//   · Un candado que tiene que montar la pantalla entera para preguntar «¿a
//     dónde va `?tab=utilidad`?» es un candado que se salta cuando molesta.
//     Acá se responde sin DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** Las pestañas, en el orden en que se ven. Es la lista contra la que se valida
 *  el `?tab=` de la URL: lo que no esté acá cae en «resumen», NUNCA en blanco
 *  (Radix no dibuja nada si el `value` no tiene trigger). */
export const TABS_VENTAS = ["resumen", "clientes", "productos"] as const;
export type TabVentas = (typeof TABS_VENTAS)[number];

/** Los DOS modos de la pestaña Clientes. Mismas palabras que el control del
 *  Resumen: dos pantallas del mismo módulo que llaman distinto a lo mismo
 *  obligan a aprenderlo dos veces.
 *
 *  🔴 «Margen %» DEJÓ DE SER UN MODO (11-sep-2026). Medido: «Utilidad» y
 *  «Margen %» montaban el MISMO componente, con la MISMA consulta, las MISMAS
 *  filas y las MISMAS columnas; lo único que cambiaba era por cuál columna
 *  arrancaba el orden. Eran dos botones para un «ordenar por». Queda
 *  «Utilidad», con el margen % en su columna, y se ordena tocando el
 *  encabezado como en el resto de la casa. `?modo=margen` guardado llega a
 *  `utilidad` (`modoHeredado`). */
export const MODOS_CLIENTES = ["ventas", "utilidad"] as const;
export type ModoClientes = (typeof MODOS_CLIENTES)[number];

/** Un `?modo=` viejo, traducido a donde vive hoy. `margen` → `utilidad`. */
export function modoHeredado(modo: string): ModoClientes | null {
  return modo === "margen" ? "utilidad" : null;
}

export function esTabVentas(v: string): v is TabVentas {
  return (TABS_VENTAS as readonly string[]).includes(v);
}

export function esModoClientes(v: string): v is ModoClientes {
  return (MODOS_CLIENTES as readonly string[]).includes(v);
}

/**
 * Un `?tab=` de los que ya no existen, traducido al lugar donde vive hoy.
 *
 * 🔴 SOLO PARA LO QUE SE QUEDA EN ESTA MISMA RUTA. `?tab=comisiones` NO está
 * acá: se va a OTRA página (`/comisiones`) y lo resuelve `next.config.js`,
 * antes de que el navegador descargue esta pantalla. `?tab=utilidad` sí, porque
 * su destino es la misma ruta con la MISMA clave `tab`, y un redirect volvería
 * a matchear su propia salida — un bucle. Traducir es lo único que no puede
 * hacer un bucle. `?tab=referencia` sigue donde estaba, también en
 * `next.config.js`, desde el 12-ago-2026.
 */
export function tabHeredado(tab: string): { tab: TabVentas; modo: ModoClientes } | null {
  return tab === "utilidad" ? { tab: "clientes", modo: "utilidad" } : null;
}

// ⛔ ACÁ VIVÍA `alcanceDeLaPestana` — la línea «8 empresas · cierre Ago (mes en
// curso Sep)» / «6 empresas · …» / «una empresa a la vez» que iba arriba de las
// pestañas. Se retiró el 11-sep-2026 con el selector único de período: la
// matriz lista las ocho empresas una por una y abajo dice hasta qué día llegan
// los datos; Clientes trae el desplegable de empresa, y Productos el suyo. Un
// contador encima de una tabla que ya cuenta es una línea de más (Daniel, con
// el mockup: *«el período dicho una vez arriba»*).
