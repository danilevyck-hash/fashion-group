// 🔴 SE QUITÓ EL AUTOGUARDADO DE BORRADORES (1-oct-2026). Daniel, sobre el aviso
// «Tienes un borrador guardado de hace 1 hora. ¿Restaurar?»: *«¿y si lo
// quitamos? Igual no es mucha info en caso de emergencia, son par de clics»*.
// Se fue de los cuatro lugares que lo tenían: nueva guía, despacho de bodega,
// reclamos y cheques. Esto solo barre lo que quedó guardado en los navegadores
// de antes, para que no queden datos huérfanos. Es idempotente: si no hay nada,
// no hace nada.
//
// ⚠️ Las firmas del despacho (`guia_firma_*`) NO se barren aquí: desde el
// 1-oct-2026 se guardan a propósito, con vencimiento de 24 h. Daniel aprobó
// guardar solo las firmas. Ver `@/lib/guias/firmas-despacho`.

/** Borra del navegador toda clave que empiece con alguno de los prefijos. */
export function limpiarBorradoresViejos(...prefijos: string[]): void {
  try {
    // Con `key(i)` y no `Object.keys`: es la API de Storage y no depende de
    // cómo el navegador exponga las claves. Se juntan antes de borrar porque
    // borrar corre los índices.
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && prefijos.some((p) => clave.startsWith(p))) claves.push(clave);
    }
    for (const clave of claves) localStorage.removeItem(clave);
  } catch {
    /* sin localStorage: no hay nada que limpiar */
  }
}
