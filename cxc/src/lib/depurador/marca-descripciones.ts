// Reglas de normalización de descripciones del Depurador (CK/TH/KL).
//
// El catálogo de descripciones por marca YA NO vive aquí: la fuente de verdad
// es la tabla `depurador_descripciones` en Supabase (migración 20260722130000).
// Los clientes lo cargan vía GET /api/productos/cargar/descripciones y lo
// inyectan a las funciones de logic.ts / tienda.ts como parámetro.
//
// Aquí quedan solo las REGLAS (lógica, no datos): el mapa de normalización de
// descripciones sucias del proveedor → descripción limpia.

/** Normalización de descripciones sucias del proveedor → descripción limpia. */
export const NORMALIZACION: Record<string, string> = {
  "BoyS Shirts S/S": "Boys Shirts S/S",
  "Boys-Polos S-S": "Boys-Polos S/S",
  "Boys-Shirts  L/S": "Boys-Shirts L/S",
  "Boys-Shirts - Woven Tops S-S": "Boys-Shirts - Woven Tops S/S",
  "Boys-T-Shirts S-S": "Boys-T-Shirts S/S",
  "Girls-Heavyweight Knits": "Girls-Heavyweight",
  "Girls-Shirts  L/S": "Girls-Shirts L/S",
  "MEN-WATCHES": "Men-Watches",
  "Men-Heavyweight Knits": "Men-Heavyweight",
  "Men-Polo S/S": "Men-Polos S/S",
  "Men-Polos L/S OFERTA": "Men-Polos L/S",
  "Men-Small Leather Goods": "Men-Small Leather",
  "WOMEN-WATCHES": "Women-Watches",
  // El gemelo masculino de "Women-Blazers / Sports Jackets", que ya estaba acá.
  // Switch manda las dos formas: BLAZERS (232 u. vendidas) y BLAZERS - SPORTS
  // JACKETS (28 u.). La segunda es la sucia — no es una categoría nueva, así que
  // se limpia acá y NO se le abre fila en el catálogo.
  "Men-Blazers / Sports Jackets": "Men-Blazers",
  "Women-Blazers / Sports Jackets": "Women-Blazers",
  "Women-Heavyweight Knits": "Women-Heavyweight",
  "Women-Panties C": "Women-Panties",
  "Women-Shirts  L/S": "Women-Shirts L/S",
  "Women-Small Leather Goods": "Women-Small Leather",
  "women-T-Shirts S/S": "Women-T-Shirts S/S",
  "Girls-Panties 2PZ": "Girls-Panties",
};
