// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — CÓMO SE ACOMODA EL DESTINO EN SU HUECO (22-sep-2026)
//
// 🔴 LA REGLA, EN EL ORDEN EN QUE DANIEL LA PIDIÓ: *«los destino largos que se
// hagan en dos filas o achicar la letra»*. PRIMERO LAS FILAS, DESPUÉS LA LETRA.
// El destino se parte en cuantas líneas quepan a su tamaño de siempre —7,5 mm
// de altura de mayúscula— y solo cuando ni así entra se le baja el tamaño, de
// a poco, hasta que entre entero.
//
// 🩸 LO QUE ESTABA MAL, medido contra producción el 22-sep-2026 sobre los 94
// destinos REALES (`guias_destino_lista` + `guias_destino_cliente` + la
// dirección escrita en `guia_items`): TRES se imprimían cortados con «…», y el
// que carga el camión no tenía cómo saber a dónde iba la caja.
//
//   | destino                                            | falta |
//   | «Calle 19 Central, al lado de la joyería Super Oro» | 23 mm |
//   | «Calle 19 central al lado de la joyeria super oro»  | 23 mm |
//   | «Albrook Pasillo del tigre fenre al costo»          | 11,5 mm |
//
// Los tres dibujaban TRES líneas de las cuatro o cinco que el texto necesita:
// salía «CALLE 19 / CENTRAL, AL / LADO DE LA…» y se perdía la joyería, que es
// justo la referencia por la que se encuentra el sitio.
//
// 🔴 SE PARTE POR ESPACIO, NUNCA A MITAD DE PALABRA. Una palabra cortada en dos
// líneas se lee mal de lejos, que es la única distancia desde la que este dato
// se usa. Si UNA sola palabra no cabe en el ancho, ahí sí se achica la letra
// —ésa es la salida—, y no se la parte.
//
// 🔴 Y NADA SE SALE DEL CUARTO DE HOJA: el piso (`hastaY`) es la raya del bulto
// menos su aire, y ninguna línea lo pasa. El corte con «…» queda de ÚLTIMO
// recurso, solo si ni en el tamaño mínimo entra.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EL PISO DEL DESTINO: 3,4 mm de altura de mayúscula.
 *
 * La regla de señalización de la casa —la misma con la que se eligieron los
 * cuatro tamaños de la etiqueta el 20-sep-2026— es que **cada milímetro de
 * altura de mayúscula se lee cómodo desde unos 30 cm**. La etiqueta se lee
 * PARADO, A UN METRO, encima de una caja: 100 cm ÷ 30 cm por mm = 3,34 mm, que
 * se redondea a 3,4.
 *
 * Por debajo de eso el destino deja de leerse a la distancia a la que se
 * trabaja, así que achicar más no arregla nada: sería cambiar un dato cortado
 * por un dato ilegible. Ahí —y solo ahí— vuelve el corte con «…».
 */
export const MAY_DESTINO_MINIMO = 3.4;

/**
 * De cuánto en cuánto se baja el tamaño. Un décimo de milímetro es más fino que
 * lo que se distingue con una regla encima de la caja, y son 42 pasos entre
 * 7,5 y 3,4: el destino queda lo más grande que el papel aguanta, no en uno de
 * tres o cuatro escalones gordos.
 */
export const PASO_DEL_ACHIQUE = 0.1;

/** Lo que el acomodo necesita saber medir, sin saber nada de jsPDF. */
export interface MedidasDelDestino {
  /** El ancho útil del cuarto, en milímetros. */
  ancho: number;
  /** La base del RÓTULO gris: desde ahí baja el dato. */
  desdeY: number;
  /** 🔴 Hasta dónde puede bajar la ÚLTIMA línea. Nadie lo pasa. */
  hastaY: number;
  /** El salto del rótulo a la primera línea del dato, según su tamaño. */
  bajoElRotulo: (mayusculaMm: number) => number;
  /** Los milímetros entre dos bases seguidas del dato, según su tamaño. */
  interlinea: (mayusculaMm: number) => number;
  /** El ancho en milímetros de un texto dibujado a ese tamaño. */
  anchoDeTexto: (texto: string, mayusculaMm: number) => number;
}

