import { DOMINIO_PUBLICO } from "./metadata-publica";

/** El link ÚNICO que se le manda a un cliente para ver los cuatro catálogos
 *  (23-sep-2026). Vive aparte de la página porque Next no admite exportar
 *  constantes desde un `page.tsx`. */
export const URL_CATALOGOS_PUBLICOS = `${DOMINIO_PUBLICO}/catalogo-publico/todos`;
