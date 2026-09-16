/* ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA CON UN NÚMERO IMPAR DE MARCACIONES (15-sep-2026). Módulo PURO:
 * sin base, sin red, sin `new Date()`.
 *
 * ── 🔴 EL CÁLCULO NO SE TOCA ─────────────────────────────────────────────────
 *
 * Acá NO se decide ni un centavo. La salida temprana se sigue descontando
 * exactamente como siempre y el motor sigue leyendo la última marca del día
 * como la salida (`reporte.ts`, regla 5: «4 marcas es lo normal; cualquier otra
 * cosa se revisa —pero los números se calculan igual»). Lo único que este
 * archivo hace es APARTAR los días que hay que ir a arreglar, para que se digan
 * en «Antes de cerrar» y para que el cierre se frene hasta que estén arreglados.
 *
 * ── 🔑 POR QUÉ IMPAR Y NO UN UMBRAL ──────────────────────────────────────────
 *
 * 🩸 El encargo original proponía un umbral: «más de 2 horas de salida temprana
 * = le falta la marca». Lo corrigió Daniel, textual: *«¿pa qué esa regla? Si
 * alguien marcó 3x, se le marca así tal cual a la regla y yo me doy cuenta en
 * asistencia. ¿Para eso está, no? Para arreglarlo»* y *«si no, ¿cómo vas a
 * saber a qué hora almorzó?»*.
 *
 * Tiene razón, y la razón es demostrable: **con dos marcas no se puede PROBAR
 * que falte una; con tres, sí**. Un día de 08:04 y 12:07 puede ser alguien que
 * se fue a mediodía o alguien que olvidó marcar la salida — el sistema no tiene
 * cómo saberlo, y un umbral sería adivinar a qué hora se fue. Un día de TRES
 * marcas, en cambio, no puede estar completo: las marcaciones vienen de a pares
 * (entra/sale, entra/sale), así que un número impar es, por construcción, una
 * marca que falta o una que sobra.
 *
 * 🔴 LA REGLA ES **IMPAR**, PUNTO — Y 6 ES PAR, ASÍ QUE NO LA ATRAPA.
 * Esto NO es un olvido y no hay que «arreglarlo»: un día de 6 marcas puede ser
 * perfectamente correcto (entró, almorzó, salió a un mandado y volvió). Ensanchar
 * la regla para atrapar el 6 sería volver a adivinar, que es justo lo que Daniel
 * descartó. El encargo del 15-sep-2026 decía «los de más (5, 6)» por un error de
 * redacción; la medición real partía los IMPARES en menos de 4 y más de 4.
 *
 * ── 🩸 LO MEDIDO, Y EL COSTO QUE DANIEL ACEPTÓ ───────────────────────────────
 *
 * Medido el 15-sep-2026: en la quincena 1–15 sep hay **44 días impares de 349
 * con marca (12,6 %)**; en 16–31 ago, 41 de 367. Se parten en **23 con marcas
 * de menos** (1 o 3) y **21 con marcas de más** (5). Frenar el cierre significa
 * arreglar 44 días uno por uno, con «Agregar hora»; Daniel lo sabe y lo decidió
 * así igual (*«frenan»*).
 *
 * ⚠️ El caso que originó todo esto NO lo atrapa esta regla, y Daniel también lo
 * sabe: Andrea Pérez, 1-sep, marcó 08:04 y 12:07 y nada más. El sistema leyó el
 * 12:07 como su salida y le descontó 292 minutos. Ese día tiene DOS marcas —par—
 * así que no sale en esta lista. Es el precio de no adivinar.
 * ────────────────────────────────────────────────────────────────────────── */

/** Un día suelto que quedó con un número impar de marcaciones. */
export interface DiaImpar {
  fecha: string;
  /** Cuántas marcas tiene ese día. Siempre impar. */
  marcas: number;
}

/**
 * Lo mínimo que este módulo le pide a un día del reporte. Se escribe acotado a
 * propósito: así la regla se prueba con objetos de dos líneas y no arrastra el
 * `DiaReporte` entero, que tiene treinta campos que acá no deciden nada.
 */
export interface DiaParaImpares {
  fecha: string;
  marcas: readonly unknown[];
  habil: boolean;
  enCurso: boolean;
  fueraDeVigencia: boolean;
  vacacion: unknown | null;
}

