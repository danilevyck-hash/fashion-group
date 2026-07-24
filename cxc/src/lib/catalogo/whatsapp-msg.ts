// Builder ÚNICO del mensaje de WhatsApp de un pedido público (Reebok + Joybees).
//
// Desde la PARTE A del flujo público, WhatsApp es OPCIONAL y llega DESPUÉS de
// confirmar (el pedido ya tiene número PED-### / JBP-###). El mensaje es CORTO:
// resumen + link al detalle — nada de listar líneas (eso vive en la página del
// pedido). Reemplaza los builders inline que había en catalogo-publico/reebok y
// catalogo-publico/joybees.

export const WHATSAPP_PHONE = "50766745522";

export interface PedidoWhatsappInfo {
  /** Label para el cliente: "Reebok" | "Joybees". */
  marca: string;
  clienteNombre: string;
  /** Número asignado al confirmar: PED-013 / JBP-004. */
  numero: string;
  /** Cantidad de productos distintos (líneas). */
  itemCount: number;
  /** Total de bultos del pedido. */
  bultos: number;
  total: number;
  /** Link permanente al detalle (/pedido-reebok/abc123). */
  link: string;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPedidoWhatsappMsg(p: PedidoWhatsappInfo): string {
  const items = `${p.itemCount} ${p.itemCount === 1 ? "producto" : "productos"}`;
  const bultos = `${p.bultos} ${p.bultos === 1 ? "bulto" : "bultos"}`;
  return (
    `Hola, soy ${p.clienteNombre}. ` +
    `Pedido ${p.marca} #${p.numero}: ${items}, ${bultos}, Total $${fmtMoney(p.total)}. ` +
    `Detalle: ${p.link}`
  );
}

export function buildPedidoWhatsappUrl(p: PedidoWhatsappInfo): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(buildPedidoWhatsappMsg(p))}`;
}
