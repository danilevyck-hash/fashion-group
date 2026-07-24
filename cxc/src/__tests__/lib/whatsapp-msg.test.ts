// Tests del builder único del mensaje corto de WhatsApp (Reebok + Joybees).

import { describe, it, expect } from "vitest";
import {
  buildPedidoWhatsappMsg,
  buildPedidoWhatsappUrl,
  WHATSAPP_PHONE,
} from "@/lib/catalogo/whatsapp-msg";

const base = {
  marca: "Reebok",
  clienteNombre: "María",
  numero: "PED-013",
  itemCount: 3,
  bultos: 5,
  total: 1234.5,
  link: "https://www.fashiongr.com/pedido-reebok/abc12345",
};

describe("buildPedidoWhatsappMsg", () => {
  it("mensaje corto: resumen + link, sin listar líneas", () => {
    const msg = buildPedidoWhatsappMsg(base);
    expect(msg).toBe(
      "Hola, soy María. Pedido Reebok #PED-013: 3 productos, 5 bultos, Total $1,234.50. " +
        "Detalle: https://www.fashiongr.com/pedido-reebok/abc12345",
    );
    expect(msg).not.toContain("\n"); // una sola línea, nada de detalle
  });

  it("singular/plural correcto", () => {
    const msg = buildPedidoWhatsappMsg({ ...base, itemCount: 1, bultos: 1 });
    expect(msg).toContain("1 producto, 1 bulto,");
  });

  it("Joybees usa el mismo builder", () => {
    const msg = buildPedidoWhatsappMsg({
      ...base,
      marca: "Joybees",
      numero: "JBP-004",
      link: "https://www.fashiongr.com/pedido-joybees/zzz99999",
    });
    expect(msg).toContain("Pedido Joybees #JBP-004");
    expect(msg).toContain("/pedido-joybees/zzz99999");
  });
});

describe("buildPedidoWhatsappUrl", () => {
  it("apunta al número de la casa con el mensaje URL-encoded", () => {
    const url = buildPedidoWhatsappUrl(base);
    expect(url.startsWith(`https://wa.me/${WHATSAPP_PHONE}?text=`)).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toBe(buildPedidoWhatsappMsg(base));
  });
});
