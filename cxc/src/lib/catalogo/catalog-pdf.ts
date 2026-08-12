// ─────────────────────────────────────────────────────────────────────────────
// PDF del CATÁLOGO COMPLETO (grid 3 columnas, formato letter) — compartido
// Reebok/Joybees. Extraído de la página de productos Reebok y parametrizado
// por marca; Joybees lo usa desde su menú Compartir ("Descargar PDF").
//
// buildCatalogPdfDoc es puro (jsPDF, corre en Node para tests);
// downloadCatalogPdf es el wrapper de browser (canvas para cargar/reducir
// imágenes + doc.save).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { REEBOK_LOGO_BASE64 } from "@/lib/reebok-logo";
import { TOMMY_LOGO_BASE64 } from "@/lib/tommy-logo";
import { CALVIN_LOGO_BASE64 } from "@/lib/calvin-logo";
import { JOYBEES_LOGO_BASE64 } from "@/lib/joybees-logo";
import { fmtPrecio } from "@/lib/catalogo/precio";

export interface CatalogPdfProduct {
  name: string;
  sku: string;
  color?: string | null;
  price: number | null;
  image_url: string | null;
  badge?: string | null; // "oferta" | "nuevo" | null
}

export interface CatalogPdfSection {
  label: string; // banda de sección (ej. "HOMBRE", "CLOGS ADULTOS")
  items: CatalogPdfProduct[];
}

export interface CatalogImage { data: string; w: number; h: number }

export interface CatalogPdfOpts {
  marca: "reebok" | "joybees" | "tommy" | "calvin";
  sections: CatalogPdfSection[];
  /** Descripción de filtros activos (ej. "Hombre · Calzado") o "Todos los productos". */
  subtitle: string;
  totalCount: number;
  /** image_url → imagen ya cargada/reducida. Las ausentes se saltan. */
  images: Record<string, CatalogImage>;
}

/** Lado máximo (px) al que se reduce cada foto del catálogo (celda ~54mm). */
export const CATALOG_PDF_IMG_PX = 480;

/**
 * Precio de la celda del PDF. Delega en el formato ÚNICO de los catálogos
 * (src/lib/catalogo/precio.ts) — se re-exporta acá porque este archivo era el
 * dueño histórico del formato y así no se rompe a nadie que lo importe.
 *
 * Antes era `price.toFixed(0)`, que REDONDEABA: $12.50 se imprimía "$13" y el
 * PDF cotizaba 50 ¢ de más por unidad.
 */
export const formatCatalogPrice = fmtPrecio;

interface BrandTheme {
  primary: [number, number, number];
  accent: [number, number, number];
  /** Rojo del badge OFERTA y del precio rebajado. Cada marca usa el SUYO: el
   *  catálogo de Tommy salía con el rojo Reebok (#E4002B) en las ofertas.
   *  Joybees se queda en rojo a propósito — su acento es amarillo y "OFERTA" en
   *  blanco sobre amarillo no se lee. */
  saleColor: [number, number, number];
  cellBg: [number, number, number];
  bandFill: [number, number, number];
  bandText: [number, number, number];
  bandCount: [number, number, number];
  drawLogo: (doc: jsPDF, x: number, y: number, big: boolean) => void;
}

const RED: [number, number, number] = [228, 0, 43];
const NAVY: [number, number, number] = [26, 38, 86];
const GRAY_LIGHT: [number, number, number] = [160, 160, 165];
const GRAY_MID: [number, number, number] = [120, 120, 125];
const WHITE: [number, number, number] = [255, 255, 255];
const JB_DARK: [number, number, number] = [64, 64, 65];
const JB_YELLOW: [number, number, number] = [255, 228, 67];
const TH_NAVY: [number, number, number] = [21, 35, 66];
const TH_RED: [number, number, number] = [174, 0, 41];

const CK_BLACK: [number, number, number] = [26, 26, 26];

