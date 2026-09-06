// ─────────────────────────────────────────────────────────────────────────────
// LAS OBSERVACIONES QUE SE VEN — y la línea técnica que se esconde.
// (módulo PURO)
//
// Daniel, 5-sep-2026, sobre la frase del cierre en bloque: *«dejar de
// mostrarlo»*.
//
// 🩸 QUÉ ES. El 3-ago-2026 se cerraron en bloque las guías que habían salido
// físicamente sin registro de despacho, y esa operación dejó una frase escrita
// en el campo de Observaciones de cada una. Medido contra producción el
// 5-sep-2026: **54 guías vivas la traen** — **51** la tienen SOLA (23% de las
// 222) y **3** la tienen pegada debajo de una observación real («Devolucion de
// mueble», «Dollar mall lleva una caja de ganchos…»). Bodega la ve en casi una
// de cada cuatro guías y no le dice nada: es el rastro de una operación
// técnica de hace un mes.
//
// 🔴 NO SE BORRA DE LA BASE. Es texto de un documento que alguien firmó, y
// borrarlo es lo que este módulo evita en todos lados. Deja de MOSTRARSE en
// pantalla, en el papel, en el PDF y en el Excel, y nada más.
//
// 🔴 LAS OBSERVACIONES REALES SE CONSERVAN Y SE SIGUEN VIENDO. Solo se quita
// ESA línea, exacta; el resto del texto queda tal cual, con sus saltos de línea.
// Por eso se compara la LÍNEA entera y no se hace un `replace` de un pedazo:
// una observación que casualmente mencionara la fecha no se toca.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La frase, verbatim, tal como quedó escrita en las 54 guías. Se compara sin
 * bordes y con el punto final opcional — hay filas con y sin él.
 */
export const TEXTO_CIERRE_EN_BLOQUE =
  "Cerrada en bloque el 3-ago-2026: salió físicamente, sin registro de despacho";

function esLaLineaTecnica(linea: string): boolean {
  const t = linea.trim().replace(/\.$/, "");
  return t === TEXTO_CIERRE_EN_BLOQUE;
}

/**
 * Las observaciones tal como se MUESTRAN: sin la línea del cierre en bloque.
 * `""` cuando no queda nada — la pantalla ya sabe qué hacer con eso (no dibuja
 * el bloque), igual que con una guía sin observaciones.
 *
 * ⚠️ Esto es de LECTURA. El campo que se EDITA sigue trayendo el texto
 * guardado: si el formulario mostrara el texto recortado, guardar lo borraría
 * de la base — que es exactamente lo que se decidió no hacer.
 */
export function observacionesVisibles(obs: string | null | undefined): string {
  const t = String(obs ?? "");
  if (!t.trim()) return "";
  return t
    .split("\n")
    .filter((l) => !esLaLineaTecnica(l))
    .join("\n")
    .trim();
}
