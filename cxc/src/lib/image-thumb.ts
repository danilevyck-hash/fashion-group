// Thumbnails vía el transform de imágenes de Supabase Storage (verificado
// activo en este proyecto el 4-jul-2026): /object/public/ → /render/image/
// public/ + width/quality. Evita bajar fotos a resolución completa en listas
// (catálogo Reebok en iPad con datos móviles). Si la URL no es de Supabase
// Storage se devuelve tal cual; el caller debe tener fallback onError a la
// URL original por si el render falla para algún archivo.

const OBJECT_PREFIX = "/storage/v1/object/public/";
const RENDER_PREFIX = "/storage/v1/render/image/public/";

export function supabaseThumb(url: string | null | undefined, width = 600, quality = 70): string | null {
  if (!url) return null;
  if (!url.includes(OBJECT_PREFIX)) return url;
  const [base, qs] = url.split("?");
  const params = new URLSearchParams(qs || "");
  params.set("width", String(width));
  params.set("height", String(width));
  // GOTCHA verificado en vivo (5-jul-2026): sin `resize=contain`, el default
  // del render es cover Y con solo width devuelve width×altoOriginal — una
  // FRANJA vertical recortada (1000×1000 → 160×1000). contain + caja cuadrada
  // preserva la foto completa (160×160), como object-contain en el catálogo.
  params.set("resize", "contain");
  params.set("quality", String(quality));
  return `${base.replace(OBJECT_PREFIX, RENDER_PREFIX)}?${params.toString()}`;
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
