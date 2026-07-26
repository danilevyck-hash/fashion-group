// ─────────────────────────────────────────────────────────────────────────────
// Metadata de las páginas PÚBLICAS de catálogo (lo que WhatsApp muestra como
// vista previa cuando alguien manda el link). Fuente ÚNICA para las 4 rutas
// públicas y las 3 marcas: /catalogo-publico/[marca] y /pedido-<marca>/[id].
//
// Por qué existe:
//   · El catálogo declaraba og:title/og:description/og:url pero NUNCA una
//     imagen → la vista previa salía como un bloque de texto pelado.
//   · Las 3 páginas /pedido-<marca>/[id] no declaraban NADA, así que heredaban
//     el layout raíz y al cliente le llegaba, en su propio WhatsApp,
//     "Fashion Group — Sistema interno Fashion Group".
//
// Las URLs son ABSOLUTAS a propósito (ver nota de `ogImage` en marcas-ui).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { getMarcaTheme } from "./marcas-ui";

/** Dominio público de los links que se comparten. Debe coincidir con
 *  `publicoShareUrl` / `pedidoPublicoBase` del tema: si el og:url apunta a un
 *  host distinto del que abre el cliente, el scraper vuelve a pedir la página
 *  cruzando un redirect. */
export const DOMINIO_PUBLICO = "https://www.fashiongr.com";

function base(theme: NonNullable<ReturnType<typeof getMarcaTheme>>, titulo: string, desc: string, url: string): Metadata {
  return {
    title: titulo,
    description: desc,
    openGraph: {
      title: titulo,
      description: desc,
      url,
      siteName: "Fashion Group",
      locale: "es_PA",
      type: "website",
      images: [{ url: theme.ogImage, width: 1200, height: 630, alt: theme.metaTitle }],
    },
    // Algunos previsualizadores (y WhatsApp en ciertos fallbacks) leen las
    // etiquetas de Twitter antes que las de Open Graph.
    twitter: { card: "summary_large_image", title: titulo, description: desc, images: [theme.ogImage] },
  };
}

/** /catalogo-publico/[marca] — el link que el vendedor manda por WhatsApp. */
export function metadataCatalogoPublico(marca: string): Metadata {
  const theme = getMarcaTheme(marca);
  if (!theme) return {};
  return base(theme, theme.metaTitle, theme.metaDescription, theme.publicoShareUrl);
}

/** /pedido-<marca>/[id] — el link del pedido, que reenvía el CLIENTE.
 *  A propósito NO lleva datos del pedido (ni nombre, ni total): la vista
 *  previa de WhatsApp la ve cualquiera a quien le reenvíen el mensaje. */
export function metadataPedidoPublico(marca: string, shortId: string): Metadata {
  const theme = getMarcaTheme(marca);
  if (!theme) return {};
  const titulo = `Tu pedido ${theme.label}`;
  const desc = `Detalle de tu pedido ${theme.label} — Fashion Group Panamá.`;
  return base(theme, titulo, desc, `${DOMINIO_PUBLICO}${theme.pedidoPublicoBase}/${shortId}`);
}
