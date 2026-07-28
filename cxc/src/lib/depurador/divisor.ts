/* ─────────────────────────────────────────────────────────────────────────────
 * Rango válido del DIVISOR de las fórmulas de precio del Depurador.
 *
 * El precio se calcula `TECHO(Costo CIF ÷ divisor) + extra`. O sea: el divisor
 * NO es un porcentaje, es la FRACCIÓN del precio que representa el costo.
 * Para 30% de margen se escribe **0.70**, no 70 ni 30.
 *
 * 🩸 POR QUÉ EXISTE ESTE MÓDULO (27-jul-2026). En `marca_formulas`, la marca
 * "TH Tommy Jeans" tenía `divisor = 70` desde el 29-jun (debía ser 0.70). El
 * precio salía **100 veces más barato**: un costo CIF de $42 daba
 * TECHO(42 ÷ 70) + 3 = **$4** en vez de TECHO(42 ÷ 0.70) + 3 = **$63**.
 * La validación de las 4 rutas de fórmulas solo pedía `divisor >= 0`, así que
 * un 70 entraba igual que un 0.70 y nadie se enteraba hasta ver el Excel.
 * Daniel, textual: *"divisor deberia de ser 0.7, y si puedes obligar a que ese
 * error no vuelva a pasar, no existe q sea mas de 1.0"*.
 *
 * EL RANGO, y por qué cada borde está donde está:
 *
 *  · **0 = SIN FÓRMULA, y sigue siendo válido.** Es el `default` de la columna
 *    y el centinela que usa `calcPrecio()` (`if (!f.divisor) return null`) para
 *    dejar el precio vacío y que la secretaria lo ponga a mano. Hoy hay filas
 *    reales apoyadas en eso: 3 marcas sin fórmula y 10 excepciones que van por
 *    `precio_fijo` guardan `divisor = 0`. Rechazar el 0 rompería guardarlas.
 *    Nunca se divide entre 0 — el centinela corta antes.
 *
 *  · **Techo 1.00 inclusive** — lo pidió Daniel. Un divisor de 1 es vender al
 *    costo (0% de margen): raro, pero posible y no destructivo. Arriba de 1 el
 *    precio queda POR DEBAJO del costo, que es la definición de un error de
 *    tipeo, no de una decisión de negocio.
 *
 *  · **Piso 0.10** — un divisor chiquito es igual de destructivo que uno grande,
 *    solo que al revés: 0.07 en vez de 0.7 (un dígito de más) daría el precio
 *    **10 veces más caro**. 0.10 = precio 10× el costo, y el margen más agresivo
 *    que el negocio usó alguna vez es 0.63 (CK Legwear) — o sea que el piso deja
 *    6× de aire sobre lo real y no bloquea ninguna decisión concebible. Mismo
 *    criterio que el guard de costo diario: holgado a propósito, porque un valor
 *    GRANDE no es un valor IMPOSIBLE.
 *
 * Módulo PURO: sin base, sin red. La misma función la usan las 4 rutas que
 * escriben fórmulas (`formulas`, `rubro-formulas`, `tienda-formulas`,
 * `tienda-rubro-formulas`), y el CHECK de la base
 * (`20260727190000_divisor_rango.sql`) repite el mismo rango como último freno.
 * El código funciona con o sin ese CHECK aplicado.
 * ────────────────────────────────────────────────────────────────────────── */

/** Valor centinela: "esta marca/rubro no lleva fórmula, el precio va a mano". */
export const DIVISOR_SIN_FORMULA = 0;

/** Piso de un divisor con fórmula. Debajo de esto el precio sale 10× el costo. */
export const DIVISOR_MIN = 0.1;

/** Techo de un divisor. Arriba de 1 el precio queda por debajo del costo. */
export const DIVISOR_MAX = 1;

export type ResultadoDivisor =
  | { ok: true; divisor: number }
  | { ok: false; error: string };

/** Cómo se escribe un divisor, dicho en una línea. Se repite en cada error
 *  a propósito: es la parte que el usuario necesita para corregirlo. */
const COMO_SE_ESCRIBE =
  "Se escribe como fracción: 0.70 para 30% de margen, 0.75 para 25%. " +
  "Déjalo en 0 si esta marca no lleva fórmula (el precio se pone a mano).";

/**
 * Valida el divisor de una fórmula de precio.
 *
 * Acepta: 0 (sin fórmula) o cualquier valor entre 0.10 y 1.00 inclusive.
 * Devuelve un mensaje en español simple, listo para mostrarle al usuario.
 */
export function validarDivisor(valor: unknown): ResultadoDivisor {
  // El guard hace la conversión ÉL MISMO, a propósito. Si el llamador hiciera
  // `Number(valor)` antes, `null`, `""` y `[]` llegarían convertidos en 0 — o
  // sea, se leerían como "sin fórmula" y BORRARÍAN una fórmula buena en
  // silencio. Acá un cuerpo mal armado se rechaza en vez de adivinarse.
  const esNumero = typeof valor === "number";
  const esNumeroEnTexto = typeof valor === "string" && valor.trim() !== "";
  const divisor = esNumero || esNumeroEnTexto ? Number(valor) : NaN;

  if (!Number.isFinite(divisor)) {
    return { ok: false, error: `El divisor tiene que ser un número. ${COMO_SE_ESCRIBE}` };
  }

  if (divisor < 0) {
    return { ok: false, error: `El divisor no puede ser negativo. ${COMO_SE_ESCRIBE}` };
  }

  // 0 = sin fórmula. Es válido y es el default de la columna.
  if (divisor === DIVISOR_SIN_FORMULA) return { ok: true, divisor };

  if (divisor > DIVISOR_MAX) {
    return {
      ok: false,
      error:
        `El divisor no puede ser mayor a ${DIVISOR_MAX.toFixed(2)}: con ${divisor} el precio ` +
        `saldría por debajo del costo. ${COMO_SE_ESCRIBE}`,
    };
  }

  if (divisor < DIVISOR_MIN) {
    return {
      ok: false,
      error:
        `El divisor no puede ser menor a ${DIVISOR_MIN.toFixed(2)}: con ${divisor} el precio ` +
        `saldría ${Math.round(1 / divisor)} veces el costo. ${COMO_SE_ESCRIBE}`,
    };
  }

  return { ok: true, divisor };
}
