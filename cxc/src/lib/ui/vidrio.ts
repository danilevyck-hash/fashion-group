// ─────────────────────────────────────────────────────────────────────────────
// VIDRIO («liquid glass», 2-oct-2026). Daniel, mirando el menú de un chip:
// «aquí usar liquid glass como Apple, ¿no?».
//
// La receta es UNA para todo el sistema: fondo blanco translúcido con
// desenfoque, borde fino, sombra suave y radio de 16 px. Si el navegador no
// sabe desenfocar, el fondo queda blanco SÓLIDO: el texto nunca se lee sobre
// la foto de atrás.
//
// ⚠️ Otro agente arma la misma clase en su rama. Si al unir quedan dos, se deja
// UNA sola (esta o la suya) y se cambian sus usos.
// ─────────────────────────────────────────────────────────────────────────────

/** Panel de vidrio: menús desplegables, paneles chicos y hojas. */
export const VIDRIO =
  "bg-white supports-[backdrop-filter:blur(1px)]:bg-white/70 backdrop-blur-xl backdrop-saturate-150 border border-white/20 ring-1 ring-black/5 shadow-lg shadow-black/10 rounded-2xl";
