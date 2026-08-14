// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN VE Y QUIÉN TOCA LAS METAS — un solo lugar.
//
// ── 🔴 LA COSTURA QUE ERA UNA PREGUNTA, Y YA TIENE RESPUESTA ─────────────────
//
// Cuando se construyó este módulo, el rol `gerente_acs` (Jennifer) tenía una
// ventana de datos acotada al **mes en curso + el mismo mes del año pasado**,
// impuesta en el servidor ruta por ruta. Una meta de CUATRO meses no entraba en
// esa ventana, así que el avance quedó detrás de una perilla
// (`METAS_ABIERTAS_AL_ROL_ACOTADO`) a la espera de que Daniel decidiera.
//
// **Daniel decidió el 13-ago-2026, textual: _"abrile Multifashion completo"_.**
// La ventana acotada se retiró del módulo entero, así que la perilla dejó de
// tener sentido: Jennifer ve Multifashion como cualquier otro rol con acceso, y
// las metas son parte de Multifashion. La perilla se BORRÓ en vez de dejarse en
// `true` — una perilla que ya no puede estar en `false` es una mentira que
// alguien va a leer como una opción viva.
//
// ── 🔑 LO QUE NO CAMBIÓ, Y ES LO QUE IMPORTA DEL DISEÑO ─────────────────────
//
// El avance se calcula SIEMPRE completo, en el servidor, sobre el período que
// dice la meta (`metas-lectura.ts`, que no mira ni un rol). Quién puede verlo
// es una pregunta DISTINTA y se contesta acá.
//
// Esa separación es la razón por la que abrirle el acceso a Jennifer fue un
// cambio de lista y no un rediseño: si el permiso hubiera estado metido dentro
// de la cuenta —por ejemplo recortando el rango antes de sumar—, abrirla habría
// significado reescribir la aritmética, y ahí es donde aparecen los números que
// no cuadran entre dos pantallas. Se deja escrito para que siga siendo así.
//
// ── ⚠️ VER NO ES EDITAR, Y ESO SÍ SIGUE CERRADO ─────────────────────────────
//
// Jennifer VE su meta; no puede crearla, cambiarla ni retirarla. Ella comisiona
// por la tienda y por sus ventas personales, o sea que editar metas sería
// editarse su propio objetivo. `puedeEditarMetas` es admin y nada más, y hay un
// test que falla si esta lista se ensancha.
// ─────────────────────────────────────────────────────────────────────────────

/** Roles que administran metas (crear, editar, retirar). */
export const ROLES_ADMIN_METAS = ["admin"] as const;

/**
 * Roles que VEN el avance.
 *
 * `gerente_acs` entra desde el 13-ago-2026 por decisión de Daniel: es la gerente
 * de la tienda y la meta del viaje es de su equipo — era justo quien más la
 * necesitaba y la única que la tenía vedada.
 */
export const ROLES_LECTURA_METAS = ["admin", "secretaria", "gerente_acs"] as const;

/** ¿Este rol puede VER el avance de las metas? */
export function puedeVerMetas(role: string | null | undefined): boolean {
  return (ROLES_LECTURA_METAS as readonly string[]).includes(role ?? "");
}

/**
 * ¿Este rol puede CREAR / EDITAR / RETIRAR metas?
 *
 * Va aparte de `puedeVerMetas` a propósito: que alguien vea su meta NO puede
 * convertirla en alguien que se edita su propio objetivo.
 */
export function puedeEditarMetas(role: string | null | undefined): boolean {
  return (ROLES_ADMIN_METAS as readonly string[]).includes(role ?? "");
}

/** Todos los roles que la ruta deja pasar — la unión de los dos permisos. */
export function rolesQueEntranAMetas(): string[] {
  return [...new Set<string>([...ROLES_LECTURA_METAS, ...ROLES_ADMIN_METAS])];
}
