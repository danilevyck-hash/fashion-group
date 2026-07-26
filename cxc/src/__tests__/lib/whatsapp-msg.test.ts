// Tests del builder único del mensaje corto de WhatsApp (las 3 marcas) y del
// selector de a QUIÉN le avisa el cliente.

import { describe, it, expect } from "vitest";
import {
  buildPedidoWhatsappMsg,
  buildPedidoWhatsappUrl,
  WHATSAPP_PHONE,
  WHATSAPP_CONTACTOS,
} from "@/lib/catalogo/whatsapp-msg";
import { readFileSync } from "fs";
import path from "path";

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
  it("sin destinatario explícito apunta al número por defecto", () => {
    const url = buildPedidoWhatsappUrl(base);
    expect(url.startsWith(`https://wa.me/${WHATSAPP_PHONE}?text=`)).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toBe(buildPedidoWhatsappMsg(base));
  });

  it("el destinatario cambia el número pero NO el mensaje", () => {
    const mensajes = WHATSAPP_CONTACTOS.map((c) => {
      const url = buildPedidoWhatsappUrl(base, c.telefono);
      expect(url.startsWith(`https://wa.me/${c.telefono}?text=`), c.nombre).toBe(true);
      return decodeURIComponent(url.split("?text=")[1]);
    });
    expect(new Set(mensajes).size).toBe(1);
    expect(mensajes[0]).toBe(buildPedidoWhatsappMsg(base));
  });
});

describe("WHATSAPP_CONTACTOS — exactamente dos personas, iguales en las 3 marcas", () => {
  it("son Daniel 6674-5522 y Rey 6615-6106, y solo esos dos", () => {
    expect(WHATSAPP_CONTACTOS).toHaveLength(2);
    expect(WHATSAPP_CONTACTOS.map((c) => c.nombre)).toEqual(["Daniel", "Rey"]);
    expect(WHATSAPP_CONTACTOS.map((c) => c.telefono)).toEqual(["50766745522", "50766156106"]);
    expect(WHATSAPP_CONTACTOS.map((c) => c.telefonoLabel)).toEqual(["6674-5522", "6615-6106"]);
  });

  it("cada número es solo dígitos con el 507 adelante (formato wa.me)", () => {
    for (const c of WHATSAPP_CONTACTOS) {
      expect(c.telefono, c.nombre).toMatch(/^507\d{8}$/);
      // El label es el mismo número, sin el país y con el guión de Panamá.
      expect(c.telefonoLabel.replace("-", ""), c.nombre).toBe(c.telefono.slice(3));
    }
  });

  it("la página del pedido (única para las 3 marcas) recorre la lista, no un número fijo", () => {
    const PAGINA = readFileSync(
      path.join(process.cwd(), "src/components/catalogo/PedidoPublicoClient.tsx"),
      "utf8",
    );
    expect(PAGINA).toContain("WHATSAPP_CONTACTOS.map");
    // Ni el número ni el botón genérico viejo pueden volver al componente.
    for (const c of WHATSAPP_CONTACTOS) expect(PAGINA).not.toContain(c.telefono);
    expect(PAGINA).not.toContain(">Avisar por WhatsApp<");
  });
});
