/* ─────────────────────────────────────────────────────────────────────────────
 * EL DESCUENTO DEL PROVEEDOR — Reebok, camino de la PREFORMA (18-sep-2026).
 *
 * Daniel, textual:
 *   «se debería de poner el descuento yo después de subir el archivo, pongo el
 *    % en número»
 *   «como configurar así como la fórmula, pongo el % y que se auto calcule solo»
 *   «como a veces vienen muchas líneas, hacerlo como que más fácil, GLOBAL»
 *
 * 🩸 EL DEFECTO QUE CIERRA. Reebok manda DOS Excel. El de DESPACHO trae el costo
 * ya descontado (`Precio after Disc`) y se LEE tal cual desde el 17-sep-2026. La
 * PREFORMA —la confirmación de compra, con la que se cotiza semanas antes del
 * embarque— NO dice el descuento, y el sistema lo INVENTABA: `fobReebok`
 * multiplica por 0,80 el calzado y por 0,70 la ropa y los accesorios. Esos dos
 * números salen de una columna «WholesalePrice OFF» que **no aparece en ningún
 * Excel real** que Daniel haya recibido (medido: cero veces). Y los descuentos
 * de Reebok VARÍAN —20 %, 25 % y 30 % en el mismo embarque, medido sobre el
 * despacho real del 17-sep-2026—, así que la cotización salía equivocada y **en
 * silencio**: nada en pantalla decía que ese costo era una suposición.
 *
 * 🔴 ESTO MUEVE PLATA. El «Costo CIF *» es el costo con el que el artículo entra
 * a Switch, y de él sale el precio de venta (`TECHO(CIF ÷ divisor)`). Un
 * descuento equivocado no se ve en la pantalla: se ve meses después, en el
 * margen.
 *
 * 🔴 LAS TRES REGLAS, EN ESTE ORDEN, Y NO HAY UNA CUARTA:
 *   1. **El dato real GANA SIEMPRE.** Si el archivo trae el precio ya descontado
 *      («WholesalePrice OFF» en la preforma, `Precio after Disc` en el despacho),
 *      el FOB ES ese número y el porcentaje escrito NO se aplica. Por eso el
 *      camino del DESPACHO no se mueve ni un centavo con este cambio.
 *   2. **El porcentaje escrito manda sobre la suposición.** Con «25» escrito,
 *      el FOB de TODAS las líneas de la preforma es `WholesalePrice × 0,75`.
 *      UNO solo para todo el archivo: una preforma trae ~75 artículos y
 *      teclearlos uno por uno no lo hace nadie.
 *   3. **Vacío = lo de hoy, pero DICHO.** Sin porcentaje se sigue estimando
 *      0,80 / 0,70 —para no romper a nadie— y la pantalla lo dice en ámbar.
 *      El defecto de fondo no era el número: era el silencio.
 *
 * ⚠️ ES UN CAMPO LIBRE Y EL FLETE SON DOS BOTONES, a propósito. El flete tiene
 * dos valores que Daniel nombró (`flete.ts`) y un `11` tecleado donde va `1.1`
 * mandaría costos diez veces mal. El descuento no tiene lista: Reebok manda el
 * que quiera. La red contra el tecleo es otra: se acepta solo 0–95 y cualquier
 * otra cosa CAE AL ESTIMADO y se dice en pantalla — nunca se aplica un número
 * que no se entendió.
 *
 * 🔑 NO SE COPIA LA REGLA: SE LLAMA. `fobReebok` es el único lugar donde el
 * descuento se aplica, y `costoReebok` el único que decide un costo de Reebok.
 * Duplicar esta cuenta es exactamente cómo nacieron los dos costos que el
 * 14-sep-2026 hubo que volver a juntar.
 *
 * Módulo PURO: sin base, sin red, sin DOM. Lo leen `reebok.ts` (el costo) y la
 * pantalla de Reebok (el campo y el aviso).
 * ────────────────────────────────────────────────────────────────────────── */

/** El descuento que se SUPONE cuando nadie escribe nada y el archivo no lo dice.
 *  Son los 0,80 / 0,70 de siempre, escritos como el porcentaje que son. */
export const DESCUENTO_ESTIMADO_CALZADO = 20;
export const DESCUENTO_ESTIMADO_RESTO = 30;

/** Lo máximo que se acepta teclear. Un «100» dejaría el costo en cero y un
 *  número más grande lo dejaría negativo: las dos cosas son un tecleo, no un
 *  descuento. */
export const DESCUENTO_MAX = 95;

/** Dónde se recuerda lo último que se escribió (por persona, este navegador).
 *  Misma familia que la tasa, el factor y el modo de precio del Depurador. */
export const CLAVE_DESCUENTO_RECORDADO = "fg_last_depurador_descuento_reebok";

/**
 * El porcentaje utilizable, o `null` si no hay ninguno.
 *
 * `null` significa **estimar como siempre**, y ahí caen el vacío, el `undefined`,
 * el texto que no es número y todo lo que se salga de 0–95. Falla ABIERTA: sin
 * un porcentaje que se entienda, el Excel sale exactamente como salía antes de
 * este cambio.
 */
export function normalizarDescuento(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const crudo =
    typeof v === "number"
      ? String(v)
      : String(v).replace(/%/g, "").replace(/,/g, ".").trim();
  if (crudo === "") return null;
  const n = Number(crudo);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > DESCUENTO_MAX) return null;
  return n;
}

/** true solo cuando lo escrito es un porcentaje que se va a aplicar. */
export function esDescuentoValido(v: unknown): boolean {
  return normalizarDescuento(v) !== null;
}

