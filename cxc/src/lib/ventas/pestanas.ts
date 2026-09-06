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

/** Los tres modos de la pestaña Clientes. Mismas palabras que el control del
 *  Resumen: dos pantallas del mismo módulo que llaman distinto a lo mismo
 *  obligan a aprenderlo dos veces. */
export const MODOS_CLIENTES = ["ventas", "utilidad", "margen"] as const;
export type ModoClientes = (typeof MODOS_CLIENTES)[number];

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

/**
 * 🔴 CADA PESTAÑA DICE CUÁNTAS EMPRESAS ESTÁ MIRANDO. Las cinco decían «8
 * empresas» y solo el Resumen las mira todas.
 *
 * · Resumen — las OCHO, una fila por empresa más el total del grupo.
 * · Clientes — las SEIS de Fashion Group. Boston y Multifashion tienen sus
 *   clientes en su propio módulo, y hay candado en las dos direcciones. (En
 *   Utilidad y Margen son menos todavía, y ESO lo dice la propia vista con su
 *   número medido: acá no se puede saber cuántas trajo la consulta.)
 * · Productos — se mira de a UNA, elegida adentro, y el período también sale de
 *   ahí: por eso no se nombra el rango de meses del Resumen.
 */
export function alcanceDeLaPestana(tab: string, mesesLabel: string): string {
  if (tab === "clientes") return `6 empresas · ${mesesLabel}`;
  if (tab === "productos") return "una empresa a la vez";
  return `8 empresas · ${mesesLabel}`;
}
