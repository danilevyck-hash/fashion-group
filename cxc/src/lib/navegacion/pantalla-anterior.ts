// ─────────────────────────────────────────────────────────────────────────────
// ¿DE QUÉ PANTALLA SE LLEGÓ? — para que «‹ Atrás» respete el historial
// (15-nov-2026, catalogo-mas-01).
//
// La regla de navegación: el historial es ESPEJO del camino de migas. Un botón
// que sube un nivel tiene que dejar el historial como si se hubiera tocado
// «Atrás»: si se llegó desde ese nivel, se VUELVE (`history.back()`); si se
// llegó desde otro lado (el Inicio, la barra de abajo, un enlace), se
// REEMPLAZA la pantalla por el nivel de arriba — así el «Atrás» del teléfono
// sigue el camino Inicio › Catálogos y no rebota a la marca.
//
// Se anota en la SESIÓN de la pestaña (`PantallaAnterior` en el layout raíz).
// Falla ABIERTA: sin sessionStorage se reemplaza, que nunca deja el historial
// apuntando al revés.
// ─────────────────────────────────────────────────────────────────────────────

const ACTUAL = "fg_pantalla_actual";
const PREVIA = "fg_pantalla_previa";

/** Anota la pantalla que se acaba de abrir. */
export function anotarPantalla(path: string): void {
  try {
    const actual = sessionStorage.getItem(ACTUAL);
    if (actual === path) return;
    if (actual) sessionStorage.setItem(PREVIA, actual);
    sessionStorage.setItem(ACTUAL, path);
  } catch {
    /* sin sessionStorage: se reemplaza al volver */
  }
}

/** ¿La pantalla de antes fue `path`? */
export function vengoDe(path: string): boolean {
  try {
    return sessionStorage.getItem(PREVIA) === path;
  } catch {
    return false;
  }
}

/** Sube un nivel respetando el historial (ver la cabecera). */
export function subirA(router: { back(): void; replace(href: string): void }, href: string): void {
  if (vengoDe(href)) router.back();
  else router.replace(href);
}
