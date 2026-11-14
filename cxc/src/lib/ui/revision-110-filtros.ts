// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 (14-nov-2026) — grupo «filtros»: las 7 pantallas filtro-1..7
// que Daniel aprobó (~/Desktop/revision-por-modulo/mockups/filtro-N-*.png).
// Ninguna usa la hoja de filtros: cápsulas a la vista que dicen qué filtran.
// Solo FORMA, en el celular: nada que se guarde ni ninguna cuenta cambia.
// Cada interruptor en `false` deja la pantalla exactamente como estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** filtro-1 · Catálogos › Comprobantes: buscador a todo el ancho y, debajo,
 *  «Todos los orígenes ▾» · «Pedidos ▾» · «Seleccionar todos» en una línea. */
export const FILTRO_1_COMPROBANTES = true;

/** filtro-2 · Catálogos › Administrar: encabezado en una línea, las tres
 *  acciones en un grupo, buscador gris, «Todos 240 ▾» · «Todos los géneros ▾»,
 *  nombre completo del artículo y «Subir otra» · «Ocultar» al lado de la foto. */
export const FILTRO_2_CATALOGO_ADMIN = true;

/** filtro-3 · Comisiones: el período solo en su línea; buscador + «Todas las
 *  empresas ▾» en una línea; «Total a pagar $X · Actualizado h:mm ↻» en una. */
export const FILTRO_3_COMISIONES = true;

/** filtro-4 · Caja menuda › Período: «Buscar proveedor» + «Todas las categorías ▾». */
export const FILTRO_4_CAJA_PERIODO = true;

/** filtro-5 · Plantilla Switch › Historial: «Buscar marca o usuario» + «Todas las empresas ▾». */
export const FILTRO_5_PLANTILLA_HISTORIAL = true;

/** filtro-6 · Asistencia › Configuración: «Buscar colaborador» + «Todas las empresas ▾». */
export const FILTRO_6_ASISTENCIA_CONFIG = true;

/** filtro-7 · Asistencia › Aprobaciones: «Buscar colaborador» + «Todas las empresas ▾»; el período sigue en su línea. */
export const FILTRO_7_ASISTENCIA_APROBACIONES = true;
