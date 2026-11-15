/* ─────────────────────────────────────────────────────────────────────────────
 * LOS VIDEOS DE AYUDA, por módulo (15-nov-2026).
 *
 * 🔑 Agregar un módulo = subir sus archivos al bucket PRIVADO `videos-ayuda`
 * (carpeta = la key del módulo) y sumar sus renglones aquí. Nada más.
 * 🔑 Cambiar un video = volver a subir el archivo a la MISMA ruta: este archivo
 * no se toca (salvo que cambie la duración).
 *
 * `segundos` = los del archivo, redondeados hacia abajo (como los cuenta el reproductor).
 * `orden` 0 = «Introducción»; del 1 en adelante se muestran numerados.
 * `completo` = el video entero, el de «Ver todo»; no entra a la lista.
 * Las rutas son del bucket, nunca una URL: la URL se firma al pedirla.
 * ──────────────────────────────────────────────────────────────────────────── */

export const BUCKET_VIDEOS_AYUDA = "videos-ayuda";

export interface VideoAyuda {
  modulo: string;
  orden: number;
  titulo: string;
  segundos: number;
  video: string;
  miniatura: string;
  completo?: boolean;
}

const caja = (orden: number, titulo: string, segundos: number, archivo: string, completo = false): VideoAyuda => ({
  modulo: "caja",
  orden,
  titulo,
  segundos,
  video: `caja/${archivo}.mp4`,
  miniatura: `caja/${archivo}.jpg`,
  ...(completo ? { completo } : {}),
});

export const VIDEOS_AYUDA: VideoAyuda[] = [
  caja(0, "Caja menuda completa", 568, "00-completo", true),
  caja(0, "Introducción", 56, "00-que-es-caja-menuda"),
  caja(1, "Abrir un período", 48, "01-abrir-periodo"),
  caja(2, "Registrar un gasto", 55, "02-registrar-gasto"),
  caja(3, "Registrar varios gastos seguidos", 58, "03-varios-gastos"),
  caja(4, "Adjuntar el comprobante", 38, "04-adjuntar-comprobante"),
  caja(5, "Editar un gasto", 42, "05-editar-gasto"),
  caja(6, "Eliminar y restaurar un gasto", 42, "06-eliminar-y-restaurar"),
  caja(7, "Buscar y filtrar", 43, "07-buscar-y-filtrar"),
  caja(8, "Imprimir y descargar Excel", 42, "08-imprimir-y-excel"),
  caja(9, "Cerrar el período", 77, "09-cerrar-periodo"),
  caja(10, "Abrir el período siguiente", 47, "10-periodo-siguiente"),
];

/** Los videos de un módulo: la lista en orden y el completo aparte. */
export function videosDelModulo(modulo: string): { lista: VideoAyuda[]; completo: VideoAyuda | null } {
  const del = VIDEOS_AYUDA.filter((v) => v.modulo === modulo);
  return {
    lista: del.filter((v) => !v.completo).sort((a, b) => a.orden - b.orden),
    completo: del.find((v) => v.completo) ?? null,
  };
}

export const tieneVideos = (modulo: string): boolean => VIDEOS_AYUDA.some((v) => v.modulo === modulo && !v.completo);

/** 0:57 · 9:28 */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «Introducción» · «2. Registrar un gasto» */
export const tituloEnLista = (v: Pick<VideoAyuda, "orden" | "titulo">): string =>
  v.orden > 0 ? `${v.orden}. ${v.titulo}` : v.titulo;
