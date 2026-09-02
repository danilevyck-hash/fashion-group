/**
 * Lo que TODO CSV contable de Switch comparte: montos, textos y códigos de cuenta.
 *
 * 🩸 POR QUÉ VIVE ACÁ Y NO EN `lib/mayor/`. Estos tres helpers nunca fueron "del
 * mayor": son del formato en que Switch exporta contabilidad, y estaban en la
 * carpeta del mayor solo porque el mayor llegó primero. Cuando el mayor se
 * retiró (13-ago-2026), **Egresos Varios seguía dependiendo de ellos** —
 * `egresos/parser.ts` y `egresos/leer.ts`— así que borrar esa carpeta sin
 * mudarlos habría roto la única fuente de gasto que queda.
 *
 * ⚠️ NO SE REESCRIBIERON: son EXACTAMENTE los mismos cuerpos, movidos. Volver a
 * escribir `montoACentavos` habría sido estrenar una segunda forma de leer un
 * monto — y su modo de fallo es un gasto perdido en silencio.
 */

/** Colapsa espacios repetidos y recorta. `" ASIENTO  VENTA "` → `"ASIENTO VENTA"`. */
export function normalizarTexto(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * EL VALOR de un código de cuenta de Switch: 5 tramos numéricos separados por
 * puntos. Se declara UNA vez y de acá salen las dos formas de mirarlo — el
 * código pelado (`CUENTA_RE`) y la celda con el nombre pegado
 * (`codigoDeCuenta`). Aflojar esto aflojaría las dos a la vez, que es
 * justamente lo que no puede pasar.
 */
const CUENTA_TRAMOS = String.raw`\d+(?:\.\d+){4}`;

/**
 * Un código de cuenta válido de Switch: 5 tramos numéricos y NADA más.
 *
 * 🔴 NO SE AFLOJA. `esGasto` (`contable/cuentas.ts`) es `startsWith("6.")`: un
 * código leído de más o de menos reclasifica plata entre gasto y no-gasto sin
 * que nada se queje. Los 5 tramos exactos se quedan.
 */
export const CUENTA_RE = new RegExp(`^${CUENTA_TRAMOS}$`);

/**
 * La CELDA tal como puede venir en el CSV: el código al principio y, detrás,
 * CUALQUIER COSA.
 *
 *   "6.03.98.00.00"                                → 6.03.98.00.00
 *   "6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"  → 6.03.98.00.00
 *   "6.03.98.00.00-GASTO"                          → 6.03.98.00.00
 *   "6.03.98.00.00,GASTO"                          → 6.03.98.00.00
 *
 * 🔴 EL SEPARADOR NO SE ASUME, Y ES A PROPÓSITO. El formato nuevo se dedujo del
 * mensaje de error de las corridas fallidas —donde el código y el nombre llegan
 * concatenados literalmente— y NO del archivo crudo, que no se llegó a ver (ver
 * `codigoDeCuenta`). Calibrar contra un ` - ` que nadie miró sería estrenar el
 * mismo defecto que se está arreglando, un carácter más allá. Así que se acepta
 * el código seguido de lo que sea; lo que se valida entero es el CÓDIGO.
 *
 * `(?![\d.])` es lo único que no se afloja: obliga a que lo que sigue NO pueda
 * ser parte del propio código. `"6.03.98.00.00.00"` (seis tramos) sigue siendo
 * un error en vez de leerse recortado a cinco — recortarlo cambiaría de cuenta
 * en silencio, y `esGasto` decide gasto/no-gasto con el primer tramo.
 */
const CELDA_CUENTA_RE = new RegExp(`^(${CUENTA_TRAMOS})(?![\\d.])`);

/**
 * El código de cuenta de una celda del CSV, o `null` si no lo hay.
 *
 * 🩸 POR QUÉ ACEPTA UN ENVOLTORIO ANCHO. El 1-sep-2026 Switch estrenó el nombre
 * de la cuenta pegado al código (`"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"`)
 * y el sync de Egresos Varios murió el mismo día en las CINCO empresas que
 * tienen gastos: cero de 378 renglones parseaban en Vistana, 135 en Fashion
 * Wear, 123 en Fashion Shoes, 47 en Active Shoes, 26 en Active Wear. Es la
 * segunda ola del mismo cambio de motor de reportes que rompió la cartera de
 * Boston el 19-ago.
 *
 * ⚠️ **EL ARCHIVO CRUDO NO SE VIO, Y HAY QUE SABERLO.** El formato nuevo se
 * dedujo de `switch_sync_log.error_message` de las corridas del 1 y 2 de
 * septiembre, que traen la celda entera verbatim en cinco empresas
 * (`"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"` en Vistana,
 * `"6.03.13.00.00 - REPARACION Y MANT. DE VEHICULO"` en Fashion Wear,
 * `"6.02.01.00.00 - SERVICIOS PROFESIONALES"` en Fashion Shoes y Active Wear,
 * `"6.01.02.00.00 - COMISIONES"` en Active Shoes). Bajar el reporte real exige
 * abrir sesión web con `changesession="SI"`, que expulsa del panel a quien esté
 * adentro, y no había ventana en la madrugada de Panamá. Por eso el envoltorio
 * se acepta ancho en vez de calibrarse a un ` - ` que nadie miró: lo que está
 * MEDIDO es que el código va al principio y que detrás viene el nombre; lo que
 * NO está medido es con qué exactamente los separa Switch.
 *
 * La lección ya estaba escrita EN ESTE MISMO REPO, doce líneas más arriba de
 * donde falló: `fechaEgresoAIso` acepta la fecha en DOS formatos «para que un
 * cambio de formato de Switch no vuelva a vaciar el módulo en silencio»,
 * después de que `sync-proveedores` devolviera `null` 821 de 821 veces. Se
 * aplicó a la fecha y no a la cuenta.
 *
 * 🔴 EL NOMBRE NO SE TOMA DE ACÁ, aunque venga servido. El nombre autoritativo
 * vive en `cuentas_contables.nombre_switch` (`sync-cuentas-contables.ts`, misma
 * sesión, al día). Dos fuentes para el mismo nombre es la próxima
 * discrepancia — y la que quedara vieja no avisaría.
 */
export function codigoDeCuenta(celda: string): string | null {
  const m = CELDA_CUENTA_RE.exec(normalizarTexto(celda));
  return m ? m[1] : null;
}

/**
 * Convierte un monto del CSV a CENTAVOS enteros.
 *
 * Acepta `"1695.86"`, `"1,695.86"` (miles con coma), `"(69.30)"` (paréntesis =
 * negativo, convención contable) y vacío = 0. Devuelve `null` si no lo entiende
 * — y entonces la línea se REPORTA como error en vez de contarse como 0, que
 * sería un gasto perdido en silencio.
 */
export function montoACentavos(raw: string): number | null {
  let s = normalizarTexto(raw);
  if (s === "" || s === "-") return 0;

  let negativo = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) {
    negativo = true;
    s = paren[1].trim();
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$/, "").trim();

  // Miles con coma y decimales con punto: 1,695.86 / 12,345,678.90
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  // Una sola coma decimal (por si alguna empresa exporta en formato europeo).
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  // Cualquier otra coma es ambigua → no adivinar.
  else if (s.includes(",")) return null;

  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  // A centavos SIN pasar por float: parte entera y decimales por separado.
  const [ent, dec = ""] = s.split(".");
  const centStr = (dec + "00").slice(0, 2);
  const cent = Number(ent) * 100 + Number(centStr);
  if (!Number.isSafeInteger(cent)) return null;
  return negativo ? -cent : cent;
}
