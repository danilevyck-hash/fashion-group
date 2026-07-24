// PDF de pedido de catálogo — wrapper SERVER del core isomorfo (order-pdf-core).
// Descarga las imágenes y las reduce con sharp a ~200px antes de embeberlas
// (se pintan a 10mm; embeber la foto original de 1600px inflaba el PDF y el
// adjunto del correo sin ninguna ganancia visual). Retorna Buffer para los
// endpoints /orders/[id]/pdf y los adjuntos de send-order.

import sharp from "sharp";
import {
  buildOrderPdfDoc,
  ORDER_PDF_IMG_PX,
  type OrderPdfOpts,
  type PdfOrderItem,
} from "@/lib/catalogo/order-pdf-core";

export type { PdfOrderItem };

async function fetchImagesDownscaled(items: PdfOrderItem[]): Promise<Record<string, string>> {
  const imgs: Record<string, string> = {};
  await Promise.all(items.map(async (item) => {
    if (!item.image_url || imgs[item.image_url]) return;
    try {
      const res = await fetch(item.image_url);
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      try {
        // flatten blanco: los PNG con transparencia se ven negros al pasar a JPEG.
        const small = await sharp(buf)
          .resize(ORDER_PDF_IMG_PX, ORDER_PDF_IMG_PX, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 72 })
          .toBuffer();
        imgs[item.image_url] = `data:image/jpeg;base64,${small.toString("base64")}`;
      } catch {
        // sharp falló (formato raro) → embeber el original tal cual (comportamiento previo).
        const contentType = res.headers.get("content-type") || "image/jpeg";
        imgs[item.image_url] = `data:${contentType};base64,${buf.toString("base64")}`;
      }
    } catch { /* imagen inaccesible — se salta */ }
  }));
  return imgs;
}

export async function buildCatalogoOrderPdf(opts: Omit<OrderPdfOpts, "images">): Promise<Buffer> {
  const images = await fetchImagesDownscaled(opts.items);
  const doc = buildOrderPdfDoc({ ...opts, images });
  return Buffer.from(doc.output("arraybuffer"));
}