/**
 * Los días de UNA persona que quedaron impares.
 *
 * 🔴 LO QUE QUEDA AFUERA, Y POR QUÉ CADA UNO:
 *
 *   · **el día que no es hábil** — un sábado con 3 marcas no frena una planilla
 *     que no paga el sábado (`sabadoMin` no entra a ninguna columna);
 *   · **el día en curso** — quien entró y almorzó tiene 3 marcas a las 3 de la
 *     tarde y todavía le falta irse. Eso no es un día mal marcado, es un día a
 *     medias. Misma regla que `revisar` en `reporte.ts`;
 *   · **el día fuera de vigencia** — esa persona no trabajaba acá ese día;
 *   · **el día de vacaciones** — las marcas de un día de vacaciones no cuentan
 *     para nada (viajan en `vacacion.marcasIgnoradas` solo para mostrarse).
 *
 * 🔴 Y LO QUE **NO** QUEDA AFUERA (15-sep-2026, decisión tomada al construir):
 * entra todo el que tenga marcas, incluidos «no marca el reloj» (sueldo fijo) y
 * «trabaja afuera». A ellos el reloj no les mueve la plata, pero igual marcan
 * algunos días, y Daniel pidió verlos: *«se le marca así tal cual a la regla y
 * yo me doy cuenta en asistencia»*.
 */
export function diasConMarcasImpares(dias: readonly DiaParaImpares[]): DiaImpar[] {
  const out: DiaImpar[] = [];
  for (const d of dias) {
    if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) continue;
    // 🔑 El par se va acá, y con él el día sin marcas: 0 es par. No hace falta
    // un `n === 0` aparte — un candado que no puede fallar da confianza falsa.
    const n = d.marcas.length;
    if (n % 2 === 0) continue;
    out.push({ fecha: d.fecha, marcas: n });
  }
  return out;
}

/** Una persona con sus días impares, tal como se nombra en pantalla. */
export interface PersonaConMarcasImpares {
  codigo: string;
  etiqueta: string;
  dias: DiaImpar[];
}

/** Lo que este módulo necesita de una línea del cuadro. */
export interface LineaParaImpares {
  codigo: string;
  etiqueta: string;
  marcasImpares?: readonly DiaImpar[];
}

/**
 * Las personas con días impares, sacadas de las MISMAS líneas que dibuja la
 * tabla y que se congelan al cerrar.
 *
 * 🔴 SE AGRUPA POR CÓDIGO. Con el sueldo repartido entre dos empresas la misma
 * persona produce DOS líneas (`parte`), las dos con los mismos días impares:
 * contarlas dos veces diría «2 colaboradores» donde hay uno, y duplicaría los
 * días en el aviso. Se unen por igualdad exacta del código — nunca por nombre.
 */
export function marcasImparesDeLineas(
  lineas: readonly LineaParaImpares[],
): PersonaConMarcasImpares[] {
  const porCodigo = new Map<string, PersonaConMarcasImpares>();
  for (const l of lineas) {
    // ⚠️ `?? []` y no `!`: una línea armada a mano (un test viejo, un script)
    // no trae el campo, y no tiene por qué tumbar el cierre con un TypeError.
    const dias = l.marcasImpares ?? [];
    if (dias.length === 0) continue;
    const ya = porCodigo.get(l.codigo);
    if (ya) {
      // Misma persona, otra empresa: los días son los mismos. Se conservan los
      // que ya estaban y solo se suman fechas nuevas, por igualdad exacta.
      const vistas = new Set(ya.dias.map((d) => d.fecha));
      for (const d of dias) if (!vistas.has(d.fecha)) ya.dias.push({ ...d });
      continue;
    }
    porCodigo.set(l.codigo, {
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      dias: dias.map((d) => ({ ...d })),
    });
  }
  const out = [...porCodigo.values()];
  for (const p of out) p.dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Más días arriba: si alguien mira una sola línea, que sea la peor.
  return out.sort((a, b) =>
    a.dias.length !== b.dias.length
      ? b.dias.length - a.dias.length
      : a.etiqueta.localeCompare(b.etiqueta, "es"),
  );
}