const THEMES: Record<"reebok" | "joybees" | "tommy" | "calvin", BrandTheme> = {
  reebok: {
    primary: NAVY,
    accent: RED,
    saleColor: RED,
    cellBg: [245, 240, 232],
    bandFill: NAVY,
    bandText: WHITE,
    bandCount: [200, 200, 210],
    drawLogo: (doc, x, y, big) => {
      if (REEBOK_LOGO_BASE64) {
        try { doc.addImage(REEBOK_LOGO_BASE64, "PNG", x, y, big ? 24 : 18, big ? 6.7 : 5); } catch { /* */ }
      }
    },
  },
  joybees: {
    primary: JB_DARK,
    accent: JB_YELLOW,
    saleColor: RED,
    cellBg: [255, 250, 224],
    bandFill: JB_YELLOW,
    bandText: JB_DARK,
    bandCount: GRAY_MID,
    drawLogo: (doc, x, y, big) => {
      // Abeja + wordmark en color sobre página blanca. Aspecto ~3.81:1.
      if (JOYBEES_LOGO_BASE64) {
        try { doc.addImage(JOYBEES_LOGO_BASE64, "PNG", x, y, big ? 24 : 18, big ? 6.3 : 4.7); } catch { /* */ }
      }
    },
  },
  tommy: {
    primary: TH_NAVY,
    accent: TH_RED,
    saleColor: TH_RED,
    cellBg: [246, 247, 249],
    bandFill: TH_NAVY,
    bandText: WHITE,
    bandCount: [185, 190, 205],
    drawLogo: (doc, x, y, big) => {
      // Wordmark oscuro (#102039) sobre página clara. Aspecto ~14.5:1.
      if (TOMMY_LOGO_BASE64) {
        try { doc.addImage(TOMMY_LOGO_BASE64, "PNG", x, y + (big ? 1.5 : 1), big ? 50 : 38, big ? 3.4 : 2.6); } catch { /* */ }
      }
    },
  },
  calvin: {
    // Blanco/negro minimalista: sin color de acento — el negro ES el acento.
    primary: CK_BLACK,
    accent: CK_BLACK,
    saleColor: CK_BLACK,
    cellBg: [250, 250, 250],
    bandFill: [10, 10, 10],
    bandText: WHITE,
    bandCount: [200, 200, 200],
    drawLogo: (doc, x, y, big) => {
      // Wordmark tipográfico oscuro sobre página clara. Aspecto ~11.7:1.
      if (CALVIN_LOGO_BASE64) {
        try { doc.addImage(CALVIN_LOGO_BASE64, "PNG", x, y + (big ? 1.5 : 1), big ? 48 : 36, big ? 4.1 : 3.1); } catch { /* */ }
      }
    },
  },
};

