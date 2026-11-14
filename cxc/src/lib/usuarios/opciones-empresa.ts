import { ALL_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";

/**
 * Revisión 110, n.º 102 · Las opciones de «Empresa» en Nuevo/Editar usuario: en
 * blanco (todas) y las ocho por su NOMBRE; el valor sigue siendo la clave de
 * siempre. Una clave guardada que no esté en la lista se conserva como opción,
 * para que abrir y guardar un usuario nunca le borre la empresa.
 */
export function opcionesDeEmpresa(actual: string): Array<[string, string]> {
  const opciones: Array<[string, string]> = [["", "Selecciona una empresa"]];
  for (const k of ALL_EMPRESA_KEYS) opciones.push([k, mapEmpresaName(k)]);
  if (actual && !(ALL_EMPRESA_KEYS as readonly string[]).includes(actual)) opciones.push([actual, actual]);
  return opciones;
}
