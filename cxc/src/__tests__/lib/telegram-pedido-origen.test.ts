// Los avisos de Telegram de un pedido tienen que decir de DÓNDE viene: del link
// (el cliente lo armó solo → Switch contado + vendedor DEFAULT, sin comisión) o
// del vendedor (cliente y vendedor reales). Aplica a las 3 marcas.
import { describe, it, expect } from "vitest";
import {
  avisoPedidoDeVendedor,
  avisoPedidoDelLink,
  money,
} from "@/lib/catalogo/telegram-pedido";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

describe("avisos de Telegram: origen del pedido", () => {
  it("el del vendedor dice DEL VENDEDOR y nombra al vendedor", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒",
      label: "Reebok",
      vendedor: "REINALDO ESPINOSA",
      cliente: "Tienda La Estrella",
      total: 1234.5,
      numero: "PED-020",
    });
    expect(t).toContain("DEL VENDEDOR");
    expect(t).toContain("REINALDO ESPINOSA");
    expect(t).toContain("Tienda La Estrella");
    expect(t).toContain("$1,234.50");
    expect(t).toContain("PED-020");
    // No debe insinuar el otro camino.
    expect(t).not.toContain("DEL LINK");
    expect(t).not.toMatch(/comisión/i);
  });

  it("el del link dice DEL LINK y explica que entra contado y sin vendedor", () => {
    const t = avisoPedidoDelLink({
      label: "Tommy Hilfiger",
      cliente: "Zapatería Central",
      total: 980,
      numero: "TOM-002",
    });
    expect(t).toContain("DEL LINK");
    expect(t).toContain("lo confirmó el cliente");
    expect(t).toContain("Zapatería Central");
    expect(t).toContain("$980.00");
    expect(t).toContain("TOM-002");
    expect(t).toContain("Contado");
    expect(t).toMatch(/sin vendedor/i);
    expect(t).toMatch(/no paga comisión/i);
    expect(t).not.toContain("DEL VENDEDOR");
  });

  it("los dos avisos son distinguibles en su PRIMERA línea (se lee de un vistazo)", () => {
    const l1v = avisoPedidoDeVendedor({
      emoji: "🐝", label: "Joybees", vendedor: "DANIEL LEVY",
      cliente: "X", total: 10, numero: "JBP-006",
    }).split("\n")[0];
    const l1l = avisoPedidoDelLink({
      label: "Joybees", cliente: "X", total: 10, numero: "JBP-007",
    }).split("\n")[0];
    expect(l1v).not.toBe(l1l);
    expect(l1v).toMatch(/DEL VENDEDOR/);
    expect(l1l).toMatch(/DEL LINK/);
  });

  it("nombres vacíos no dejan huecos raros en el mensaje", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒", label: "Reebok", vendedor: "   ", cliente: null,
      total: 0, numero: "PED-021",
    });
    expect(t).toContain("Vendedor: sin nombre");
    expect(t).toContain("Cliente: Sin nombre");
    expect(avisoPedidoDelLink({ label: "Reebok", cliente: undefined, total: 0, numero: "PED-022" }))
      .toContain("Cliente: Sin nombre");
  });

  it("sirve para las 3 marcas con su emoji y label reales", () => {
    const marcas = Object.values(MARCAS_CONFIG);
    expect(marcas.length).toBe(3);
    for (const cfg of marcas) {
      const v = avisoPedidoDeVendedor({
        emoji: cfg.telegramEmoji, label: cfg.label, vendedor: "V",
        cliente: "C", total: 1, numero: "X-001",
      });
      expect(v.startsWith(cfg.telegramEmoji)).toBe(true);
      expect(v).toContain(cfg.label);
      expect(avisoPedidoDelLink({ label: cfg.label, cliente: "C", total: 1, numero: "X-002" }))
        .toContain(cfg.label);
    }
  });

  it("money mantiene el formato $#,##0.00 de siempre", () => {
    expect(money(0)).toBe("$0.00");
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(1000000)).toBe("$1,000,000.00");
  });

  it("son texto PLANO: sin HTML ni Markdown que sendTelegramAlert deba escapar", () => {
    const textos = [
      avisoPedidoDeVendedor({ emoji: "🛒", label: "Reebok", vendedor: "V", cliente: "C", total: 1, numero: "N" }),
      avisoPedidoDelLink({ label: "Reebok", cliente: "C", total: 1, numero: "N" }),
    ];
    for (const t of textos) {
      expect(t).not.toMatch(/[<>]/);
      expect(t).not.toMatch(/[*_`[\]]/);
    }
  });
});
