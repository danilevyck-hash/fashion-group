// Builder ÚNICO del mensaje de WhatsApp de un pedido público (las 3 marcas).
//
// Desde la PARTE A del flujo público, WhatsApp es OPCIONAL y llega DESPUÉS de
// confirmar (el pedido ya tiene número PED-### / JBP-### / TOM-###). El mensaje
// es CORTO: resumen + link al detalle — nada de listar líneas (eso vive en la
// página del pedido). Reemplaza los builders inline que había en
// catalogo-publico/reebok y catalogo-publico/joybees.

export interface WhatsappContacto {
  /** Nombre como lo conoce el cliente. */
  nombre: string;
  /** Número para wa.me: solo dígitos, con código de país (507). */
  telefono: string;
  /** Como se lee y se marca en Panamá. */
  telefonoLabel: string;
}

/** Las DOS personas a las que el cliente le puede avisar. Son las MISMAS en
 *  las 3 marcas y no hay una tercera (decisión de Daniel, 25-jul-2026). Antes
 *  el botón era genérico y siempre iba al número de Daniel. */
export const WHATSAPP_CONTACTOS: readonly WhatsappContacto[] = [
  { nombre: "Daniel", telefono: "50766745522", telefonoLabel: "6674-5522" },
  { nombre: "Rey", telefono: "50766156106", telefonoLabel: "6615-6106" },
] as const;

/** Número por defecto (Daniel) — el que usaba el botón único. */
export const WHATSAPP_PHONE = WHATSAPP_CONTACTOS[0].telefono;

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

import { precioTexto } from "@/lib/catalogo/precio";

// Mismo formato que la vitrina: `$4,422`, `$37.50`. Sin `.00`.
const fmtMoney = precioTexto;

export function buildPedidoWhatsappMsg(p: PedidoWhatsappInfo): string {
  const items = `${p.itemCount} ${p.itemCount === 1 ? "producto" : "productos"}`;
  const bultos = `${p.bultos} ${p.bultos === 1 ? "bulto" : "bultos"}`;
  return (
    `Hola, soy ${p.clienteNombre}. ` +
    `Pedido ${p.marca} #${p.numero}: ${items}, ${bultos}, Total $${fmtMoney(p.total)}. ` +
    `Detalle: ${p.link}`
  );
}

/** Link a wa.me. `telefono` = a quién le escribe el cliente (lo elige él entre
 *  WHATSAPP_CONTACTOS); si no se pasa, va al número por defecto. El MENSAJE es
 *  el mismo para cualquiera de los dos. */
export function buildPedidoWhatsappUrl(
  p: PedidoWhatsappInfo,
  telefono: string = WHATSAPP_PHONE,
): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(buildPedidoWhatsappMsg(p))}`;
}
