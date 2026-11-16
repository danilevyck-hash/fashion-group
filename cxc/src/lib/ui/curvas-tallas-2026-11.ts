/* ─────────────────────────────────────────────────────────────────────────────
 * CURVAS DE TALLAS POR CAJA EN EL «?» DE CATÁLOGOS (16-nov-2026, Daniel).
 *
 * El «?» de cada catálogo de marca lleva SOLO el PDF de esa marca; el de la
 * lista de marcas (`/catalogos/marcas`), el PDF completo. Joybees no tiene
 * datos: no lleva PDF. Los PDF viven en `public/ayuda/`.
 * `false` = el «?» de antes, sin el renglón.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CURVAS_TALLAS_2026_11 = true;

export interface PdfDeCurvas {
  href: string;
  /** Nombre con el que se comparte o descarga. */
  nombre: string;
}

const DE_LA_MARCA: Record<string, string> = { tommy: "Tommy Hilfiger", calvin: "Calvin Klein", reebok: "Reebok" };

/** El PDF de curvas de esta dirección, o null si no lleva. */
export function curvasDeLaRuta(pathname: string | null): PdfDeCurvas | null {
  if (!CURVAS_TALLAS_2026_11 || !pathname) return null;
  if (pathname === "/catalogos/marcas") {
    return { href: "/ayuda/curvas-tallas-calzado.pdf", nombre: "Curvas de tallas por caja - Calzado.pdf" };
  }
  const marca = /^\/catalogo\/([^/]+)$/.exec(pathname)?.[1];
  const nombre = marca ? DE_LA_MARCA[marca] : undefined;
  return nombre ? { href: `/ayuda/curvas-tallas-${marca}.pdf`, nombre: `Curvas de tallas por caja - ${nombre}.pdf` } : null;
}
