// ─────────────────────────────────────────────────────────────────────────────
// "¿QUISISTE DECIR…?" — el motor de SUGERENCIAS de cliente. Módulo PURO.
//
// 🔴 ESTO NO ATA NADA. NUNCA. NI CUANDO HAY UN SOLO CANDIDATO CLAVADO.
//
// Devuelve una LISTA para que una persona mire y toque. No tiene forma de
// escribir en la base, no expone un "elegido", y quien lo consume tampoco puede
// deducir uno: si hay un único candidato, sigue siendo un candidato.
//
// 🩸 POR QUÉ ESA REGLA NO SE NEGOCIA. `Sporting Shoes N7` y `Sporting Shoes N 4`
// se parecen muchísimo —comparten TODAS las palabras— y son tiendas distintas.
// Un auto-atado "cuando el parecido es altísimo" habría metido el despacho de
// una en la cuenta de la otra, en silencio y sin dejar rastro: el texto escrito
// sigue diciendo N7 y el código dice otra cosa. Por eso las diferencias de
// NÚMERO no se esconden — se muestran como advertencia al lado del candidato.
//
// ── Lo que este archivo NO hace, y es a propósito ───────────────────────────
//
// No decide, no puntúa "de más" y no rellena. Si nada se parece lo suficiente,
// devuelve la lista VACÍA y la pantalla lo dice con todas las letras — "no hay
// ningún cliente parecido, hay que darlo de alta en Switch" — en vez de dejar a
// alguien buscando algo que no está. Medido contra producción el 9-ago-2026:
// de los 68 nombres sin atar, hay al menos 14 que sencillamente no existen en
// el directorio (Rja… bueno, ese sí existe: ver el reporte).
//
// ── Cómo decide que algo "se parece" ────────────────────────────────────────
//
// Cuatro puertas de entrada (basta una) y, después, un puntaje:
//
//   (a) comparten una palabra IDÉNTICA de 4 letras o más
//   (b) comparten una palabra casi idéntica (1 letra de diferencia) de 6+ letras
//       — es lo que reconoce "sporsam" contra "sportsam"
//   (c) sus letras pegadas son las MISMAS ("LUTY LUI" ≡ "Lutylui")
//   (d) el texto escrito ES el código del cliente ("d-35" → D-35)
//
// Sin ninguna de esas cuatro no hay candidato. Esa puerta es la que deja afuera
// a `King Sport` contra `Nine Sports` (solo comparten "sport"/"sports", que no
// es idéntico) sin necesidad de umbrales finos.
// ─────────────────────────────────────────────────────────────────────────────

import {
  digitosDe,
  letrasPegadas,
  palabrasDe,
  sinSufijoLegal,
} from "@/lib/clientes/nombre-normalizado";
import { normalizarBusqueda } from "@/lib/buscar-normalizado";
import { nombreParaMostrar } from "@/lib/clientes/nombre-display";

/** Lo mínimo que necesita un candidato. Compatible con `ClienteHit`. */
export interface ClienteCandidato {
  codigo: string;
  nombre: string;
  razon_social?: string | null;
}

export type AvisoSugerencia =
  /** Los dos tienen número y no es el mismo: N2 contra N3. Lo más peligroso. */
  | "numeros-distintos"
  /** Uno tiene número y el otro no: "Aidy Shop" contra "Aidy Shop No.2". */
  | "falta-numero"
  /** Cada uno tiene una palabra propia: "Los Pueblos" contra "Los Andes". */
  | "nombres-distintos";

export interface Sugerencia {
  codigo: string;
  /** Cómo se llama, ya pasado por el alias de display. */
  nombre: string;
  /**
   * Con qué texto pegó, cuando NO es el nombre que se muestra — casi siempre la
   * razón social. Sin esto la sugerencia parece un disparate: `Star Shoes, S.A.`
   * factura como **"City Moda"**, así que aparece al escribir "City Moda Los
   * Andes" y nadie entendería por qué. La pantalla lo dice: *"factura como …"*.
   */
  tambienConocidoComo?: string;
  /** Qué mirar antes de tocarlo. Vacío = las dos formas coinciden. */
  avisos: AvisoSugerencia[];
  /** 0-1. Solo para ORDENAR la lista; no es una decisión ni se muestra. */
  puntaje: number;
}

