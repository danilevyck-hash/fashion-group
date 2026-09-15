/* ─────────────────────────────────────────────────────────────────────────────
 * EL FLETE DE REEBOK — el número que convierte el Costo FOB en Costo CIF.
 *
 * Daniel, textual (7 y 8-sep-2026):
 *   «quiero ponerle opcion de 1.1 y 1.15»
 *   «Costo CIF seria 1.1 o 1.15 (default 1.1)»
 *   «porque tengo que pagar el flete que es 1.1 siempre es tommy y 1.1 y 1.15
 *    en reebok»
 *   «la 1 si pero 1.1 por default (que pueda cambiar el default en
 *    configuracion de reebok)»
 *
 * 🔴 ESTO MUEVE PLATA. El «Costo CIF *» es el costo con el que cada artículo
 * entra a Switch, y de él sale el precio de venta (`TECHO(CIF ÷ divisor)`). Un
 * flete equivocado no se ve en la pantalla: se ve meses después, en el margen.
 *
 * 🔴 SON DOS VALORES, NO UN CAMPO LIBRE. Daniel nombró dos y nada más. Un campo
 * libre acepta `11` donde va `1.1` y manda a Switch costos DIEZ VECES mal — que
 * es exactamente el defecto del divisor (`divisor.ts`: «TH Tommy Jeans» con 70
 * en vez de 0.70 durante un mes, precios 100× más baratos). Con dos botones ese
 * error no se puede teclear.
 *
 * ⚠️ TOMMY ES SIEMPRE 1.10 Y NO LLEVA ESTA OPCIÓN. Daniel: «el flete que es 1.1
 * siempre es tommy». Tommy (y Calvin, y KL) no pasan por acá: van por el
 * Depurador CK/TH (`logic.ts`, `config.factor || 1.1`), que es otro camino y
 * otro archivo. No se le agregó ni se le debe agregar la opción; hay candado
 * (`reebok-flete.test.ts`) que exige que `logic.ts` siga sin conocer el 1.15.
 *
 * ⚠️ EL FLETE APLICA A LAS DOS SALIDAS DE REEBOK, y es a propósito: es el flete
 * del MISMO embarque. Si el CIF de la plantilla Switch sube a 1.15 y el costo
 * del pedido para cliente se queda en 1.10, el Precio A/B saldría calculado
 * sobre un flete que no se está pagando — o sea, vendiendo más barato de lo que
 * se cree, en silencio.
 *
 * 🔑 CON 1.10 NADA CAMBIA. Es el default, es lo que el código hacía escrito a
 * mano, y es el control de todo el cambio (`scripts/_medir-flete-reebok.ts`).
 *
 * Módulo PURO: sin base, sin red, sin DOM. Lo leen la pantalla de Reebok, los
 * dos generadores de Excel y la ruta que guarda el default.
 * ────────────────────────────────────────────────────────────────────────── */

/** Las DOS opciones de flete de Reebok, en orden. No hay una tercera. */
export const FLETE_OPCIONES = [1.1, 1.15] as const;

export type Flete = (typeof FLETE_OPCIONES)[number];

/** El que viene puesto mientras nadie cambie el default. Es el de siempre. */
export const FLETE_DEFAULT: Flete = 1.1;

/** Clave del default compartido en `app_settings` (una fila, valor numérico). */
export const CLAVE_FLETE_DEFAULT = "reebok_flete_default";

/** true solo para 1.10 y 1.15. Lo usa la ruta que guarda el default. */
export function esFleteValido(v: unknown): v is Flete {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
  return FLETE_OPCIONES.some((o) => o === n);
}

/**
 * Deja SIEMPRE un flete usable: 1.10 o 1.15.
 *
 * Cualquier otra cosa —vacío, `undefined`, un `11` de un tecleo, lo que
 * devuelva una lectura rota de la base— cae al default. Falla ABIERTA: sin
 * dato, el Excel sale exactamente como salía antes de este cambio.
 */
export function normalizarFlete(v: unknown): Flete {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
  return (FLETE_OPCIONES.find((o) => o === n) ?? FLETE_DEFAULT) as Flete;
}

/** Cómo se escribe en pantalla: «1.10» / «1.15» (dos decimales, siempre). */
export function etiquetaFlete(v: unknown): string {
  return normalizarFlete(v).toFixed(2);
}
