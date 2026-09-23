// ============================================================================
// Marketing — EL PROVEEDOR: una sola grafía. Módulo PURO.
//
// Daniel (22-sep-2026): el PDF lo lee la IA (ya lo hace); al escribirlo se
// SUGIEREN los ya usados; y el freno de duplicados NORMALIZA — sin «S a»,
// «S.A.», «S. A.», puntos, acentos, espacios dobles ni mayúsculas.
//
// 🩸 Medido contra producción el 22-sep-2026: 13 proveedores distintos, y el
// mismo proveedor escrito de dos formas ya pasó («11-00007766» y
// «11-000007766» de Confecciones Boston, «000008123» y «0000008123» de Premium
// Paint: el número cambia, el proveedor y el monto no).
//
// 🔴 IGUALDAD SOBRE EL NORMALIZADO, NUNCA `includes`. Es la trampa de «nova»
// → «Renovación» que este repo ya pagó en Multifashion (`marcas-grupo.ts`).
// Sugerir es por PREFIJO del normalizado (`startsWith`), que es lo que hace
// falta mientras la persona teclea; comparar dos proveedores es igualdad.
// ============================================================================

/** Sufijos de sociedad que no distinguen a nadie. Como TOKENS, no como texto. */
const SUFIJOS_DE_SOCIEDAD = new Set(["sa", "s", "a", "inc", "corp", "ltd", "srl"]);

/**
 * Normaliza el nombre de un proveedor para COMPARAR, nunca para mostrar.
 *
 *   «Impresora Comercial, S.A.»  → "impresora comercial"
 *   «PREMIUM PAINT PANAMÁ S. A»  → "premium paint panama"
 *   «Confecciones  Boston S a»   → "confecciones boston"
 *
 * Minúsculas · sin acentos · sin puntuación · un espacio entre palabras · sin
 * la cola de sociedad («s a», «sa», «inc», «corp»). La cola solo se quita al
 * FINAL del nombre: «Sa Marketing» sigue siendo «sa marketing».
 */
export function normalizarProveedor(s: string | null | undefined): string {
  const base = String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:'"()\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length === 0) return "";
  const tokens = base.split(" ");
  // Se recorta la cola de sociedad de atrás hacia adelante, sin vaciar el nombre.
  while (tokens.length > 1 && SUFIJOS_DE_SOCIEDAD.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** ¿Son el mismo proveedor? Igualdad del normalizado y nada más. */
export function mismoProveedor(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarProveedor(a);
  return na.length > 0 && na === normalizarProveedor(b);
}

/** Una sugerencia: la grafía más usada de ese proveedor y cuántas veces salió. */
export interface SugerenciaProveedor {
  nombre: string;
  usos: number;
}

/** Cuántas sugerencias se ofrecen como mucho. */
export const MAX_SUGERENCIAS = 8;

/**
 * Sugiere proveedores YA USADOS por prefijo de lo que la persona teclea.
 *
 * `historico` son los nombres tal como se guardaron (con repeticiones: cada
 * factura trae el suyo). Se agrupan por el normalizado y se ofrece UNA grafía
 * por proveedor — la más usada — para que la lista no diga «Impresora
 * Comercial» e «IMPRESORA COMERCIAL S.A.» como si fueran dos.
 *
 * Texto vacío → los más usados. Orden: más usos primero, después alfabético.
 */
export function sugerirProveedores(
  texto: string | null | undefined,
  historico: ReadonlyArray<string | null | undefined>,
  max: number = MAX_SUGERENCIAS,
): SugerenciaProveedor[] {
  const prefijo = normalizarProveedor(texto);
  const porClave = new Map<string, Map<string, number>>();
  for (const crudo of historico) {
    const nombre = String(crudo ?? "").replace(/\s+/g, " ").trim();
    const clave = normalizarProveedor(nombre);
    if (clave.length === 0) continue;
    const grafias = porClave.get(clave) ?? new Map<string, number>();
    grafias.set(nombre, (grafias.get(nombre) ?? 0) + 1);
    porClave.set(clave, grafias);
  }
  const out: SugerenciaProveedor[] = [];
  for (const [clave, grafias] of porClave) {
    if (prefijo.length > 0 && !clave.startsWith(prefijo)) continue;
    let mejor = "";
    let mejorUsos = -1;
    let usos = 0;
    for (const [grafia, n] of grafias) {
      usos += n;
      if (n > mejorUsos || (n === mejorUsos && grafia < mejor)) {
        mejor = grafia;
        mejorUsos = n;
      }
    }
    out.push({ nombre: mejor, usos });
  }
  out.sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"));
  return out.slice(0, Math.max(0, max));
}
