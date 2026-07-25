import PedidoPublicoClient from "@/components/catalogo/PedidoPublicoClient";

// Página permanente del pedido público Tommy Hilfiger (links vivos por
// WhatsApp — la URL /pedido-tommy/[short_id] NO cambia; el componente es
// compartido).
export default function PedidoTommyPage() {
  return <PedidoPublicoClient marca="tommy" />;
}
