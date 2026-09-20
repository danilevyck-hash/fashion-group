// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUATRO TRAMOS DE EDAD, NO TRES — y lo que está A FAVOR se ve aparte.
//
// 🩸 20-sep-2026. La pantalla de Proveedores condensaba los OCHO tramos que
// manda Switch en TRES (`lib/proveedores-aging.ts`, el vocabulario del CXC):
// todo lo de más de 120 días caía junto en «121D+». Eso escondía algo grande.
// Medido contra producción ese día:
//
//     Fashion Wear · Por pagar $1.978.200,62
//       0-90D       -$208.985,74
//       91-120D     -$166.039,56
//       121-365D   $1.048.618,45
//       +1 año     $1.304.607,47   ← el 66 % de la deuda, escondido dentro
//                                     del mismo «121D+» que la deuda de cuatro
//                                     meses
//
// 🔴 **NINGÚN NÚMERO CAMBIA: SOLO SE REPARTEN DISTINTO.** Los cuatro tramos son
// sumas de los ocho de Switch y nada más:
//
//     0-90D     = 0-30 + 31-60 + 61-90
//     91-120D   = 91-120
//     121-365D  = 121-180 + 181-270 + 271-365
//     +1 año    = Mas de 365
//
// Medido el 20-sep-2026 en las 67 filas de `switch_proveedor_estadocuenta`: la
// suma de los ocho buckets es igual a `saldo_total`, fila por fila, sin una
// sola diferencia. Por eso el total de los cuatro tramos ES el «Por pagar».
//
// 🔴 **NO SE DICE «VENCIDO».** `dias` acá es la EDAD del documento desde su
// emisión, no días de mora: en CxP no hay plazo ni fecha de vencimiento en el
// dato que manda Switch. Los tramos se nombran por su RANGO —el mismo criterio
// que el papel que lee el cliente en el CXC (`tramoRango`)—, nunca con el
// vocabulario de aging del CXC. Ver `lib/proveedores-aging.ts`, que sigue
// existiendo para la ficha de un proveedor y para nadie más.
// ─────────────────────────────────────────────────────────────────────────────

/** Los OCHO tramos que manda Switch, en su orden, tal como los escribe. */
export const BUCKETS_SWITCH = [
  "0-30",
  "31-60",
  "61-90",
  "91-120",
  "121-180",
  "181-270",
  "271-365",
  "Mas de 365",
] as const;

export type TramoKey = "t0_90" | "t91_120" | "t121_365" | "tMas365";

/** Los CUATRO de la pantalla, cada uno con los buckets de Switch que lo forman. */
export const TRAMOS: readonly {
  key: TramoKey;
  /** Como se lee en el encabezado de la columna. */
  label: string;
  buckets: readonly string[];
}[] = [
  { key: "t0_90", label: "0-90D", buckets: ["0-30", "31-60", "61-90"] },
  { key: "t91_120", label: "91-120D", buckets: ["91-120"] },
  { key: "t121_365", label: "121-365D", buckets: ["121-180", "181-270", "271-365"] },
  { key: "tMas365", label: "+1 año", buckets: ["Mas de 365"] },
] as const;

export const TRAMOS_KEYS: readonly TramoKey[] = TRAMOS.map((t) => t.key);

export type Tramos = Record<TramoKey, number>;

export function tramosCero(): Tramos {
  return { t0_90: 0, t91_120: 0, t121_365: 0, tMas365: 0 };
}

const DE_BUCKET = new Map<string, TramoKey>(
  TRAMOS.flatMap((t) => t.buckets.map((b) => [b, t.key] as [string, TramoKey])),
);

/**
 * En qué tramo cae un bucket de Switch.
 *
 * ⚠️ Lo desconocido cae en el MÁS VIEJO, que es exactamente lo que hacía
 * `agingKeyForBucket` («todo lo que no es 0-90 ni 91-120 es el tramo de
 * arriba»). No es una elección estética: es la única forma de que el total no
 * pierda un centavo si Switch algún día agrega un bucket. Los ocho de hoy están
 * enumerados y hay candado que los fija uno por uno.
 */
