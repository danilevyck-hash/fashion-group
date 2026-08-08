// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SWITCH LLAMA "MARCA" **NO** SON MARCAS.
//
// El campo `marca` del catálogo de american_classic trae MARCA + DEPARTAMENTO
// pegados: `TH MENSWEAR`, `TH FOOTWEAR`, `CK JEANS`, `KL ACCESSORIES`. Por eso
// hay 32 valores distintos con ventas. **Marcas de verdad hay CINCO.**
//
// Medido contra producción el 8-ago-2026 (ventana de 12 meses 2025-09-01 →
// 2026-08-08, notas de crédito ya restadas, total $690.034,75):
//
//   | Marca            | Venta       |     % | Margen |
//   |------------------|------------:|------:|-------:|
//   | Tommy Hilfiger   | $447.830,67 | 64,9% |  37,8% |
//   | Calvin Klein     | $160.286,09 | 23,2% |  32,4% |
//   | Karl Lagerfeld   |  $63.296,14 |  9,2% |  23,4% |
//   | Reebok           |  $15.200,40 |  2,2% |  18,2% |
//   | Joybees          |   $2.590,80 |  0,4% |  25,3% |
//   | Otros            |     $830,65 |  0,1% |  58,4% |
//
// ⚠️ Ese es el hallazgo que el filtro existe para dejar VISIBLE: **Karl Lagerfeld
// y Reebok venden $78.496 al año con márgenes de 23,4% y 18,2% contra el 37,8%
// de Tommy.** Son los números de control de este módulo: si una agrupación no los
// reproduce, la agrupación está mal.
//
// ── POR QUÉ UN MAPA EXPLÍCITO Y NO UNA HEURÍSTICA DE TEXTO ──────────────────
//
// La tentación es "si empieza con TH es Tommy". Es exactamente lo que NO se hace
// acá, por dos razones:
//
//  1. **`startsWith` es un colador.** Un departamento nuevo llamado `THX SPORT`
//     empieza con "TH" y NO es Tommy. Acá se compara la PRIMERA PALABRA COMPLETA
//     contra un mapa cerrado: `THX` no está en el mapa → cae en "Otros".
//
//  2. **Lo desconocido no se adivina.** Un nombre que aparezca mañana en Switch
//     cae en "Otros" y la pantalla sigue funcionando y sumando 100%. Inventarle
//     una marca a un texto que nadie definió es fabricar estructura de negocio —
//     el mismo error que este repo ya se prohibió con las descripciones de
//     artículo (ver productos-ranking.ts, punto 3).
//
// ── LOS DEPARTAMENTOS MAL ESCRITOS SE JUNTAN AL MOSTRAR (aprobado por Daniel) ─
//
// Switch tiene el MISMO departamento partido en dos por errores de tipeo. Medido:
//
//   · `TH ACCESSORIES` ($57.669,44) + `TH ACCESORIES` ($2.923,55) — falta una S
//   · `TH MENSWEAR`    ($162.485,14) + `TH MEN`       ($397,59)
//   · `TH OTHER`       ($9.111,22)   + `TH OTHERS`    ($175,76)
//
// La lista es EXPLÍCITA y corta a propósito. Un algoritmo de parecido (distancia
// de edición, prefijo común) también juntaría `TH MEN` con `TH MENSWEAR` — pero
// juntaría igual dos departamentos legítimamente distintos, y ahí el error es
// invisible: dos renglones que se fusionan no dejan rastro. Corregirlo EN Switch
// es tarea de Daniel; esto solo evita que el informe muestre la misma cosa dos
// veces mientras tanto.
// ─────────────────────────────────────────────────────────────────────────────

/** Las cinco marcas reales, más el cajón de lo que no se reconoce. */
export type GrupoMarcaId = "TH" | "CK" | "KL" | "RBK" | "JOYBEES" | "OTROS";

export interface GrupoMarca {
  id: GrupoMarcaId;
  /** Cómo se muestra en pantalla. */
  nombre: string;
}

/** El cajón de lo no reconocido. Nunca se infiere una marca a partir de un texto
 *  desconocido: si no está en el mapa, es esto. */
