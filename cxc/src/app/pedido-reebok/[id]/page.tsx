import PedidoPublicoClient from "@/components/catalogo/PedidoPublicoClient";

// Página permanente del pedido público Reebok (links vivos por WhatsApp —
// la URL /pedido-reebok/[short_id] NO cambia; el componente es compartido).
export default function PedidoReebokPage() {
  return <PedidoPublicoClient marca="reebok" />;
}