export function buildCatalogPdfDoc(opts: CatalogPdfOpts): jsPDF {
  const { marca, sections, subtitle, totalCount, images } = opts;
  const theme = THEMES[marca];

  const PW = 215.9, PH = 279.4;
  const M = 18;
  const CONTENT_W = PW - 2 * M;
  const COLS = 3, GAP = 8;
  const CW = (CONTENT_W - (COLS - 1) * GAP) / COLS;
  const IH = 54;
  const TH = 22;
  const CH = IH + TH;
  const RGAP = 10;
  const SECTION_H = 14;
  const FOOTER_H = 10;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  let y = M;
  let pageNum = 1;

  function drawFooter() {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY_LIGHT);
    doc.text(`${pageNum}`, PW / 2, PH - 8, { align: "center" });
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_MID);
    doc.text("Fashion Group — Panamá", PW / 2, PH - 4.5, { align: "center" });
  }

  function drawPageHeader() {
    theme.drawLogo(doc, M, 8, false);
    doc.setDrawColor(...theme.accent);
    doc.setLineWidth(0.4);
    doc.line(M, 15, PW - M, 15);
    y = 20;
  }

  function needPage(h: number): boolean {
    if (y + h > PH - M - FOOTER_H) {
      drawFooter();
      doc.addPage();
      pageNum++;
      drawPageHeader();
      return true;
    }
    return false;
  }

  // ── Portada / encabezado primera página ──
  theme.drawLogo(doc, M, y, true);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...theme.primary);
  doc.text("CATÁLOGO", PW - M, y + 5.5, { align: "right" });
  y += 11;
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(0.5);
  doc.line(M, y, PW - M, y);
  y += 6;

  const dateStr = new Date().toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_MID);
  doc.text(dateStr, M, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...theme.primary);
  doc.text(`${totalCount} productos`, PW - M, y, { align: "right" });
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_LIGHT);
  doc.text(subtitle.toUpperCase(), M, y);
  y += 8;

  // ── Secciones ──
  for (const section of sections) {
    if (!section.items.length) continue;
    needPage(SECTION_H + CH);
    doc.setFillColor(...theme.bandFill);
    doc.roundedRect(M, y, CONTENT_W, 8, 1, 1, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...theme.bandText);
    doc.text(section.label.toUpperCase(), M + 5, y + 5.8);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...theme.bandCount);
    doc.text(`${section.items.length} productos`, PW - M - 5, y + 5.8, { align: "right" });
    y += SECTION_H;

    for (let i = 0; i < section.items.length; i += COLS) {
      needPage(CH);
      const row = section.items.slice(i, i + COLS);
      for (let j = 0; j < row.length; j++) {
        const p = row[j];
        const x = M + j * (CW + GAP);
        doc.setFillColor(...theme.cellBg);
        doc.roundedRect(x, y, CW, IH, 2, 2, "F");
        const cached = p.image_url ? images[p.image_url] : null;
        if (cached?.data) {
          const pad = 4;
          const boxW = CW - pad * 2, boxH = IH - pad * 2;
          const scale = Math.min(boxW / cached.w, boxH / cached.h);
          const dw = cached.w * scale, dh = cached.h * scale;
          const dx = x + pad + (boxW - dw) / 2;
          const dy = y + pad + (boxH - dh) / 2;
          try { doc.addImage(cached.data, "JPEG", dx, dy, dw, dh); } catch { /* */ }
        }
        if (p.badge === "oferta") {
          doc.setFillColor(...theme.saleColor);
          doc.roundedRect(x + 2, y + 2, 14, 4.5, 1, 1, "F");
          doc.setFontSize(6);
          doc.setTextColor(...WHITE);
          doc.setFont("helvetica", "bold");
          doc.text("OFERTA", x + 3.2, y + 5.2);
        } else if (p.badge === "nuevo") {
          doc.setFillColor(...theme.primary);
          doc.roundedRect(x + 2, y + 2, 13, 4.5, 1, 1, "F");
          doc.setFontSize(6);
          doc.setTextColor(...WHITE);
          doc.setFont("helvetica", "bold");
          doc.text("NUEVO", x + 3.2, y + 5.2);
        }
        let ty = y + IH + 5;
        doc.setTextColor(...theme.primary);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const maxNameLen = Math.floor(CW / 1.8);
        const name = p.name.length > maxNameLen ? p.name.substring(0, maxNameLen - 1) + "…" : p.name;
        doc.text(name.toUpperCase(), x + 1, ty);
        ty += 4;
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GRAY_LIGHT);
        const skuText = p.sku || "";
        const colorText = p.color ? `  ·  ${p.color}` : "";
        doc.text(skuText + colorText, x + 1, ty);
        ty += 5.5;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(p.badge === "oferta" ? theme.saleColor : theme.primary));
        doc.text(p.price ? formatCatalogPrice(p.price) : "—", x + 1, ty);
      }
      y += CH + RGAP;
    }
  }

  drawFooter();
  return doc;
}

/** Browser-only: carga las fotos con <img> + canvas y las reduce a maxDim px
 *  (JPEG 0.8, fondo blanco) antes de embeberlas. Las que fallan se saltan. */
export function loadCatalogImages(urls: string[], maxDim = CATALOG_PDF_IMG_PX): Promise<Record<string, CatalogImage>> {
  const out: Record<string, CatalogImage> = {};
  return Promise.all(urls.map((url) => new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        out[url] = { data: c.toDataURL("image/jpeg", 0.8), w, h };
      } catch { /* canvas tainted u otro fallo — se salta */ }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  }))).then(() => out);
}

/** Browser-only: pipeline completo — cargar imágenes, armar doc, descargar. */
export async function downloadCatalogPdf(
  opts: Omit<CatalogPdfOpts, "images"> & { filename: string },
): Promise<void> {
  const urls = [...new Set(
    opts.sections.flatMap((s) => s.items.map((i) => i.image_url)).filter((u): u is string => !!u),
  )];
  const images = await loadCatalogImages(urls);
  const doc = buildCatalogPdfDoc({ ...opts, images });
  doc.save(opts.filename);
}
