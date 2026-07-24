// PDF de pedido de catálogo — wrapper BROWSER del core isomorfo (order-pdf-core).
// Carga las imágenes con <img> + canvas y las reduce a ~200px (JPEG) antes de
// embeberlas, y descarga el PDF con doc.save(). Lo usan el detalle de pedido
// interno (Reebok/Joybees) y las páginas públicas /pedido-reebok y
// /pedido-joybees. Importar SIEMPRE con dynamic import desde componentes.

import {
  buildOrderPdfDoc,
  ORDER_PDF_IMG_PX,
  type OrderPdfOpts,
} from "@/lib/catalogo/order-pdf-core";

/** Carga una imagen y la devuelve como dataURL JPEG reducido (fondo blanco). */
function loadImageDownscaled(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, ORDER_PDF_IMG_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        // Fondo blanco: los PNG con transparencia se ven negros al pasar a JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function downloadCatalogoOrderPdf(
  opts: Omit<OrderPdfOpts, "images"> & { filename: string },
): Promise<void> {
  const urls = [...new Set(opts.items.filter((i) => i.image_url).map((i) => i.image_url))];
  const images: Record<string, string> = {};
  await Promise.all(urls.map(async (u) => {
    const data = await loadImageDownscaled(u);
    if (data) images[u] = data;
  }));
  const doc = buildOrderPdfDoc({ ...opts, images });
  doc.save(opts.filename);
}
