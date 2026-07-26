import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CatalogoPublicoPage from "@/components/catalogo/CatalogoPublicoPage";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { metadataCatalogoPublico } from "@/lib/catalogo/metadata-publica";

// Catálogo PÚBLICO compartible /catalogo-publico/[marca] — sin login. Los
// links vivos de WhatsApp (/catalogo-publico/reebok|joybees|tommy) resuelven
// aquí.

// Este es el link que se comparte por WhatsApp: sin esto heredaba el
// "Fashion Group" del layout raíz y la previsualización salía genérica en vez
// de decir la marca. El bloque completo (incluida la IMAGEN de la vista
// previa, que faltaba en las 3 marcas) vive en lib/catalogo/metadata-publica.
export function generateMetadata({ params }: { params: { marca: string } }): Metadata {
  return metadataCatalogoPublico(params.marca);
}

export default function CatalogoPublicoMarcaPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CatalogoPublicoPage marca={theme.marca} />;
}
