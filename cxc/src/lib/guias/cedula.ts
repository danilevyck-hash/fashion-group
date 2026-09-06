// ─────────────────────────────────────────────────────────────────────────────
// LA CÉDULA, CON GUIONES — SOLO AL MOSTRARLA (5-sep-2026).
//
// Daniel: la cédula del que recibe sale `89822270` y en el resto del mundo una
// cédula panameña se escribe `8-982-2270`.
//
// 🔴 ESTO NO TOCA LO GUARDADO. Una guía ya firmada no se reescribe: `cedula` en
// la base se queda letra por letra como la tecleó bodega, y el formato se aplica
// AL LEER. Por eso vive acá, en un módulo puro, y no en el formulario ni en el
// PUT.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🩸 POR QUÉ NO HAY UNA REGLA GENERAL, Y CÓMO SE SACÓ LA QUE HAY.
//
// Una cédula panameña es `provincia-tomo-folio` y **ninguno de los tres tiene
// largo fijo**: partir una cadena de dígitos pelados es adivinar. La prueba está
// en producción misma — `810102403` es `8-1010-2403` (tomo de CUATRO), y con la
// regla ingenua «provincia, 3, el resto» habría salido `8-101-02403`, que es
// otra cédula.
//
// Así que la regla no se inventó: se MIDIÓ. Las 156 guías vivas con cédula
// (5-sep-2026) traen 14 casos donde la MISMA persona quedó escrita de las dos
// formas — con guiones y pelada — y eso da la respuesta sin suponer nada:
//
//   1-727-44    ↔ 172744     (6)  → 1 · 3 · 2
//   8-918-246   ↔ 8918246    (7)  → 1 · 3 · 3
//   9-701-101   ↔ 9701101    (7)  → 1 · 3 · 3
//   3-746-1142  ↔ 37461142   (8)  → 1 · 3 · 4
//   4-781-1121  ↔ 47811121   (8)  → 1 · 3 · 4
//   8-992-1212  ↔ 89921212   (8)  → 1 · 3 · 4
//   9-764-2287  ↔ 97642287   (8)  → 1 · 3 · 4
//   8-879-1944  ↔ 88791944   (8)  → 1 · 3 · 4
//   8-934-2485  ↔ 89342485   (8)  → 1 · 3 · 4
//   4-803-1102  ↔ 48031102   (8)  → 1 · 3 · 4
//   8-880-528   ↔ 8 880 528  (7)  → 1 · 3 · 3
//   8-918-246   ↔ 8918 2 46  (7)  → 1 · 3 · 3
//   8-1010-2403 ↔ 810102403  (9)  → 1 · 4 · 4
//   8-1025-1353 ↔ 810251353  (9)  → 1 · 4 · 4
//
// Las 14 se explican con UNA frase: **el tomo son 3 dígitos, salvo que eso deje
// un folio de más de 4 — ahí son 4.** Con 10 dígitos ninguna repartición deja
// tomo y folio de 4 o menos, y ahí NO se toca (`9200240095` se muestra igual).
//
// 🔑 LO QUE NO PARECE UNA CÉDULA SE MUESTRA TAL CUAL, sin inventar guiones:
// `Co272797`, `Bx4289`, `C02562509` (pasaportes), `G`, `S`, `97642287...`,
// `8-930` (una cédula a medias: dos partes, no tres) y `8-9302142` (mal
// tecleada). Re-partir un `8-9302142` para que quede `8-930-2142` sería el mismo
// invento que la regla ingenua, sobre un dato que respalda quién recibió la
// mercancía.
//
// ⚠️ ALCANCE: solo se MUESTRA. El juego frecuente del despacho
// (`DespachoForm`) sigue ofreciendo la cédula CRUDA, porque ese texto se copia
// dentro del campo y se guarda — mostrar una cosa y escribir otra sería peor
// que no formatear.
// ─────────────────────────────────────────────────────────────────────────────

/** El tomo típico. La excepción medida es 4, y solo cuando el folio no cabe. */
const TOMO = 3;
/** Ni el tomo ni el folio pasan de 4 dígitos en ninguna cédula de producción. */
const MAX_PARTE = 4;
/** El folio más corto medido son DOS dígitos (`1-727-44`). Con uno solo, la
 *  cadena es una cédula a medias (`88246`) y se muestra tal cual. */
const MIN_FOLIO = 2;

/** Ya viene partida en tres: `8-982-2270`, `E-8-73291`, `9- 701-101`. */
const YA_PARTIDA = /^([0-9]{1,2}|[A-Za-z]{1,2})\s*-\s*([0-9]{1,4})\s*-\s*([0-9]{1,6})$/;
/** La misma forma escrita con puntos: `8.1277.738`. */
const CON_PUNTOS = /^([0-9]{1,2})\.([0-9]{1,4})\.([0-9]{1,6})$/;

/**
 * Cómo se ESCRIBE una cédula en pantalla, en el papel y en el PDF.
 *
 * Devuelve el valor tal cual —ni vacío ni un guion de relleno— en todo lo que no
 * se reconoce como cédula. Nunca inventa dígitos ni los reordena: lo único que
 * hace es poner los guiones donde la medición dice que van.
 */
export function cedulaParaMostrar(valor: string | null | undefined): string {
  const original = String(valor ?? "").trim();
  if (!original) return "";

  const partida = YA_PARTIDA.exec(original) ?? CON_PUNTOS.exec(original);
  if (partida) return `${partida[1]}-${partida[2]}-${partida[3]}`;

  // `8 880 528` y `8918 2 46` son la misma cadena pelada con espacios de más.
  const pelada = original.replace(/\s+/g, "");
  if (!/^[0-9]+$/.test(pelada)) return original;

  for (let tomo = TOMO; tomo <= MAX_PARTE; tomo++) {
    const folio = pelada.length - 1 - tomo;
    if (folio >= MIN_FOLIO && folio <= MAX_PARTE) {
      return `${pelada.slice(0, 1)}-${pelada.slice(1, 1 + tomo)}-${pelada.slice(1 + tomo)}`;
    }
  }
  return original;
}
