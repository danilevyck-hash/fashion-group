import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CatalogoPublicoPage from "@/components/catalogo/CatalogoPublicoPage";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

// Catálogo PÚBLICO compartible /catalogo-publico/[marca] — sin login. Los
// links vivos de WhatsApp (/catalogo-publico/reebok|joybees|tommy) resuelven
// aquí.

// Este es el link que se comparte por WhatsApp: sin esto heredaba el
// "Fashion Group" del layout raíz y la previsualización salía genérica en vez
// de decir la marca. Mismo patrón que /catalogo/[marca]/layout.tsx, más
// openGraph porque WhatsApp lee og:title/og:description antes que el <title>.
export function generateMetadata({ params }: { params: { marca: string } }): Metadata {
  const theme = getMarcaTheme(params.marca);
  if (!theme) return {};
  return {
    title: theme.metaTitle,
    description: theme.metaDescription,
    openGraph: {
      title: theme.metaTitle,
      description: theme.metaDescription,
      url: theme.publicoShareUrl,
      siteName: theme.label,
      locale: "es_PA",
      type: "website",
    },
  };
}

export default function CatalogoPublicoMarcaPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CatalogoPublicoPage marca={theme.marca} />;
}
