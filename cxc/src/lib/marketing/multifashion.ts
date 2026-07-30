// ============================================================================
// Marketing — Multifashion como bucket INDEPENDIENTE del grupo de marcas.
//
// Pedido de Daniel, textual: *"sacar multifashion y sus gastos ponerlos afuera
// en un card como marca totalmente independiente, fuera de ese grupo, excel,
// zip"*.
//
// Por qué va aparte: las demás cards de Marketing son marcas con contraparte
// (Tommy, Calvin, Reebok…) donde el gasto se comparte con el dueño de la marca.
// Multifashion es una tienda del propio grupo: su gasto de marketing es 100%
// nuestro y mezclarlo con el co-op de las marcas hace que el total de la card
// "Gastos Tommy y Calvin" incluya plata que no tiene nada que ver con Tommy ni
// con Calvin.
//
// Módulo PURO (sin base, sin I/O). Lo consumen el export ZIP/Excel, la card del
// selector, la lista de proyectos y el resumen de las cards — una sola regla,
// para que la separación signifique lo mismo en todos lados.
//
// ⚠️ NO cambia ningún monto: los gastos siguen siendo los mismos, con la misma
// marca asignada. Lo único que cambia es en qué bucket se AGRUPAN.
// ============================================================================

/** Valor del parámetro `?marca=` que abre el bucket de Multifashion. */
export const MULTIFASHION_BUCKET = "multifashion";

/** Etiqueta visible (card, breadcrumb, hoja del Excel, carpeta del ZIP). */
export const MULTIFASHION_LABEL = "Multifashion";

/**
 * Códigos del directorio (`clientes_master.codigo`) que son Multifashion.
 *
 * El código es la identidad ESTABLE: el texto libre de `mk_proyectos.tienda`
 * lo escribe una persona y en la base ya conviven "Multifashion" (D-108) y
 * "Multifashion Holdings" (sin código). Si mañana Multifashion abre otra
 * sucursal con su propio D-XXX, se agrega acá y todo el módulo la separa igual.
 */
export const MULTIFASHION_CODIGOS: readonly string[] = ["D-108"];

/**
 * Respaldo por texto para los proyectos SIN código de directorio: sin esto,
 * "Multifashion Holdings" (tienda_codigo = null) quedaría dentro del grupo y la
 * separación tendría un agujero. Tolera "Multi Fashion", "multifashion",
 * "Multi-Fashion".
 */
const RE_MULTIFASHION = /multi[\s._-]*fashion/i;

/** ¿Este proyecto/cliente es Multifashion? */
export function esMultifashion(x: {
  tienda_codigo?: string | null;
  tienda?: string | null;
  nombre?: string | null;
}): boolean {
  const codigo = (x.tienda_codigo ?? "").trim().toUpperCase();
  if (codigo && MULTIFASHION_CODIGOS.some((c) => c.toUpperCase() === codigo)) {
    return true;
  }
  // El nombre del proyecto NO se mira: es el tipo de trabajo ("Remodelacion"),
  // no el cliente. Mirarlo sólo agregaría falsos positivos.
  return RE_MULTIFASHION.test(x.tienda ?? "");
}
