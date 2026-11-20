// Miniaturas GUARDADAS (19-nov-2026). Hasta hoy la miniatura salía del
// transform de Supabase (`/render/image`), que se cobra por foto de origen
// distinta en cada ciclo. Ahora cada foto del catálogo se guarda con dos WebP
// al lado, en una ruta DERIVADA de la original (`<ruta>__600.webp`,
// `<ruta>__160.webp`), y aquí solo se apunta a ese archivo normal
// (`/object/public/...`). Las genera `guardarFotoConMiniaturas`
// (lib/catalogo/miniaturas.ts), la ÚNICA puerta de escritura del bucket.
// Si la miniatura no existe, el `onError` del llamador cae al original: nunca
// una foto rota. Este archivo NO importa sharp: lo usan componentes de cliente.

const OBJECT_PREFIX = "/storage/v1/object/public/";
export const BUCKET_FOTOS = "product-images";
export const ANCHOS_MINIATURA = [600, 160] as const;
export type AnchoMiniatura = (typeof ANCHOS_MINIATURA)[number];

/** `tommy/_v/abc/1.jpg` → `tommy/_v/abc/1.jpg__600.webp` (sirve igual con URL). */
export function rutaMiniatura(ruta: string, ancho: AnchoMiniatura): string {
  return `${ruta}__${ancho}.webp`;
}

/** ¿Es una miniatura derivada (y no una foto original)? */
export function esMiniatura(ruta: string): boolean {
  return /__(600|160)\.webp$/.test(ruta.split("?")[0]);
}

export function supabaseThumb(url: string | null | undefined, width: AnchoMiniatura = 600): string | null {
  if (!url) return null;
  if (!url.includes(`${OBJECT_PREFIX}${BUCKET_FOTOS}/`)) return url;
  const [base, qs] = url.split("?");
  // El `?v=` del original viaja igual: cambia cuando cambia la foto, y la
  // miniatura se regenera en la misma subida.
  return `${rutaMiniatura(base, width)}${qs ? `?${qs}` : ""}`;
}

// 🩸 19-nov-2026 — fotos grises para siempre en el catálogo público: las
// primeras tarjetas llegan en el HTML del servidor y la foto termina de
// cargar ANTES de que React hidrate, así que `onLoad`/`onError` nunca se
// disparan y el esqueleto queda encima. Al montar la <img> se pregunta cómo
// quedó: "cargada", "fallo" o null (todavía no termina; los eventos avisan).
// `currentSrc` vacío = una lazy que ni empezó: no es un fallo.
export function estadoAlMontar(img: HTMLImageElement | null): "cargada" | "fallo" | null {
  if (!img || !img.complete) return null;
  if (img.naturalWidth > 0) return "cargada";
  return img.currentSrc ? "fallo" : null;
}