/**
 * 🩸 **D-201 NO se sugiere, y no es un olvido.**
 *
 * "American Classics" es un DUPLICADO: no existe en Switch, 0 facturas, 0 CXC.
 * La migración de PR #444 sacó de encima 13 líneas de guía que apuntaban ahí y
 * las mandó a D-108, el American Classics real del grupo. Con el parecido a
 * secas, `American Clasicc` pegaba MEJOR contra el duplicado (`American
 * Classics`, 0,94) que contra el bueno (`American Classics Store`, 0,83): la
 * pantalla habría estado recomendando, primero en la lista, deshacer lo que
 * acababa de arreglarse.
 *
 * ⚠️ **No se lo saca del directorio ni del selector.** Sigue estando: quien lo
 * busque a propósito lo encuentra y lo puede elegir. Borrarlo del maestro es
 * decisión de Daniel. Lo único que se le quita es la RECOMENDACIÓN.
 */
export const CODIGOS_QUE_NO_SE_SUGIEREN: readonly string[] = ["D-201"];

/** Cuántas se ofrecen. Más de tres deja de ser una sugerencia y es otra lista. */
export const MAX_SUGERENCIAS = 3;

/** Piso de parecido para entrar. Calibrado contra los 68 textos sin atar. */
export const PISO_PARECIDO = 0.7;

/** Peso mínimo del lado contenido para que "está adentro del otro" valga. */
const PESO_MINIMO_CONTENIDO = 5;

/** Distancia de edición tolerada según el largo de la palabra más larga. */
function toleranciaTipeo(largo: number): number {
  if (largo <= 3) return 0;
  if (largo <= 6) return 1;
  return 2;
}

/** Levenshtein clásico. Las palabras son cortas: no hace falta nada más rápido. */
export function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(fila[j - 1] + 1, previa[j] + 1, previa[j - 1] + costo);
    }
    previa = fila;
  }
  return previa[b.length];
}

/** ¿Son la misma palabra escrita con un dedo torcido? */
export function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const largo = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > toleranciaTipeo(largo)) return false;
  return distanciaEdicion(a, b) <= toleranciaTipeo(largo);
}

interface Pareo {
  /** Peso (en letras) de lo que coincide entre los dos nombres. */
  peso: number;
  pesoA: number;
  pesoB: number;
  /** Palabras de A que no encontraron pareja, y viceversa. */
  sueltasA: string[];
  sueltasB: string[];
  /** ¿Comparten una palabra IDÉNTICA de 4+ letras? (puerta `a`) */
  compartenExacta: boolean;
  /** ¿Comparten una casi idéntica de 6+ letras? (puerta `b`) */
  compartenCasi: boolean;
}

/** Empareja las palabras de los dos nombres, cada una a lo sumo una vez. */
function parear(palabrasA: string[], palabrasB: string[]): Pareo {
  const usadasB = new Array(palabrasB.length).fill(false);
  const sueltasA: string[] = [];
  let peso = 0;
  let compartenExacta = false;
  let compartenCasi = false;

  for (const pa of palabrasA) {
    // Primero se busca una IDÉNTICA: si "shoes" está en los dos, no tiene
    // sentido gastarla contra un "shos" parecido que hay más adelante.
    let idx = palabrasB.findIndex((pb, i) => !usadasB[i] && pb === pa);
    if (idx === -1) {
      idx = palabrasB.findIndex((pb, i) => !usadasB[i] && mismaPalabra(pa, pb));
    }
    if (idx === -1) {
      sueltasA.push(pa);
      continue;
    }
    const pb = palabrasB[idx];
    usadasB[idx] = true;
    peso += Math.min(pa.length, pb.length);
    if (pa === pb && pa.length >= 4) compartenExacta = true;
    else if (pa !== pb && Math.min(pa.length, pb.length) >= 6) compartenCasi = true;
  }

  return {
    peso,
    pesoA: palabrasA.reduce((s, p) => s + p.length, 0),
    pesoB: palabrasB.reduce((s, p) => s + p.length, 0),
    sueltasA,
    sueltasB: palabrasB.filter((_, i) => !usadasB[i]),
    compartenExacta,
    compartenCasi,
  };
}

