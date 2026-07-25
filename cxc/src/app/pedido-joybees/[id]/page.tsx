import PedidoPublicoClient from "@/components/catalogo/PedidoPublicoClient";

// Página permanente del pedido público Joybees (links vivos por WhatsApp —
// la URL /pedido-joybees/[short_id] NO cambia; el componente es compartido).
export default function PedidoJoybeesPage() {
  return <PedidoPublicoClient marca="joybees" />;
}