/**
 * Lo escrito es basura (no vacío, pero tampoco un porcentaje).
 *
 * Sirve para DECIRLO en pantalla: un `150` tecleado cae al estimado, y que caiga
 * en silencio es el mismo defecto que este cambio vino a cerrar.
 */
export function descuentoNoSeEntiende(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v !== "number" && String(v).trim() === "") return false;
  return normalizarDescuento(v) === null;
}

/**
 * El multiplicador que le va al `WholesalePrice` cuando el archivo NO trae el
 * precio ya descontado.
 *
 * Con porcentaje escrito, `1 − %/100`. Sin él, el estimado de siempre: 0,80 en
 * calzado y 0,70 en ropa y accesorios.
 */
export function factorDeDescuento(pct: number | null, esCalzado: boolean): number {
  const p = pct ?? (esCalzado ? DESCUENTO_ESTIMADO_CALZADO : DESCUENTO_ESTIMADO_RESTO);
  return 1 - p / 100;
}

/** De dónde salió el costo de UN artículo. Es lo que la pantalla cuenta. */
export type OrigenDelDescuento = "archivo" | "escrito" | "estimado";

/** `archivo` si el proveedor mandó el precio ya descontado (ese gana siempre);
 *  si no, `escrito` cuando hay porcentaje y `estimado` cuando no lo hay. */
export function origenDelDescuento(
  off: number | null | undefined,
  pct: number | null,
): OrigenDelDescuento {
  if (off !== null && off !== undefined && off > 0) return "archivo";
  return pct === null ? "estimado" : "escrito";
}

/** Lo mínimo que hace falta de un artículo para contarlo. */
export interface ArticuloParaDescuento {
  /** Con qué se agrupa (el `New Article`). Repetido = la misma talla otra vez. */
  clave: string;
  /** El precio ya descontado que mandó el proveedor, si lo mandó. */
  wholesaleOff: number | null | undefined;
}

export interface ResumenDescuento {
  /** Artículos cuyo costo salió del archivo (el proveedor mandó el descuento). */
  archivo: number;
  /** Artículos a los que se les aplicó el porcentaje escrito. */
  escrito: number;
  /** Artículos con el costo SUPUESTO (0,80 / 0,70). Cero = nada se inventó. */
  estimado: number;
}

/**
 * Cuántos artículos caen en cada origen.
 *
 * ⚠️ Cuenta ARTÍCULOS, no filas: una preforma trae una fila por talla y decir
 * «229 costos estimados» donde hay 75 artículos asusta sin informar. Se agrupa
 * por `clave` y **gana la PRIMERA fila**, que es exactamente la que
 * `buildCatalogo` y `buildSwitchRows` usan para el costo del grupo.
 */
export function resumenDescuento(
  articulos: readonly ArticuloParaDescuento[],
  pct: number | null,
): ResumenDescuento {
  const vistos = new Map<string, OrigenDelDescuento>();
  for (const a of articulos) {
    if (!a.clave) continue;
    if (vistos.has(a.clave)) continue;
    vistos.set(a.clave, origenDelDescuento(a.wholesaleOff, pct));
  }
  const out: ResumenDescuento = { archivo: 0, escrito: 0, estimado: 0 };
  for (const origen of vistos.values()) out[origen]++;
  return out;
}

/** Cómo se escribe un porcentaje en pantalla: «25 %», «22.5 %». Sin ceros de más. */
export function etiquetaDescuento(pct: number): string {
  const n = Math.round(pct * 100) / 100;
  return `${String(n)} %`;
}

/** Lo que la pantalla dibuja: el tono y el texto. `null` = no hay nada que decir. */
export interface AvisoDescuento {
  /** `ambar` solo cuando hay costos SUPUESTOS: es lo único que pide una acción. */
  tono: "ambar" | "normal";
  texto: string;
}

const cuantos = (n: number): string => `${n} ${n === 1 ? "artículo" : "artículos"}`;

/**
 * Qué se le dice a Daniel debajo del campo, en una frase.
 *
 * 🔴 SIEMPRE SE DICE DE DÓNDE SALE EL COSTO. Hasta hoy la estimación pasaba en
 * silencio, que es el defecto de fondo: nadie puede corregir lo que no ve.
 * ⚠️ Y cuando el archivo trae el descuento de verdad, se dice que ESE manda —
 * el dato real le gana al porcentaje escrito, siempre.
 */
export function avisoDescuento(r: ResumenDescuento, pct: number | null): AvisoDescuento | null {
  const delArchivo =
    r.archivo > 0 ? ` ${cuantos(r.archivo)} traen el descuento en el archivo y ese manda.` : "";

  if (r.estimado > 0) {
    return {
      tono: "ambar",
      texto:
        `El costo de ${cuantos(r.estimado)} es ESTIMADO: se le descuenta ` +
        `${DESCUENTO_ESTIMADO_CALZADO} % al calzado y ${DESCUENTO_ESTIMADO_RESTO} % a la ropa y ` +
        `los accesorios, porque este archivo no dice el descuento real. Si sabes el descuento, ` +
        `escríbelo arriba en «Descuento del proveedor %» y el costo se recalcula solo.` +
        delArchivo,
    };
  }
  if (r.escrito > 0 && pct !== null) {
    return {
      tono: "normal",
      texto: `Se le descuenta ${etiquetaDescuento(pct)} a ${cuantos(r.escrito)}.` + delArchivo,
    };
  }
  if (r.archivo > 0) {
    return {
      tono: "normal",
      texto: `El costo sale del archivo: ${cuantos(r.archivo)} traen el descuento del proveedor.`,
    };
  }
  return null;
}