export interface AcomodoDelDestino {
  /** La altura de mayúscula con la que se dibuja, en milímetros. */
  mayuscula: number;
  /** Las líneas ya partidas, en orden. */
  lineas: string[];
  /** 🩸 Solo si ni en el tamaño mínimo entró: la última lleva «…». */
  cortado: boolean;
}

/**
 * Parte el texto en líneas que quepan en `ancho`, **cortando SOLO en los
 * espacios**. Devuelve `null` si una palabra sola no cabe: eso no se resuelve
 * partiendo, se resuelve achicando.
 */
export function partirPorEspacio(
  texto: string,
  ancho: number,
  mayuscula: number,
  anchoDeTexto: MedidasDelDestino["anchoDeTexto"],
): string[] | null {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    if (anchoDeTexto(palabra, mayuscula) > ancho) return null;
    const probada = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoDeTexto(probada, mayuscula) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = probada;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Cuántas líneas de ese tamaño caben entre el rótulo y el piso. Nunca menos de una. */
export function lineasQueCaben(mayuscula: number, m: MedidasDelDestino): number {
  const primera = m.desdeY + m.bajoElRotulo(mayuscula);
  const salto = m.interlinea(mayuscula);
  if (!(salto > 0)) return 1;
  return Math.max(1, 1 + Math.floor((m.hastaY - primera) / salto));
}

/**
 * 🔴 EL ACOMODO. Baja el tamaño de a `PASO_DEL_ACHIQUE` desde `maxMayuscula`
 * hasta `MAY_DESTINO_MINIMO`, y se queda con el PRIMERO que entra entero: el
 * más grande que cabe. Por construcción, un destino que ya entra en dos (o
 * tres) líneas a su tamaño de siempre **no se achica ni un décimo**.
 */
export function acomodarDestino(
  texto: string,
  maxMayuscula: number,
  m: MedidasDelDestino,
  minMayuscula: number = MAY_DESTINO_MINIMO,
): AcomodoDelDestino {
  const limpio = String(texto ?? "").trim();
  if (!limpio) return { mayuscula: maxMayuscula, lineas: [], cortado: false };

  // Los pasos, del más grande al más chico. Se redondea cada uno para que
  // «7,5 − 0,1 − 0,1…» no arrastre la basura del punto flotante.
  const pasos: number[] = [];
  for (let mm = maxMayuscula; mm >= minMayuscula - 1e-9; mm -= PASO_DEL_ACHIQUE) {
    pasos.push(Math.round(mm * 1000) / 1000);
  }

  for (const mayuscula of pasos) {
    const lineas = partirPorEspacio(limpio, m.ancho, mayuscula, m.anchoDeTexto);
    if (lineas === null) continue; // una palabra sola no cabe: hay que achicar
    if (lineas.length <= lineasQueCaben(mayuscula, m)) return { mayuscula, lineas, cortado: false };
  }

  // 🩸 ÚLTIMO RECURSO. Ni en el tamaño mínimo entra —un destino larguísimo o una
  // palabra sola más ancha que el cuarto—: se dibuja lo que cabe y la última
  // línea dice «…». El «…» de la Helvetica mide un em entero, así que se le
  // quitan letras a esa línea hasta que el corte QUEPA: pegarlo a una línea que
  // ya llegaba al borde es lo que empujaba el texto 10 mm fuera del cuarto.
  const mayuscula = minMayuscula;
  const caben = lineasQueCaben(mayuscula, m);
  const lineas = partirPorEspacio(limpio, m.ancho, mayuscula, m.anchoDeTexto) ?? [limpio];
  const visibles = lineas.slice(0, caben);
  if (visibles.length === 0) visibles.push(limpio);
  let ultima = visibles[visibles.length - 1];
  while (ultima.length > 1 && m.anchoDeTexto(`${ultima}…`, mayuscula) > m.ancho) {
    ultima = ultima.slice(0, -1);
  }
  visibles[visibles.length - 1] = `${ultima.trimEnd()}…`;
  return { mayuscula, lineas: visibles, cortado: true };
}