export function tramoDelBucket(title: string): TramoKey {
  return DE_BUCKET.get(title) ?? "tMas365";
}

export interface BucketSwitch {
  title: string;
  saldo: number | string;
}

/** Reparte los ocho buckets de Switch en los cuatro tramos de la pantalla. */
export function repartirEnTramos(
  aging: readonly BucketSwitch[] | null | undefined,
): Tramos {
  const t = tramosCero();
  for (const b of aging ?? []) t[tramoDelBucket(b.title)] += num(b.saldo);
  for (const k of TRAMOS_KEYS) t[k] = round2(t[k]);
  return t;
}

/** Suma dos juegos de tramos. Sirve para el total de la empresa y el del pie. */
export function sumarTramos(a: Tramos, b: Tramos): Tramos {
  const t = tramosCero();
  for (const k of TRAMOS_KEYS) t[k] = round2(a[k] + b[k]);
  return t;
}

/** El «Por pagar» de una fila: la suma de sus cuatro tramos. */
export function totalDeTramos(t: Tramos): number {
  return round2(TRAMOS_KEYS.reduce((s, k) => s + t[k], 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE ESTÁ A FAVOR SE VE, NO SE COMPENSA EN SILENCIO.
//
// 🩸 Fashion Wear tiene saldo a favor en CINCO de los ocho tramos con American
// Fashion Wear (medido el 20-sep-2026: 0-30, 31-60, 61-90, 91-120 y 181-270,
// −$420.201,51 en total). Ese crédito se restaba dentro del «Por pagar» y
// desaparecía de la pantalla: quedaba un número neto sin decir de qué está
// hecho.
//
// Es el mismo criterio del CXC con los clientes con saldo a favor, que la
// pantalla muestra en su bloque aparte y el papel ya no esconde
// (`lib/cxc/descargas.ts`, 20-sep-2026): **el neto se queda igual, pero se dice
// de qué está hecho**.
//
//     Le debes X · Tienes a favor Y · Por pagar Z       con Z = X − Y
// ─────────────────────────────────────────────────────────────────────────────

export interface SaldoPartido {
  /** Lo que se debe: la suma de los buckets POSITIVOS. */
  debes: number;
  /** Lo que está a favor, en POSITIVO: la suma de los buckets negativos, sin signo. */
  a_favor: number;
  /** El neto, que es el mismo de siempre: `debes − a_favor`. */
  por_pagar: number;
}

/** Parte los buckets de Switch en lo que se debe y lo que está a favor. */
export function partirSaldo(
  aging: readonly BucketSwitch[] | null | undefined,
): SaldoPartido {
  let debes = 0;
  let aFavor = 0;
  for (const b of aging ?? []) {
    const v = num(b.saldo);
    if (v > 0) debes += v;
    else aFavor += -v;
  }
  return cerrarPartido(round2(debes), round2(aFavor));
}

/** Suma dos particiones (empresa → pie del grupo) conservando la resta. */
export function sumarPartidos(a: SaldoPartido, b: SaldoPartido): SaldoPartido {
  return cerrarPartido(round2(a.debes + b.debes), round2(a.a_favor + b.a_favor));
}

export function partidoCero(): SaldoPartido {
  return { debes: 0, a_favor: 0, por_pagar: 0 };
}

/**
 * 🔴 `por_pagar` SIEMPRE se DERIVA de los otros dos. Guardarlo aparte es cómo
 * dos números de la misma fila terminan sin cuadrar.
 */
function cerrarPartido(debes: number, aFavor: number): SaldoPartido {
  return { debes, a_favor: aFavor, por_pagar: round2(debes - aFavor) };
}

function num(x: number | string | null | undefined): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