/** Las palabras "de verdad" del lado contenido: las de una letra no cuentan. */
const pesoSignificativo = (palabras: string[]): number =>
  palabras.filter((p) => p.length >= 2).reduce((s, p) => s + p.length, 0);

function esCodigoEscrito(escrito: string, codigo: string): boolean {
  const q = normalizarBusqueda(escrito);
  return q.length >= 2 && q === normalizarBusqueda(codigo);
}

/**
 * El parecido entre lo que escribió bodega y un cliente del directorio.
 * `null` = no se parece lo suficiente como para ofrecerlo.
 */
export function evaluarCandidato(
  escrito: string,
  cliente: ClienteCandidato,
): Sugerencia | null {
  const nombre = nombreParaMostrar(cliente.codigo, cliente.nombre) || cliente.nombre;
  const textoEscrito = (escrito ?? "").trim();
  const codigo = (cliente.codigo ?? "").trim();
  if (!textoEscrito || !codigo) return null;
  if (CODIGOS_QUE_NO_SE_SUGIEREN.some((c) => c.toUpperCase() === codigo.toUpperCase())) return null;

  // Puerta (d): alguien escribió el código en el campo del nombre. Pasa como
  // coincidencia perfecta y sin avisos: no hay nada ambiguo en un D-XXX.
  if (esCodigoEscrito(textoEscrito, codigo)) {
    return { codigo, nombre, avisos: [], puntaje: 1 };
  }

  // El nombre del maestro y su razón social son dos formas del mismo cliente:
  // se prueba contra las dos y gana la que mejor pega. `Star Shoes, S.A.`
  // factura como "City Moda" y `City Moda Chorrera` como "Inversiones Z15,
  // S.A." — sin la razón social, `City Moda Inversiones Z15` no encontraría a
  // su cliente, que SÍ está en el directorio.
  const versiones = [nombre, cliente.nombre, cliente.razon_social ?? ""].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );

  let mejor: Sugerencia | null = null;
  for (const version of versiones) {
    const s = evaluarContra(textoEscrito, version, codigo, nombre);
    if (s && (!mejor || s.puntaje > mejor.puntaje)) mejor = s;
  }
  return mejor;
}

function evaluarContra(
  escrito: string,
  version: string,
  codigo: string,
  nombreMostrado: string,
): Sugerencia | null {
  const pa = palabrasDe(escrito);
  const pb = palabrasDe(version);
  if (pa.length === 0 || pb.length === 0) return null;

  const p = parear(pa, pb);

  // Puerta (c): las letras pegadas son las mismas. "LUTY LUI" ≡ "Lutylui".
  const letrasIguales =
    letrasPegadas(escrito) !== "" && letrasPegadas(escrito) === letrasPegadas(version);

  if (!letrasIguales && !p.compartenExacta && !p.compartenCasi) return null;

  // ¿Uno está ENTERO dentro del otro? ("Sportsam" dentro de "Sportsam Centro
  // Atletico", "Bouti" dentro de "Bouti Shopping Center"). Vale como parecido
  // aunque el otro lado traiga muchas palabras de más.
  const contenidoA = p.sueltasA.every((w) => w.length < 2) && pesoSignificativo(pa) >= PESO_MINIMO_CONTENIDO;
  const contenidoB = p.sueltasB.every((w) => w.length < 2) && pesoSignificativo(pb) >= PESO_MINIMO_CONTENIDO;

  const dice = p.pesoA + p.pesoB === 0 ? 0 : (2 * p.peso) / (p.pesoA + p.pesoB);

  // 🩸 "Estar contenido" ENTRA, pero NO se lleva el primer puesto. Antes esto
  // valía 1 y el resultado se veía mal en pantalla: para `NINE SPORTS`, la
  // primera sugerencia era **Sportsam** (contiene "sportsam"≈"sports") por
  // encima de `Nine Sports 9`, que es el cliente. Subir al piso y dejar que el
  // parecido REAL ordene pone cada uno donde va sin sacar a nadie de la lista.
  const puntaje = letrasIguales
    ? 1
    : contenidoA || contenidoB
      ? Math.max(dice, PISO_PARECIDO)
      : dice;
  if (puntaje < PISO_PARECIDO) return null;

  const avisos: AvisoSugerencia[] = [];
  const dA = digitosDe(escrito);
  const dB = digitosDe(version);
  if (dA && dB && dA !== dB) avisos.push("numeros-distintos");
  else if (dA !== dB) avisos.push("falta-numero");
  // Cada lado con una palabra propia de 4+ letras: "Los Pueblos" / "Los Andes".
  // No aplica cuando las letras son las mismas y solo cambian los espacios
  // ("LUTY LUI" ≡ "Lutylui"): ahí no hay dos nombres, hay uno mal separado.
  if (
    !letrasIguales &&
    p.sueltasA.some((w) => w.length >= 4) &&
    p.sueltasB.some((w) => w.length >= 4)
  ) {
    avisos.push("nombres-distintos");
  }

  const alias = version.trim() !== nombreMostrado.trim() ? version.trim() : undefined;
  return { codigo, nombre: nombreMostrado, tambienConocidoComo: alias, avisos, puntaje };
}

