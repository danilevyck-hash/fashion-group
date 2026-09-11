// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LAS FACTURAS DE UN RECLAMO SON UNA LISTA, NO UN RENGLÓN DE TEXTO.
//
// 🩸 `reclamos.nro_factura` es texto libre y así se tecleaba: dos reclamos
// vivos traían dos facturas PEGADAS sin separador («30000136603000013658» son
// 3000013660 y 3000013658) y así salían en el correo al proveedor. La
// migración 20261111120000 corrige esos dos por id explícito.
//
// La columna se conserva como texto (es la más simple: la leen el Excel, el
// PDF, el correo y la búsqueda). Lo que cambia es que hay UNA función que la
// parte —`facturasDe`— y UNA que la arma —`facturasATexto`—, y todas las
// superficies pasan por ellas. En pantalla, en el correo, en el Excel y en el
// PDF las facturas van separadas por «·».
// ─────────────────────────────────────────────────────────────────────────────

/** Separador con el que se GUARDA la lista en `nro_factura`. */
export const SEPARADOR_GUARDADO = " - ";
/** Separador con el que se MUESTRA (pantalla, correo, Excel, PDF). */
export const SEPARADOR_EN_PANTALLA = " · ";

/**
 * Parte el texto de `nro_factura` en facturas. Separan: coma, «·», «/»,
 * espacios, y el guion cuando está entre espacios o entre dos números largos
 * (seis dígitos o más, la forma de las facturas de estos proveedores). Un
 * guion adentro de un número corto («F-1000») NO separa: es parte del número.
 * Repetidas se quedan una sola vez, en el orden en que aparecen.
 */
export function facturasDe(nro: string | null | undefined): string[] {
  const texto = String(nro ?? "")
    .replace(/(\d{6,})-(?=\d{6,})/g, "$1 ")
    .replace(/[,·/]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/(^|\s)-(\s|$)/g, " ");
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const parte of texto.split(/\s+/)) {
    // Un guion colgando de un lado («-3000013232») no es parte del número.
    const f = parte.trim().replace(/^-+|-+$/g, "");
    if (!f) continue;
    if (vistas.has(f)) continue;
    vistas.add(f);
    salida.push(f);
  }
  return salida;
}

/** Arma el texto que se guarda en `nro_factura` a partir de la lista. */
export function facturasATexto(lista: readonly string[]): string {
  return facturasDe(lista.join(SEPARADOR_GUARDADO)).join(SEPARADOR_GUARDADO);
}

/** Las facturas separadas por «·», que es como se leen. */
export function facturasEnPantalla(nro: string | null | undefined): string {
  return facturasDe(nro).join(SEPARADOR_EN_PANTALLA);
}
