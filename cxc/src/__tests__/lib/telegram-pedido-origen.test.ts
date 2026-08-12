// ─────────────────────────────────────────────────────────────────────────────
// Avisos de Telegram de pedidos de catálogo — LOS TRES EVENTOS, UN SOLO FORMATO.
//
// Daniel (11-ago-2026), textual: *"porq dos diferentes tipo de mensaje. y cada
// mensaje tiene que decir cuantas referencias, cuantos bultos, cliente y
// monto"*. Este archivo sostiene las dos mitades del pedido:
//
//   1. Las CUATRO cosas obligatorias — referencias · bultos · cliente · monto —
//      en TODO aviso de pedido, de los 3 eventos y las 3 marcas.
//   2. Un solo armador de cuerpo: los tres mensajes comparten las líneas de
//      quién y de cifras carácter por carácter, y los emisores reales usan los
//      builders (barrido estático) — así los formatos no pueden volver a
//      divergir como divergieron.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  avisoPedidoDeVendedor,
  avisoPedidoDelLink,
  avisoPedidoEnviado,
  money,
} from "@/lib/catalogo/telegram-pedido";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

// Datos con la forma del pedido REAL de la captura de Daniel (TOM-005:
// 8 referencias · 94 bultos · 1128 piezas · $16,920 · cliente Contado).
const RESUMEN = { referencias: 8, bultos: 94, piezas: 1128 };
const TOTAL = 16920;

const marcas = Object.values(MARCAS_CONFIG);

describe("avisos de pedido: las 4 obligatorias en TODO evento y TODA marca", () => {
  // referencias · bultos · cliente · monto (+ piezas, como el resto del sistema).
  const exigirLasCuatro = (t: string, cliente: string) => {
    expect(t).toContain("8 referencias");
    expect(t).toContain("94 bultos");
    expect(t).toContain("1128 piezas");
    expect(t).toContain(`Cliente: ${cliente}`);
    expect(t).toContain("$16,920");
  };

  it("hay exactamente 3 marcas en el motor", () => {
    expect(marcas.length).toBe(3);
  });

  for (const cfg of marcas) {
    it(`${cfg.label}: pedido DEL VENDEDOR dice las 4 cosas`, () => {
      const t = avisoPedidoDeVendedor({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        vendedor: "rey",
        cliente: "Contado",
        total: TOTAL,
        numero: "X-005",
        resumen: RESUMEN,
      });
      exigirLasCuatro(t, "Contado");
      expect(t).toContain("Vendedor: rey");
      expect(t.startsWith(`${cfg.telegramEmoji} ${cfg.label} · X-005 — pedido DEL VENDEDOR`)).toBe(true);
    });

    it(`${cfg.label}: pedido DEL LINK dice las 4 cosas`, () => {
      const t = avisoPedidoDelLink({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        cliente: "Zapatería Central",
        total: TOTAL,
        numero: "X-006",
        resumen: RESUMEN,
      });
      exigirLasCuatro(t, "Zapatería Central");
      expect(t.startsWith(`${cfg.telegramEmoji} ${cfg.label} · X-006 — pedido DEL LINK, lo confirmó el cliente`)).toBe(true);
      // Lo que diferencia al link: cómo entra a Switch (sin comisión) y que NO
      // nombra un vendedor que no existe.
      expect(t).toContain("Entra a Switch como Contado y sin vendedor — no paga comisión.");
      expect(t).not.toContain("Vendedor:");
    });

    it(`${cfg.label}: ENVIADO A SWITCH dice las 4 cosas (el evento que antes no las decía)`, () => {
      const t = avisoPedidoEnviado({
        label: cfg.label,
        numero: "X-002",
        cliente: "Contado",
        vendedor: "REINALDO ESPINOSA",
        total: TOTAL,
        resumen: RESUMEN,
        numeroSwitch: "16-000002012",
        verificado: true,
      });
      exigirLasCuatro(t, "Contado");
      expect(t).toContain("Vendedor: REINALDO ESPINOSA");
      expect(t.startsWith(`📦 ${cfg.label} · X-002 — enviado a Switch`)).toBe(true);
      // El link al secuencial de Switch se conserva, con su verificación.
      expect(t).toContain("→ Switch 16-000002012 ✓ verificado");
    });
  }
});

