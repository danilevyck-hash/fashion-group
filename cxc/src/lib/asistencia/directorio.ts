/* ─────────────────────────────────────────────────────────────────────────────
 * EL DIRECTORIO — el ÚNICO lugar donde un código del reloj se vuelve un nombre.
 *
 * ── 🩸 POR QUÉ EXISTE ────────────────────────────────────────────────────────
 *
 * El Hikvision manda CÓDIGOS PELADOS: `empleado_nombre` viene vacío en las
 * 3.287 marcaciones cargadas (medido 6-ago-2026). Sin traducir, el desplegable
 * de Justificaciones listaba «15, 16, 17, 21, 22…» y Daniel tenía que adivinar
 * quién era cada número. Los nombres SÍ existen: están en `asistencia_personas`
 * (32 fichas), que es la tabla que llena la pantalla de Configuración.
 *
 * ── 🩸 POR QUÉ UNA SOLA FUNCIÓN Y NO UN `find` EN CADA PANTALLA ──────────────
 *
 * En este proyecto la MISMA lista escrita cuatro veces ya costó dos bugs caros
 * (las empresas de Switch repartidas en tres archivos —$15.262 de cobros
 * invisibles— y los roles de Asistencia copiados en 7 archivos). Resolver el
 * nombre en cada pantalla es exactamente ese patrón: el día que alguien cambie
 * la regla de respaldo en Justificaciones, el Reporte y el Excel van a seguir
 * diciendo otra cosa. Acá hay UNA función, y las pantallas la usan.
 *
 * ── LAS DOS REGLAS QUE NO SE NEGOCIAN ────────────────────────────────────────
 *
 * 1. SIN NOMBRE SE MUESTRA EL CÓDIGO, nunca un espacio en blanco ni «Sin
 *    nombre». Hay 6 códigos con marcaciones que todavía no tienen ficha (48 a
 *    53, entraron después del archivo que teníamos): tienen que seguir siendo
 *    elegibles y verse. Una fila en blanco es una persona a la que nadie le va
 *    a cargar una justificación.
 *
 * 2. SE ORDENA POR NOMBRE, NO POR CÓDIGO COMO TEXTO. Ordenando texto, el «5»
 *    cae después del «49» y la lista se vuelve inusable. Los que sí tienen
 *    nombre van alfabéticos; los que no, agrupados al final y por número de
 *    verdad (5 antes que 49), donde se leen como lo que son: pendientes.
 *
 * Módulo PURO: sin base, sin red. El I/O vive en `config-server.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

/** Una fila de `asistencia_personas`, con lo mínimo que el directorio usa. */
export interface FichaNombre {
  empleado_codigo: string;
  nombre?: string | null;
}

/** Una persona lista para pintar en una lista o un desplegable. */
export interface PersonaListada {
  codigo: string;
  /** `null` = no tiene ficha todavía. NO es lo mismo que una cadena vacía. */
  nombre: string | null;
  /** Lo que se muestra. Nunca vacío: si no hay nombre, es el código. */
  etiqueta: string;
  /** `false` = falta configurarle el nombre en la pestaña Configuración. */
  configurado: boolean;
}

const limpio = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
};

/**
 * Lo que se le muestra a una persona. Regla 1: sin nombre, el código.
 *
 * 🔑 Acá se traga la cadena vacía además del `null`. Una fila con
 * `nombre = ""` (que el CHECK de la base no prohíbe) pintaría una celda en
 * blanco, y una celda en blanco no se puede ni buscar ni reclamar.
 */
export function etiquetaPersona(codigo: string, nombre?: string | null): string {
  return limpio(nombre) ?? String(codigo ?? "").trim();
}

export interface Directorio {
  /** El nombre configurado, o `null` si no hay ficha. */
  nombre(codigo: string): string | null;
  /** Lo que se muestra: el nombre, o el código si no hay. Nunca vacío. */
  etiqueta(codigo: string): string;
  /** ¿Tiene ficha con nombre? */
  configurado(codigo: string): boolean;
  /** La persona entera, lista para una lista o un `<option>`. */
  persona(codigo: string): PersonaListada;
  /** Todos los códigos con ficha. */
  codigos(): string[];
  /** Cuántas fichas hay. `0` también significa "la migración no corrió". */
  readonly total: number;
}

/**
 * Arma el directorio a partir de las fichas guardadas.
 *
 * Aguanta la lista vacía a propósito: si la migración `20260806160000` todavía
 * no corrió, `leerPersonas()` devuelve `[]` y acá todo cae al código. La
 * pantalla sigue funcionando con números en vez de romperse —mismo criterio que
 * `catalogo/cols-opcionales.ts`.
 */
export function crearDirectorio(filas: readonly FichaNombre[] | null | undefined): Directorio {
  const porCodigo = new Map<string, string>();
  for (const f of filas ?? []) {
    const cod = String(f?.empleado_codigo ?? "").trim();
    const nom = limpio(f?.nombre);
    if (!cod || !nom) continue;
    porCodigo.set(cod, nom);
  }

  const nombre = (codigo: string) => porCodigo.get(String(codigo ?? "").trim()) ?? null;

  return {
    nombre,
    etiqueta: (codigo) => etiquetaPersona(codigo, nombre(codigo)),
    configurado: (codigo) => nombre(codigo) !== null,
    persona: (codigo) => {
      const cod = String(codigo ?? "").trim();
      const nom = nombre(cod);
      return { codigo: cod, nombre: nom, etiqueta: etiquetaPersona(cod, nom), configurado: nom !== null };
    },
    codigos: () => [...porCodigo.keys()],
    get total() {
      return porCodigo.size;
    },
  };
}

/**
 * El ORDEN de cualquier lista de personas del módulo. Regla 2.
 *
 * Primero quien tiene nombre, alfabético en español (para que «Ángela» caiga
 * junto a «Angela» y no al final del abecedario). Después los pendientes, por
 * número de verdad: `numeric: true` es lo que pone el 5 antes que el 49.
 *
 * 🩸 Los pendientes van AL FINAL, no al principio. Ordenando todo junto con
 * `numeric`, los códigos sueltos se trepan arriba de todos los nombres y lo
 * primero que ve Daniel al abrir el desplegable son seis números.
 */
export function compararPersonas(a: PersonaListada, b: PersonaListada): number {
  if (a.configurado !== b.configurado) return a.configurado ? -1 : 1;
  if (a.configurado && b.configurado) {
    return a.etiqueta.localeCompare(b.etiqueta, "es", { sensitivity: "base" });
  }
  return a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" });
}

/** La lista ordenada. Copia: no se toca el arreglo del llamador. */
export function ordenarPersonas(personas: readonly PersonaListada[]): PersonaListada[] {
  return [...personas].sort(compararPersonas);
}

/**
 * El universo de personas del módulo: las fichas guardadas MÁS los códigos que
 * marcaron en el reloj, ya ordenado.
 *
 * 🩸 LA UNIÓN ES EL PUNTO. Si la lista saliera solo de las fichas, los 6 que
 * entraron después (48 a 53) no aparecerían en ningún desplegable y no se les
 * podría cargar una justificación. Y si saliera solo del reloj, quien dejó de
 * marcar —el código 47— desaparecería de su propia planilla.
 */
export function armarPersonas(
  directorio: Directorio,
  codigosConMarcaciones: Iterable<string>,
): PersonaListada[] {
  const codigos = new Set<string>(directorio.codigos());
  for (const c of codigosConMarcaciones) {
    const cod = String(c ?? "").trim();
    if (cod) codigos.add(cod);
  }
  return ordenarPersonas([...codigos].map((c) => directorio.persona(c)));
}
