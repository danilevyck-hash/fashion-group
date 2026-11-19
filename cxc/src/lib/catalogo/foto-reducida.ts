// Carga una foto en el NAVEGADOR y la reduce a ~200 px (JPEG, fondo blanco).
// La usan el PDF del pedido (`order-pdf-client.ts`) y el Excel del pedido
// (`order-excel.ts`): una sola forma de achicar la foto para los dos papeles.
// Vive aparte para que el Excel no arrastre jsPDF.

/** Lado máximo (px) al que se reduce cada foto del PDF y del Excel del pedido.
 *  `order-pdf-core` lo reexporta (y el PDF del servidor lo usa con sharp). */
export const ORDER_PDF_IMG_PX = 200;

export interface FotoReducida {
  dataUrl: string;
  ancho: number;
  alto: number;
}

/** null si la foto no carga (404, CORS, formato raro): quien llama la salta. */
export function loadImageDownscaled(url: string): Promise<FotoReducida | null> {
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
        resolve({ dataUrl: c.toDataURL("image/jpeg", 0.72), ancho: w, alto: h });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
