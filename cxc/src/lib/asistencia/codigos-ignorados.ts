// ─────────────────────────────────────────────────────────────────────────────
// IGNORAR UN CÓDIGO. Módulo PURO: la regla, no el I/O.
//
// 🩸 POR QUÉ EXISTE. El reloj marca códigos que no son nadie —39, 55 y 9999,
// medidos en producción: pruebas y códigos mal tecleados—. La lista los muestra
// como «Código 39 · Falta» A PROPÓSITO, para que nadie que trabaje quede
// invisible; el precio era que la basura se contaba como pendiente para siempre.
//
// ⚠️ Y NO SE PUEDE ADIVINAR CUÁL ES BASURA: el reloj nunca manda el nombre (0
// de 1.000 marcaciones traen `empleado_nombre`), así que un código sin ficha se
// ve igual que una persona nueva. Lo dice una persona; el sistema lo recuerda.
//
// 🔴 TAMBIÉN PARA QUIEN TIENE FICHA. Daniel: *«pon la opción de ignorar código
// así como DANIEL LEVY código 52»*. Ignorar es una decisión sobre el CÓDIGO —
// tenga ficha o no— y por eso acá NO hay ninguna regla que mire la ficha.
//
// 🔴 ESCONDE, NO BORRA. Ni las marcaciones (append-only, con barrido estático
// que lo prohíbe) ni la ficha se tocan. Se puede volver a mostrar.
// ─────────────────────────────────────────────────────────────────────────────

export const TABLA_CODIGOS_IGNORADOS = "asistencia_codigos_ignorados";

/** Un código escondido, tal como se lee. */
export interface CodigoIgnorado {
  codigo: string;
  motivo: string | null;
  por: string;
  cuando: string;
}

/** Lo que se muestra en el bloque plegado. `null` = no hay ninguno. */
export function textoIgnorados(cuantos: number): string | null {
  if (cuantos <= 0) return null;
  return cuantos === 1 ? "Ignorados (1)" : `Ignorados (${cuantos})`;
}

/**
 * 🔴 EL FILTRO. Lo usan la lista de Personas, la planilla y los conteos —los
 * tres desde acá, para que un código no pueda quedar escondido en una pantalla
 * y contándose en otra.
 */
export function sinIgnorados<T extends { codigo: string }>(
  filas: readonly T[],
  ignorados: ReadonlySet<string>,
): T[] {
  if (ignorados.size === 0) return [...filas];
  return filas.filter((f) => !ignorados.has(String(f.codigo).trim()));
}

/** ¿Este código está escondido? */
export function estaIgnorado(codigo: string, ignorados: ReadonlySet<string>): boolean {
  return ignorados.has(String(codigo ?? "").trim());
}

/** Limpia el motivo opcional. Vacío es `null`: la base rechaza la cadena vacía. */
export function motivoDeIgnorado(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, 200) : null;
}

/** Valida el código que llega por la ruta. `null` = no sirve. */
export function codigoValido(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t || t.length > 40) return null;
  return t;
}

/** Lo que la pantalla pregunta antes de esconder. Corto: es reversible. */
export function textoConfirmar(codigo: string, etiqueta?: string | null): string {
  const quien = String(etiqueta ?? "").trim();
  const nombre = quien && quien !== codigo ? `${quien} (${codigo})` : `el código ${codigo}`;
  return `¿Ignorar ${nombre}? Deja de salir en la lista y en la planilla. Puedes volver a mostrarlo cuando quieras.`;
}
