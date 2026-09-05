// Sin import de supabase-server: al eliminarse getVentasMensuales() este módulo
// dejó de tocar la base. Los tests que lo mockean siguen siendo válidos (el mock
// de un módulo no importado es inocuo) y los componentes cliente que hoy inlinean
// constantes "para no importar server-only de empresa-mapping" pueden seguir
// haciéndolo — no se cambió ninguno.

export const EMPRESA_KEY_TO_NAME: Record<string, string> = {
  vistana: "Vistana International",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  confecciones_boston: "Confecciones Boston",
  american_classic: "Multifashion",
};

/**
 * 🔴 EL NOMBRE CORTO DE CADA EMPRESA — «Vistana», «Boston» (diccionario § 0, #4,
 * decidido por Daniel el 5-sep-2026).
 *
 * Va acá, como SEGUNDO CAMPO de la misma lista, y no en un mapa aparte: el
 * diccionario encontró **tres mapas de nombres para las mismas 8 empresas que no
 * decían lo mismo** (`empresa-mapping` decía «Vistana International», el
 * Telegram del resumen mensual decía «Vistana» y Referencia otra cosa), y un
 * cuarto mapa habría sido exactamente el problema que se está arreglando.
 *
 * Las seis claves son las mismas que `EMPRESA_KEY_TO_NAME` y hay candado que lo
 * exige: agregar una empresa a un mapa y no al otro pone el build ROJO.
 *
 * ⚠️ Se aplica **módulo por módulo**, no de una pasada: hoy lo usa Clientes (la
 * lista y la ficha). Las demás pantallas siguen con el nombre largo hasta que
 * les toque su turno, que es como el diccionario dice que se hace.
 */
export const EMPRESA_KEY_TO_NOMBRE_CORTO: Record<string, string> = {
  vistana: "Vistana",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  confecciones_boston: "Boston",
  american_classic: "Multifashion",
};

/** El nombre corto de una empresa, o su clave si no está en el mapa (nunca se
 *  rompe la pantalla por un nombre que falta). */
export function nombreCortoEmpresa(key: string): string {
  return EMPRESA_KEY_TO_NOMBRE_CORTO[key] ?? EMPRESA_KEY_TO_NAME[key] ?? key;
}

/**
 * Iniciales por empresa para la numeración de reclamos NUEVOS
 * (<INICIALES>-<AÑO>-<correlativo>, ej. VI-2026-0001). Iniciales confirmadas por
 * Daniel. Los reclamos guardan el NOMBRE de la empresa (no la key), así que el
 * lookup es por nombre normalizado (trim + minúsculas). Incluye alias de
 * Multifashion / American Classics → MF. Solo afecta números nuevos: los viejos
 * REC-YYYY-XXXX no se tocan.
 */
const EMPRESA_NAME_TO_INITIALS: Record<string, string> = {
  "vistana international": "VI",
  "fashion wear": "FW",
  "fashion shoes": "FS",
  "active shoes": "AS",
  "active wear": "AW",
  "joystep": "JS",
  "confecciones boston": "CB",
  "multifashion": "MF",
  "american classics": "MF",
  "american classic": "MF",
};

/**
 * Iniciales de la empresa de un reclamo (por NOMBRE). Fallback "RE" si la empresa
 * no está mapeada — sigue siendo un prefijo válido y único, nunca colisiona con el
 * formato viejo REC-.
 */
export function reclamoInitials(empresa: string): string {
  const norm = (empresa || "").trim().toLowerCase();
  return EMPRESA_NAME_TO_INITIALS[norm] ?? "RE";
}

/**
 * Short ids usados por el bundle de Ventas redesign (matrix heatmap, mock-data).
 * El módulo Ventas trabaja con estos ids cortos en el shape de la API; el resto
 * del codebase sigue usando las DB keys largas (vistana, fashion_wear, ...).
 *
 * Mapeo bidireccional con la DB key canónica.
 */
export const EMPRESA_KEY_TO_VENTAS_ID: Record<string, string> = {
  vistana: "vistana",
  fashion_wear: "fwear",
  fashion_shoes: "fshoes",
  active_shoes: "ashoes",
  active_wear: "awear",
  joystep: "joystep",
  confecciones_boston: "boston",
  american_classic: "multi",
};

