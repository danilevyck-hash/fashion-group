/**
 * Candado del correo de pedido de catálogo — es lo que lee el CLIENTE, casi
 * siempre en el teléfono.
 *
 * Hallazgos del 26-jul-2026 que este test congela:
 *   - Faltaban tildes: "catalogo", "A continuacion", "aun", "automaticamente".
 *   - Sin `<meta viewport>` ni media query el correo medía 524 px dentro de una
 *     pantalla de 375 → la columna Subtotal salía cortada.
 *   - `display:flex` en el rótulo de sección (Outlook y Gmail lo ignoran).
 *   - El nombre del producto se interpolaba crudo dentro de `alt="…"`.
 */
import { describe, it, expect } from "vitest";
import { buildOrderEmailHtml, escapeHtml, type OrderEmailItem } from "@/lib/catalogo/order-email";

const items: OrderEmailItem[] = [
  { sku: "REE-1", name: "NANO X4 TRAINING", quantity: 2, unit_price: 21.87, image_url: "", category: "footwear" },
  { sku: "REE-2", name: "CAMISETA IDENTITY", quantity: 1, unit_price: 12.5, image_url: "", category: "apparel", is_preorder: true },
];

const base = {
  marcaLabel: "Reebok",
  headerHtml: `<div style="background:#1a1a1a"></div>`,
  tableHeadBg: "#1a1a1a",
  itemsHasPreorder: true,
  items,
  bultoSize: () => 12,
  comment: null as string | null,
  totalBultos: 3,
  totalPiezas: 36,
  total: 999.5,
};

describe("correo de pedido — español", () => {
  const html = buildOrderEmailHtml(base);

  it("lleva las tildes correctas", () => {
    expect(html).toContain("del catálogo Reebok");
    expect(html).toContain("aún no tienen stock");
    // "A continuación el detalle" y el pie "generado automáticamente" se PODARON
    // (12-ago-2026) — la tabla está justo debajo y el equipo no recibe pedidos de
    // ningún otro lado. Sus tildes ya no se pueden verificar acá porque los
    // textos no existen; el candado de que no vuelvan vive en
    // lib/poda-textos-cxc-multifashion.test.ts.
    expect(html).toContain("Total: 3 bultos (36 piezas)");
  });

  it("no quedó ninguna palabra sin tilde de las que estaban mal", () => {
    for (const mala of ["catalogo ", "continuacion", "automaticamente", "aun no tienen"]) {
      expect(html.toLowerCase()).not.toContain(mala);
    }
  });

  it("no usa 'items' en inglés en el texto visible", () => {
    expect(html).toMatch(/\d+ artículos?</);
    expect(html).not.toMatch(/>\s*\d+ items?\s*</);
  });
});

describe("correo de pedido — móvil y compatibilidad", () => {
  const html = buildOrderEmailHtml(base);

  it("es un documento completo con viewport (si no, no escala en el teléfono)", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });

  it("tiene media queries para 480px y 360px", () => {
    expect(html).toContain("max-width:480px");
    expect(html).toContain("max-width:360px");
  });

  it("no usa flexbox (Outlook y Gmail lo ignoran)", () => {
    expect(html).not.toContain("display:flex");
  });

  it("los montos van con separador de miles y 2 decimales", () => {
    const conMiles = buildOrderEmailHtml({ ...base, total: 17993.28 });
    expect(conMiles).toContain("$17,993.28");
    expect(conMiles).toContain("$21.87");
  });
});

describe("correo de pedido — escapado", () => {
  it("escapa comillas y < > del nombre del producto", () => {
    const html = buildOrderEmailHtml({
      ...base,
      items: [{ ...items[0], name: 'ZAPATO "PRO" <b>', image_url: "https://x/y.jpg" }],
    });
    expect(html).toContain("&quot;PRO&quot;");
    expect(html).not.toContain('<b>ZAPATO');
    expect(html).not.toContain('alt="ZAPATO "PRO"');
  });

  it("escapa la nota del pedido", () => {
    const html = buildOrderEmailHtml({ ...base, comment: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapeHtml cubre los 5 caracteres", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("correo de pedido — secciones por marca", () => {
  it("Reebok separa Pedido y Pre-orden", () => {
    const html = buildOrderEmailHtml(base);
    expect(html).toContain(">Pedido<");
    expect(html).toContain(">Pre-orden<");
  });

  it("Joybees/Tommy van en una sola tabla, sin pre-orden", () => {
    const html = buildOrderEmailHtml({ ...base, marcaLabel: "Tommy Hilfiger", itemsHasPreorder: false });
    expect(html).not.toContain(">Pre-orden<");
    expect(html).toContain("del catálogo Tommy Hilfiger");
  });
});
