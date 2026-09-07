import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RevisarPedidoPublico from "@/components/catalogo/RevisarPedidoPublico";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { metadataCatalogoPublico } from "@/lib/catalogo/metadata-publica";

// El cliente REVISA su pedido antes de confirmarlo (7-sep-2026).
// Cuelga de /catalogo-publico/[marca], así que hereda sin tocar nada las dos
// listas de `lib/catalogo/rutas-publicas`: ni barra lateral, ni prompt de
// instalar el ERP interno.
//
// La metadata es la MISMA del catálogo: es la misma marca y la misma vista
// previa. Nadie comparte este link (se llega desde el carrito), pero heredar el
// "Fashion Group · Sistema interno" del layout raíz es justo lo que se arregló
// en jul-2026 para las otras pantallas del cliente.

export function generateMetadata({ params }: { params: { marca: string } }): Metadata {
  return metadataCatalogoPublico(params.marca);
}

export default function RevisarPedidoPublicoPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <RevisarPedidoPublico marca={theme.marca} />;
}
