// PDF de pedido de catálogo — wrapper BROWSER del core isomorfo (order-pdf-core).
// Carga las imágenes con <img> + canvas y las reduce a ~200px (JPEG) antes de
// embeberlas, y descarga el PDF con doc.save(). Lo usan el detalle de pedido
// interno (Reebok/Joybees) y las páginas públicas /pedido-reebok y
// /pedido-joybees. Importar SIEMPRE con dynamic import desde componentes.

import { buildOrderPdfDoc, type OrderPdfOpts } from "@/lib/catalogo/order-pdf-core";
import { loadImageDownscaled } from "@/lib/catalogo/foto-reducida";

// La misma reducción la usa el Excel del pedido (`order-excel.ts`).
export { loadImageDownscaled };

export async function downloadCatalogoOrderPdf(
  opts: Omit<OrderPdfOpts, "images"> & { filename: string },
): Promise<void> {
  const urls = [...new Set(opts.items.filter((i) => i.image_url).map((i) => i.image_url))];
  const images: Record<string, string> = {};
  await Promise.all(urls.map(async (u) => {
    const data = await loadImageDownscaled(u);
    if (data) images[u] = data.dataUrl;
  }));
  const doc = buildOrderPdfDoc({ ...opts, images });
  doc.save(opts.filename);
}
