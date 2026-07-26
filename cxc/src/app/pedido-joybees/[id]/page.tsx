import type { Metadata } from "next";
import PedidoPublicoClient from "@/components/catalogo/PedidoPublicoClient";
import { metadataPedidoPublico } from "@/lib/catalogo/metadata-publica";

// Página permanente del pedido público Joybees (links vivos por
// WhatsApp — la URL /pedido-joybees/[short_id] NO cambia; el componente es
// compartido).

// Este link lo reenvía el CLIENTE por WhatsApp. Sin esto heredaba el layout
// raíz y la vista previa le decía "Fashion Group · Sistema interno Fashion
// Group" — texto interno, en el teléfono del cliente.
export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return metadataPedidoPublico("joybees", params.id);
}

export default function PedidoJoybeesPage() {
  return <PedidoPublicoClient marca="joybees" />;
}
