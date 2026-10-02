// ─────────────────────────────────────────────────────────────────────────────
// ESTRUCTURA COMÚN ESTILO APPLE (1-oct-2026) — el interruptor.
//
// Lo que está en TODAS las pantallas: la barra lateral, la barra de arriba, el
// camino de migas y el Inicio. Propuesta del mockup «hoy vs propuesta», APAGADA
// hasta el «sí» de Daniel (reglas en docs/diseno.md).
//
// Medido en producción el 1-oct-2026 (solo lectura):
//   · Cada persona abrió entre 1 y 7 módulos en la semana (visitas_modulo,
//     25-sep → 1-oct), y la secretaria salta entre GRUPOS: Guías, Plantilla
//     Switch y Marketing (Operación) con Catálogos (Ventas y clientes). Hoy la
//     barra plegada muestra 3 íconos de GRUPO y hay que abrir una ventanita para
//     llegar al módulo: dos clics y adivinar en qué grupo está.
//   · «Cambiar contraseña»: 2 veces en 90 días contra 905 entradas al sistema
//     (activity_logs). Hoy tiene su llave a la vista en TRES lugares.
//   · Campana: Daniel, 24-sep-2026: «no uso ni notificaciones ni buscar». La
//     campana solo repite los avisos que ya salieron en pantalla.
//
// Qué cambia con `true`:
//   1. Barra lateral: los MÓDULOS a la vista, separados por grupo. Plegada, un
//      ícono por módulo (con su color); abierta, el grupo como título y sus
//      módulos debajo. Un clic a cualquier módulo. Sin acordeón ni ventanita.
//   2. Barra de arriba en UNA fila: el camino de migas a la izquierda; a la
//      derecha «Buscar ⌘K» y el botón del usuario (inicial y nombre), que abre
//      «Cambiar contraseña» y «Cerrar sesión». Se van el segundo logo FG, la
//      campana, la llave y el botón de salir sueltos, y el pie repetido de la
//      barra lateral.
//   3. Inicio: saludo y fecha con el MISMO botón del usuario; sin «Accesos
//      frecuentes» (repetía los módulos de abajo), sin el botón de modo oscuro
//      (solo pintaba esta pantalla) y sin el logo grande (ya está en la barra).
//
// 🔴 SOLO CAMBIA LA PANTALLA: los módulos que ve cada rol, sus direcciones,
// «Cerrar sesión» (DELETE /api/auth) y la ventana de contraseña son los MISMOS.
// En el celular, los módulos no cambian (título grande y ☰ quedan igual).
// Candado: `src/__tests__/navegacion/estructura-2026-10.test.tsx`.
//
// 🔴 `false` = la estructura de hoy, intacta.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Estructura común estilo Apple. `false` = la de hoy. */
// 🔴 2-oct-2026: PRENDIDO. Daniel aprobó las capturas el 2-oct-2026: «sí».
export const ESTRUCTURA_APPLE_2026_10 = true;

/** Lo que abre el botón del usuario, en este orden. */
export const OPCIONES_DEL_USUARIO = ["Cambiar contraseña", "Cerrar sesión"] as const;