/**
 * 🔴 **UN NÚMERO QUE NO CUADRA MANDA A LA SUGERENCIA HACIA ABAJO.**
 *
 * El parecido de letras no distingue `Outlet Duty Free N3` de `Outlet Duty Free`
 * (sin número) — de hecho el SIN número puntúa MÁS alto, porque tiene una
 * palabra menos. Medido con el texto real `Outle Dutty Free # 3`: `D-119
 * Outlet Duty Free` daba 0,93 y el correcto `D-118 …N3` daba 0,90, así que la
 * lista arrancaba con el candidato equivocado.
 *
 * El número ES el dato que separa dos tiendas en este negocio, así que pesa en
 * el orden. **No saca a nadie de la lista** (eso sería decidir por la persona):
 * solo lo pone después de los que sí cuadran.
 */
function pesoDeOrden(s: Sugerencia): number {
  let f = 1;
  if (s.avisos.includes("numeros-distintos")) f *= 0.8;
  if (s.avisos.includes("falta-numero")) f *= 0.9;
  return s.puntaje * f;
}

/**
 * Los clientes que se PARECEN a lo que escribió bodega, mejor primero.
 *
 * 🔴 Lista vacía significa exactamente eso: **no hay nada parecido**, y la
 * pantalla tiene que decirlo. No se rellena con "lo menos malo".
 *
 * Un candidato con avisos igual se ofrece — esconderlo sería decidir por la
 * persona, que es justo lo que este módulo no hace. Pero va DESPUÉS de los
 * limpios: entre dos parecidos, el que no tiene peros va arriba.
 */
export function sugerirClientes(
  escrito: string | null | undefined,
  clientes: readonly ClienteCandidato[],
  max: number = MAX_SUGERENCIAS,
): Sugerencia[] {
  const texto = (escrito ?? "").trim();
  if (!texto || sinSufijoLegal(texto) === "") return [];

  const out: Sugerencia[] = [];
  for (const c of clientes) {
    const s = evaluarCandidato(texto, c);
    if (s) out.push(s);
  }

  out.sort(
    (a, b) =>
      pesoDeOrden(b) - pesoDeOrden(a) ||
      a.avisos.length - b.avisos.length ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
  return out.slice(0, Math.max(0, max));
}

/** El texto de cada aviso, en español simple. Sin jerga y sin códigos. */
export const TEXTO_AVISO: Readonly<Record<AvisoSugerencia, string>> = {
  "numeros-distintos": "Ojo: los números no son los mismos. Puede ser otra tienda.",
  "falta-numero": "Ojo: uno lleva número y el otro no. Fíjate si es la misma tienda.",
  "nombres-distintos": "Ojo: los nombres no son iguales del todo.",
};
