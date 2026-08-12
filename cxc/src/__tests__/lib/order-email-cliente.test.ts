// El correo de pedido que le llega AL CLIENTE.
//
// Bug arreglado el 26-jul-2026: `send-order` sirve a dos botones del detalle
// de pedido — "Confirmar pedido" (sin clientEmail → aviso interno) y "Enviar
// por email al cliente" (con clientEmail → le llega al mayorista) — y los dos
// mandaban el MISMO correo, escrito para adentro. El cliente recibía
// "Estimado equipo Fashion Group" y la instrucción de no mezclar en bodega.
//
// Estos tests fijan las dos cosas que importan:
//   1. El correo al cliente no tiene jerga interna y sí tiene lo que él
//      necesita: gracias, qué pidió, por cuánto y qué pasa ahora.
//   2. La MAQUETA es la misma para las dos audiencias — así el arreglo de
//      ancho de 375 px del PR #310 no se puede romper en una sola versión.

import { describe, it, expect } from "vitest";
import { buildOrderEmailHtml, type OrderEmailItem } from "@/lib/catalogo/order-email";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

const items: OrderEmailItem[] = [
  { sku: "FM0FM05436BDS", name: "Camisa Oxford", quantity: 4, unit_price: 17.5, image_url: "", category: "apparel" },
  { sku: "GY9748", name: "Club C 85", quantity: 6, unit_price: 35, image_url: "", category: "footwear" },
];
const preorden: OrderEmailItem = {
  sku: "100074281", name: "Nano X4", quantity: 5, unit_price: 48,
  image_url: "", is_preorder: true, category: "footwear",
};

const base = {
  marcaLabel: "Tommy Hilfiger",
  headerHtml: "<div>BANDA</div>",
  tableHeadBg: "#152342",
  itemsHasPreorder: false,
  items,
  bultoSize: () => 12,
  comment: null,
  totalBultos: 10,
  totalPiezas: 120,
  total: 4422,
};

const cliente = (extra: Partial<Parameters<typeof buildOrderEmailHtml>[0]> = {}) =>
  buildOrderEmailHtml({ ...base, audiencia: "cliente", clientName: "Comercial El Machetazo, S.A.", ...extra });

describe("correo al cliente — nada de jerga interna", () => {
  it("no le habla al equipo ni menciona la bodega", () => {
    const html = cliente({ itemsHasPreorder: true, items: [...items, preorden] });
    expect(html).not.toContain("Estimado equipo Fashion Group");
    expect(html).not.toContain("bodega");
    expect(html).not.toContain("Se ha recibido un nuevo pedido");
    expect(html).not.toContain("generado automáticamente");
  });

  it("la nota de pre-orden se la explica al cliente, sin instrucción de bodega", () => {
    const html = cliente({ itemsHasPreorder: true, items: [...items, preorden] });
    expect(html).toContain("todavía no están en stock");
    expect(html).toContain("Te avisamos apenas lleguen");
    expect(html).not.toContain("No deben mezclarse");
  });
});

describe("correo al cliente — lo que sí tiene que decir", () => {
  it("lo saluda por su nombre", () => {
    expect(cliente()).toContain("Hola <strong>Comercial El Machetazo, S.A.</strong>");
  });

  it("le confirma qué pidió y por cuánto", () => {
    const html = cliente();
    expect(html).toContain("Recibimos tu pedido del catálogo Tommy Hilfiger");
    expect(html).toContain("Camisa Oxford");
    expect(html).toContain("$17.50");
    // Sin `.00`: el correo usa el formato de precio de los catálogos.
    expect(html).toContain("Total: 10 bultos (120 piezas) — $4,422");
    expect(html).not.toContain("$4,422.00");
  });

  it("le avisa del PDF adjunto y le dice qué pasa ahora", () => {
    const html = cliente();
    expect(html).toContain("adjuntamos en PDF");
    expect(html).toContain("¿Qué sigue?");
    expect(html).toContain("Un vendedor de Fashion Group te contacta");
    expect(html).toContain("responde este correo");
  });

  it("el pie identifica a Fashion Group con un correo real", () => {
    expect(cliente()).toContain("pedidos@fashiongr.com");
  });

  it("sin nombre de cliente no imprime un saludo vacío", () => {
    const html = buildOrderEmailHtml({ ...base, audiencia: "cliente" });
    expect(html).not.toContain("Hola <strong></strong>");
    expect(html).toContain("Recibimos tu pedido");
  });

  it("escapa el nombre del cliente (un `<` no puede romper el correo)", () => {
    const html = cliente({ clientName: 'Tienda "El <b>Rey</b>"' } as never);
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>Rey</b>");
  });
});