export const VENTAS_ID_TO_EMPRESA_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(EMPRESA_KEY_TO_VENTAS_ID).map(([k, v]) => [v, k])
);

export type VentasEmpresaId =
  | "vistana" | "fwear" | "fshoes" | "ashoes"
  | "awear" | "joystep" | "boston" | "multi";

export function mapEmpresaKeyToVentasId(key: string): VentasEmpresaId | null {
  return (EMPRESA_KEY_TO_VENTAS_ID[key] as VentasEmpresaId) ?? null;
}

/**
 * Las 6 empresas B2B que tienen clientes con código D-XXX en Switch
 * y CXC/ventas matcheable contra clientes_master. Lista canónica para
 * los flows que dependen del esquema D-XXX (CXC dashboard, /clientes,
 * upload de detallessaldos / listacomprobantes).
 *
 * Excluye Confecciones Boston y American Classic (retail, sin código).
 */
export const B2B_EMPRESA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
] as const;

export type B2BEmpresaKey = typeof B2B_EMPRESA_KEYS[number];

/**
 * Las 8 empresas del grupo en su orden canónico para el módulo de uploads
 * y para flows que necesitan listar todas las empresas (ventas usa las 8;
 * CXC sólo las 6 B2B). Boston es B2B y va junto a las otras B2B; Multifashion
 * (retail puro) se renderiza al final como fila destacada.
 */
export const ALL_EMPRESA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
  "american_classic",
] as const;

export type EmpresaKey = typeof ALL_EMPRESA_KEYS[number];

/**
 * 🩸 `SWITCH_FACTURAS_EMPRESA_KEYS` se retiró el 4-sep-2026, con la píldora
 * «Sincronizado» de Ventas › Resumen que era su única lectora.
 *
 * La lista decía "las empresas que el cron de facturas pobla" y se había
 * quedado en TRES (`active_shoes`, `active_wear`, `american_classic`) mientras
 * el cron cubre las OCHO: la píldora vigilaba 3 de 8 y mostraba en VERDE un
 * Resumen con Vistana o Fashion Wear congeladas. Una lista escrita a mano que
 * describe a un cron es el mismo modo de falla que ya cobró `CXC_GRUPO_EMPRESA_KEYS`
 * (ver abajo) — por eso no se "arregló" agregándole las cinco que faltaban:
 * quien vigila las ventas es `src/lib/datos-frescos.ts`, que DERIVA su lista de
 * `empresasConFacturas()` y avisa por Telegram a las +24 h.
 *
 * Para la lista real: `empresasConFacturas()` en `switch-api/empresas.ts`.
 */

/**
 * CARTERA DEL GRUPO — las 6 B2B. Lo que se suma, se cobra y se le manda por
 * correo al cliente como "su estado de cuenta con Fashion Group".
 *
 * ⚠️ Ya NO es "las empresas que el cron de estadocuenta pobla": desde el
 * 27-jul-2026 ese cron también trae `confecciones_boston`, cuyos saldos viven en
 * `switch_estadocuenta` pero NO son cartera del grupo (`cxc:false`) y se ven
 * SOLO en su pestaña. Se renombró de `CXC_GRUPO_EMPRESA_KEYS` justo
 * por eso: el nombre viejo describía al sync y se usaba para acotar al grupo, y
 * esa clase de nombre a medias fue lo que dejó pasar el agujero de joystep.
 * Para la lista del SYNC: `empresasConEstadoCuenta()` en switch-api/empresas.ts.
 */
export const CXC_GRUPO_EMPRESA_KEYS = B2B_EMPRESA_KEYS;

export function mapEmpresaName(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

// getVentasMensuales() se eliminó con las rutas /api/ventas/metas y
// /api/ventas/metas-auto (jul-2026): eran sus dos únicos consumidores y ambas
// estaban muertas. Quien necesite el agregado por empresa × mes lee directo
// switch_ventas_unificado_vw, que es la fuente que esa función envolvía.
