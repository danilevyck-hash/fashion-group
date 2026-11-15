import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CatalogoPublicoPage from "@/components/catalogo/CatalogoPublicoPage";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { metadataCatalogoPublico } from "@/lib/catalogo/metadata-publica";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { leerCatalogoPublico } from "@/lib/catalogo/catalogo-publico-server";
import { CATALOGO_PUBLICO_DESDE_EL_SERVIDOR } from "@/lib/ui/velocidad-2026-11";

// velocidad-2026-11: la página se arma en cada visita CON los productos (la
// lectura sale de la misma caché que la ruta pública, invalidada por cada
// cambio del catálogo). Antes llegaba vacía y los pedía después: 6 s en el
// celular hasta la primera foto.
export const dynamic = "force-dynamic";

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

export default async function CatalogoPublicoMarcaPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  let inicial: unknown;
  const cfg = CATALOGO_PUBLICO_DESDE_EL_SERVIDOR ? getMarcaConfig(params.marca) : null;
  if (cfg) {
    try {
      inicial = await leerCatalogoPublico(cfg);
    } catch (err) {
      // Falla abierta: la página llega como antes y el navegador lo pide (con su «Reintentar»).
      console.error(`[catalogo-publico ${params.marca}]`, err);
    }
  }
  return <CatalogoPublicoPage marca={theme.marca} inicial={inicial} />;
}