describe("correo al equipo — no se tocó", () => {
  it("sigue siendo el default cuando nadie pasa audiencia", () => {
    const html = buildOrderEmailHtml(base);
    expect(html).toContain("Estimado equipo Fashion Group");
    expect(html).toContain("Se ha recibido un nuevo pedido del catálogo Tommy Hilfiger");
    // El pie "generado automáticamente desde fashiongr.com" se PODÓ (12-ago-2026):
    // al equipo los pedidos no le llegan de ningún otro lado. El pie del correo
    // al CLIENTE sí se queda (lo fija el bloque de arriba de este archivo).
    expect(html).not.toContain("generado automáticamente");
    expect(html).not.toContain("¿Qué sigue?");
  });

  it("conserva la instrucción de bodega en la nota de pre-orden", () => {
    const html = buildOrderEmailHtml({ ...base, itemsHasPreorder: true, items: [...items, preorden] });
    expect(html).toContain("No deben mezclarse con el pedido regular en bodega");
  });
});

describe("la maqueta es la MISMA para las dos audiencias (candado del ancho de 375 px)", () => {
  it("las dos versiones traen doctype, viewport y las dos media queries", () => {
    for (const html of [buildOrderEmailHtml(base), cliente()]) {
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain('name="viewport"');
      expect(html).toContain("max-width:480px");
      expect(html).toContain("max-width:360px");
      expect(html).toContain("class=\"fg-items\"");
      expect(html).toContain("class=\"fg-pad\"");
      // Gmail/Outlook ignoran flex — la maqueta no puede depender de él.
      expect(html).not.toContain("display:flex");
    }
  });

  it("la TABLA de productos es byte a byte idéntica en las dos", () => {
    const tabla = (html: string) => {
      const i = html.indexOf('<table class="fg-items"');
      return html.slice(i, html.indexOf("</table>", i));
    };
    expect(tabla(cliente())).toBe(tabla(buildOrderEmailHtml(base)));
  });
});

describe("paridad de las 3 marcas — banda del correo al cliente", () => {
  const marcas = ["reebok", "joybees", "tommy"] as const;

  it("las 3 definen headerClienteHtml", () => {
    for (const m of marcas) {
      expect(typeof MARCAS_CONFIG[m].sendOrder.headerClienteHtml, m).toBe("function");
    }
  });

  it("las 3 agradecen y muestran número de pedido y fecha", () => {
    for (const m of marcas) {
      const banda = MARCAS_CONFIG[m].sendOrder.headerClienteHtml("PED-0421", "26 de julio de 2026");
      expect(banda, m).toContain("Gracias por tu pedido");
      expect(banda, m).toContain("PED-0421");
      expect(banda, m).toContain("26 de julio de 2026");
      // La banda al cliente NO repite lo interno del aviso al equipo.
      expect(banda, m).not.toContain("Fashion Group · Panama —");
    }
  });

  it("cada marca conserva su color y su logo", () => {
    const esperado = {
      reebok: ["#1a1a1a", "reebok-logo.png"],
      joybees: ["#1a2656", "joybees-logo-blanco.png"],
      tommy: ["#152342", "tommy-horizontal-blanco.png"],
    };
    for (const m of marcas) {
      const banda = MARCAS_CONFIG[m].sendOrder.headerClienteHtml("X-1", "hoy");
      for (const frag of esperado[m]) expect(banda, m).toContain(frag);
    }
  });
});