/**
 * Los dos problemas, separados (⚠️ el encargo: *«Vale la pena separar en el
 * aviso los de menos marcas de los de más: no son el mismo problema»*).
 *
 * · **de menos** (1 o 3 marcas) = falta una hora, y el motor está leyendo como
 *   salida una marca que no lo es. Es el que mueve plata.
 * · **de más** (5 o más) = sobra una marca. Los números salen bien casi siempre;
 *   lo que hay es un día que alguien marcó de más y conviene mirar.
 *
 * Una misma persona puede tener días de los dos tipos, y entonces sale en las
 * DOS listas, cada una con SUS días y nada más.
 */
export function partirImpares(personas: readonly PersonaConMarcasImpares[]): {
  deMenos: PersonaConMarcasImpares[];
  deMas: PersonaConMarcasImpares[];
} {
  const filtrar = (queda: (d: DiaImpar) => boolean): PersonaConMarcasImpares[] =>
    personas
      .map((p) => ({ ...p, dias: p.dias.filter(queda) }))
      .filter((p) => p.dias.length > 0);
  return {
    deMenos: filtrar((d) => d.marcas < 4),
    deMas: filtrar((d) => d.marcas > 4),
  };
}

/** Cuántos días suman, que es lo que se cuenta en pantalla. */
export function contarDias(personas: readonly PersonaConMarcasImpares[]): number {
  return personas.reduce((a, p) => a + p.dias.length, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEE
// ─────────────────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «3 sep» — la fecha corta de siempre en este módulo. */
export function fechaCortaImpar(f: string): string {
  const m = Number(f.slice(5, 7));
  return `${Number(f.slice(8, 10))} ${MESES_CORTOS[m - 1] ?? ""}`.trim();
}

/** «3 sep · 3 marcas — 8 sep · 1 marca» — los días de UNA persona. */
export function detalleDias(dias: readonly DiaImpar[]): string {
  return dias
    .map((d) => `${fechaCortaImpar(d.fecha)} · ${d.marcas} ${d.marcas === 1 ? "marca" : "marcas"}`)
    .join(" — ");
}

/**
 * `/asistencia?tab=asistencia&desde=…&hasta=…&q=<código>` — la MISMA dirección
 * que usa «Ver sus días ›» en la ficha (`SeccionAsistencia.tsx`). Se reusa a
 * propósito: una segunda forma de llegar al mismo lugar es una segunda forma de
 * que una de las dos deje de funcionar.
 */
export function enlaceDiasDe(
  codigo: string,
  rango: { desde: string; hasta: string } | null = null,
): string {
  const p = new URLSearchParams({ tab: "asistencia", q: String(codigo).trim() });
  if (rango && rango.desde && rango.hasta) {
    p.set("desde", rango.desde);
    p.set("hasta", rango.hasta);
  }
  return `/asistencia?${p.toString()}`;
}

/** «N días» / «1 día». */
function dias(n: number): string {
  return n === 1 ? "1 día" : `${n} días`;
}

/**
 * EL TEXTO DEL FRENO. Dice QUÉ pasó · A QUIÉN · Y QUÉ HACER, con la pestaña por
 * su nombre y el botón por el suyo: un 409 que diga «hay días mal marcados»
 * manda a la contadora a buscar dónde.
 *
 * `null` = no hay nada que frenar.
 */
export function textoFrenoMarcasImpares(
  personas: readonly PersonaConMarcasImpares[],
): string | null {
  if (personas.length === 0) return null;
  const { deMenos, deMas } = partirImpares(personas);
  const partes: string[] = [];
  if (deMenos.length > 0) partes.push(`${dias(contarDias(deMenos))} con una marca de MENOS`);
  if (deMas.length > 0) partes.push(`${dias(contarDias(deMas))} con una marca de MÁS`);
  const quien =
    personas.length === 1
      ? "1 colaborador tiene días mal marcados"
      : `${personas.length} colaboradores tienen días mal marcados`;
  const detalle = personas
    .map((p) => `${p.etiqueta} · ${detalleDias(p.dias)}`)
    .join(" — ");
  return (
    `${quien} (${partes.join(" y ")}): ${detalle}. `
    + "Un día tiene que tener un número PAR de marcaciones. "
    + "Ve a la pestaña «Asistencia», pon la hora que falta con «Agregar hora» —o deshaz la que sobra—, y vuelve a cerrar. "
    + "Si se cierra así, el sistema lee como salida una marca que no lo es y descuenta horas que la persona sí trabajó."
  );
}
