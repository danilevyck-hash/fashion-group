// ─────────────────────────────────────────────────────────────────────────────
// Regla ÚNICA del nombre del cliente en los pedidos del link público
// (Reebok / Joybees / Tommy Hilfiger — una sola fuente para las tres marcas).
//
// PROBLEMA que resuelve (25-jul-2026): el campo "Tu nombre" no se leía como
// obligatorio. El botón se deshabilitaba en silencio (solo opacity-50) y el
// mínimo del server era 2 caracteres, así que entraron pedidos reales con
// cliente_nombre "ff" y la secretaria no sabe de quién son.
//
// Decisiones:
//   · mínimo 3 LETRAS (no 3 caracteres): "ff", "12", "..." quedan fuera.
//   · el mensaje de error es el MISMO en el browser y en el server — el browser
//     avisa antes de tocar el botón, el server manda (se puede saltar el JS).
//   · español simple: lo lee gente NO técnica en Panamá.
//
// Puro (sin I/O) — testeable con vitest.
// ─────────────────────────────────────────────────────────────────────────────

/** Mínimo de LETRAS del nombre (subió de 2 a 3: ver cabecera). */
export const NOMBRE_MIN = 3;
export const NOMBRE_MAX = 120;

export const NOMBRE_ERROR_CORTO =
  "Escribe tu nombre completo (al menos 3 letras) para confirmar el pedido.";
export const NOMBRE_ERROR_LARGO = "El nombre es demasiado largo (máximo 120 caracteres).";

export type NombreValidacion =
  | { ok: true; nombre: string }
  | { ok: false; error: string };

/** Cuenta letras reales (acentos y ñ incluidos); ignora números y símbolos. */
export function contarLetras(texto: string): number {
  return (texto.match(/\p{L}/gu) || []).length;
}

/**
 * Valida y NORMALIZA el nombre del cliente (trim + espacios internos
 * colapsados). El nombre devuelto es el que se guarda en la DB.
 */
export function validarNombreCliente(raw: unknown): NombreValidacion {
  const nombre = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (nombre.length > NOMBRE_MAX) return { ok: false, error: NOMBRE_ERROR_LARGO };
  if (contarLetras(nombre) < NOMBRE_MIN) return { ok: false, error: NOMBRE_ERROR_CORTO };
  return { ok: true, nombre };
}

/** Atajo para la UI: ¿el botón de confirmar puede habilitarse? */
export function nombreClienteValido(raw: unknown): boolean {
  return validarNombreCliente(raw).ok;
}