export const GRUPO_OTROS: GrupoMarca = { id: "OTROS", nombre: "Otros" };

/**
 * MAPA EXPLÍCITO prefijo → marca. `prefijo` se compara contra la PRIMERA PALABRA
 * completa del departamento, en mayúsculas y por igualdad exacta.
 *
 * Agregar una marca es agregar una línea acá. No hay ningún otro lugar donde el
 * nombre de una marca se decida.
 */
export const MARCAS_POR_PREFIJO: readonly (GrupoMarca & { prefijo: string })[] = [
  { prefijo: "TH", id: "TH", nombre: "Tommy Hilfiger" },
  { prefijo: "CK", id: "CK", nombre: "Calvin Klein" },
  { prefijo: "KL", id: "KL", nombre: "Karl Lagerfeld" },
  { prefijo: "RBK", id: "RBK", nombre: "Reebok" },
  { prefijo: "JOYBEES", id: "JOYBEES", nombre: "Joybees" },
];

/** Orden fijo de presentación (por tamaño medido). El orden REAL de la pantalla
 *  lo decide la venta del período; esto solo desempata y hace determinista el
 *  recorrido del servidor. */
export const ORDEN_GRUPOS: readonly GrupoMarcaId[] = [
  "TH", "CK", "KL", "RBK", "JOYBEES", "OTROS",
];

/**
 * Departamentos que Switch tiene escritos de dos formas. `de` → `a`, LISTA
 * EXPLÍCITA (ver el encabezado: nada de parecido de textos).
 */
export const EQUIVALENCIAS_DEPARTAMENTO: readonly { de: string; a: string }[] = [
  { de: "TH ACCESORIES", a: "TH ACCESSORIES" },
  { de: "TH MEN", a: "TH MENSWEAR" },
  { de: "TH OTHERS", a: "TH OTHER" },
];

const EQUIV = new Map(EQUIVALENCIAS_DEPARTAMENTO.map(e => [e.de, e.a]));
const POR_PREFIJO = new Map(MARCAS_POR_PREFIJO.map(m => [m.prefijo, m]));

/** Recorta las puntas y colapsa las corridas de espacios — el mismo criterio que
 *  `textoAgrupable` de productos-ranking.ts: dos textos que el navegador dibuja
 *  idénticos no pueden ser dos renglones distintos del informe. */
function limpiar(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

/**
 * El nombre con el que se MUESTRA y se AGRUPA un departamento: el mismo texto
 * que manda Switch, salvo que esté en la lista de equivalencias.
 *
 * La comparación es sobre el texto en MAYÚSCULAS (Switch los manda así, pero un
 * `Th Men` que se colara se leería como otro departamento y volvería a partir la
 * fila en dos). Lo que se devuelve es el nombre CANÓNICO de la lista, no el
 * pedido: así las dos escrituras terminan en la misma clave.
 */
export function departamentoCanonico(nombre: string | null | undefined): string {
  const limpio = limpiar(nombre);
  if (!limpio) return "";
  return EQUIV.get(limpio.toUpperCase()) ?? limpio;
}

/**
 * A qué MARCA pertenece un departamento de Switch.
 *
 * Regla completa, y no hay otra: primera palabra del nombre canónico, en
 * mayúsculas, buscada por IGUALDAD EXACTA en `MARCAS_POR_PREFIJO`. Lo que no
 * está en el mapa —incluido el vacío— es `OTROS`.
 */
export function grupoDeDepartamento(nombre: string | null | undefined): GrupoMarca {
  const canon = departamentoCanonico(nombre);
  if (!canon) return GRUPO_OTROS;
  const primera = canon.toUpperCase().split(" ")[0] ?? "";
  const m = POR_PREFIJO.get(primera);
  return m ? { id: m.id, nombre: m.nombre } : GRUPO_OTROS;
}

/** Nombre de pantalla de un grupo. */
export function nombreDeGrupo(id: GrupoMarcaId): string {
  if (id === GRUPO_OTROS.id) return GRUPO_OTROS.nombre;
  const m = MARCAS_POR_PREFIJO.find(x => x.id === id);
  return m ? m.nombre : GRUPO_OTROS.nombre;
}