describe("un solo formato: el mismo pedido se lee avanzando", () => {
  const base = { cliente: "Contado", total: TOTAL, resumen: RESUMEN } as const;
  const cfg = MARCAS_CONFIG.tommy;
  const creado = avisoPedidoDeVendedor({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: "TOM-005", vendedor: "rey", ...base,
  });
  const delLink = avisoPedidoDelLink({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: "TOM-005", ...base,
  });
  const enviado = avisoPedidoEnviado({
    label: cfg.label, numero: "TOM-005", vendedor: "rey",
    numeroSwitch: "16-000002012", verificado: true, ...base,
  });

  it("la línea de cifras es IDÉNTICA carácter por carácter en los 3 eventos", () => {
    const cifras = "8 referencias · 94 bultos · 1128 piezas · $16,920";
    expect(creado.split("\n")[2]).toBe(cifras);
    expect(delLink.split("\n")[2]).toBe(cifras);
    expect(enviado.split("\n")[2]).toBe(cifras);
  });

  it("la línea de quién es idéntica entre creado y enviado (el link no inventa vendedor)", () => {
    const quien = "Cliente: Contado · Vendedor: rey";
    expect(creado.split("\n")[1]).toBe(quien);
    expect(enviado.split("\n")[1]).toBe(quien);
    expect(delLink.split("\n")[1]).toBe("Cliente: Contado");
  });

  it("las primeras líneas comparten forma `<emoji> Marca · NUM — etapa` y difieren SOLO en emoji/etapa", () => {
    const forma = /^\S+ Tommy Hilfiger · TOM-005 — .+$/;
    for (const t of [creado, delLink, enviado]) {
      expect(t.split("\n")[0]).toMatch(forma);
    }
    // Etapas distinguibles de un vistazo…
    expect(creado.split("\n")[0]).toContain("pedido DEL VENDEDOR");
    expect(delLink.split("\n")[0]).toContain("DEL LINK");
    expect(enviado.split("\n")[0]).toContain("enviado a Switch");
    // …y el avance de etapa cambia el emoji: marca → 📦.
    expect(creado.startsWith("🔵")).toBe(true);
    expect(enviado.startsWith("📦")).toBe(true);
  });

  it("sin verificar lo dice, sin esconder el secuencial", () => {
    const t = avisoPedidoEnviado({
      label: "Reebok", numero: "PED-020", cliente: "C", vendedor: "V",
      total: 10, resumen: { referencias: 1, bultos: 1, piezas: 12 },
      numeroSwitch: "05-000000123", verificado: false,
    });
    expect(t).toContain("→ Switch 05-000000123 ⚠️ sin verificar");
  });
});

describe("bordes del formato", () => {
  it("singular: 1 referencia · 1 bulto · 1 pieza", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒", label: "Reebok", vendedor: "V", cliente: "C",
      total: 38, numero: "PED-030", resumen: { referencias: 1, bultos: 1, piezas: 1 },
    });
    expect(t).toContain("1 referencia · 1 bulto · 1 pieza · $38");
    expect(t).not.toContain("1 referencias");
  });

  it("sin resumen NO se inventan ceros: queda solo el monto (y las demás obligatorias)", () => {
    const t = avisoPedidoEnviado({
      label: "Joybees", numero: "JBP-001", cliente: "C", vendedor: "V",
      total: 500, numeroSwitch: "10-000000001", verificado: true,
    });
    expect(t.split("\n")[2]).toBe("$500");
    expect(t).not.toContain("0 referencias");
    expect(t).not.toContain("0 bultos");
  });

  it("nombres vacíos no dejan huecos raros", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒", label: "Reebok", vendedor: "   ", cliente: null,
      total: 0, numero: "PED-021",
    });
    expect(t).toContain("Cliente: Sin nombre · Vendedor: sin nombre");
  });

  // 26-jul-2026: los montos de catálogo no muestran `.00` (regla de Daniel,
  // src/lib/catalogo/precio.ts). Miles sí; medio dólar conserva decimales.
  it("money usa el formato de precio de catálogo: miles sí, `.00` no", () => {
    expect(money(0)).toBe("$0");
    expect(money(980)).toBe("$980");
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(1000000)).toBe("$1,000,000");
  });

  it("son texto PLANO: sin HTML ni Markdown que el canal deba escapar", () => {
    const textos = [
      avisoPedidoDeVendedor({ emoji: "🛒", label: "Reebok", vendedor: "V", cliente: "C", total: 1, numero: "N", resumen: RESUMEN }),
      avisoPedidoDelLink({ emoji: "🐝", label: "Joybees", cliente: "C", total: 1, numero: "N", resumen: RESUMEN }),
      avisoPedidoEnviado({ label: "Tommy Hilfiger", numero: "N", cliente: "C", vendedor: "V", total: 1, resumen: RESUMEN, numeroSwitch: "16-1", verificado: true }),
    ];
    for (const t of textos) {
      expect(t).not.toMatch(/[<>]/);
      expect(t).not.toMatch(/[*_`[\]]/);
    }
  });
});

describe("barrido estático: los emisores usan los builders y el canal de negocio", () => {
  const src = (rel: string) =>
    readFileSync(path.join(process.cwd(), "src", rel), "utf8");

  it("switch-envio.ts arma el aviso con avisoPedidoEnviado, no inline", () => {
    const s = src("lib/catalogo/switch-envio.ts");
    expect(s).toContain("avisoPedidoEnviado(");
    // El texto viejo, armado a mano, no puede volver.
    expect(s).not.toContain("enviado a Switch →");
  });

  it("la creación del vendedor usa avisoPedidoDeVendedor por enviarNegocio", () => {
    const s = src("app/api/catalogo/[marca]/orders/route.ts");
    expect(s).toContain("avisoPedidoDeVendedor(");
    expect(s).toContain("enviarNegocio(");
    expect(s).not.toContain("sendTelegramAlert");
  });

  it("la confirmación del link usa avisoPedidoDelLink por enviarNegocio", () => {
    const s = src("app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts");
    expect(s).toContain("avisoPedidoDelLink(");
    expect(s).toContain("enviarNegocio(");
    expect(s).not.toContain("sendTelegramAlert");
  });

  it("los 3 emisores mandan el resumen COMPLETO (bultos incluidos)", () => {
    // Si alguien vuelve a pasar solo {referencias, piezas}, el aviso pierde los
    // bultos en silencio (ResumenAviso es opcional). Se exige la palabra.
    expect(src("app/api/catalogo/[marca]/orders/route.ts")).toMatch(/resumen:\s*\{[^}]*bultos/);
    expect(src("app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts")).toMatch(/bultos:\s*resumenLink\.bultos/);
    expect(src("lib/catalogo/switch-envio.ts")).toContain("resumirPedido(");
  });
});
