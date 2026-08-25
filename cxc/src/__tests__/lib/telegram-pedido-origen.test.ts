// ─────────────────────────────────────────────────────────────────────────────
// Avisos de Telegram de pedidos de catálogo — LOS TRES EVENTOS, UN SOLO
// FORMATO, DOS LÍNEAS.
//
// 🔴 25-ago-2026 — ESTE CANDADO CAMBIÓ DE DIRECCIÓN. Hasta hoy exigía CUATRO
// cifras en todo aviso (referencias · bultos · cliente · monto) y los rótulos
// "Cliente:"/"Vendedor:". Daniel podó el aviso, textual: ***"lo quiero más
// simple… solo quiero lo útil"***, y eligió el formato exacto:
//
//   📝 Cotización TOM-027 · A-Amani, S.A.
//   Tommy Hilfiger · $648 · 12 piezas · Switch 15-000000123
//
//   📦 Pedido TOM-028 · Hafez, S.A.
//   Tommy Hilfiger · $2,760 · 48 piezas · Switch 16-000002058
//
// Lo que este archivo sostiene AHORA:
//   1. Las dos líneas y su contenido: línea 1 = qué + de quién, línea 2 = marca
//      + monto + piezas + N° de Switch (el monto en la SEGUNDA, lo puso ahí él).
//   2. Que lo podado NO VUELVA: "no aparta mercancía", "✓ verificado", la etapa
//      deletreada, los rótulos "Cliente:"/"Vendedor:", el vendedor entero, y el
//      recuento de referencias y bultos.
//   3. Un solo armador de cuerpo, y que los emisores reales usen los builders
//      (barrido estático) — así los formatos no pueden volver a divergir.
//   4. Que el aviso de ERROR conserve su detalle: la poda es solo del éxito.
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

const PIEZAS = 1128;
const TOTAL = 16920;

const marcas = Object.values(MARCAS_CONFIG);

/** Lo que Daniel sacó del aviso, en un solo lugar: ninguno puede reaparecer. */
const PODADO = [
  "No aparta mercancía",
  "✓ verificado",
  "Cliente:",
  "Vendedor:",
  "referencias",
  "bultos",
  "COTIZACIÓN enviada a Switch",
];

const sinLoPodado = (t: string) => {
  for (const frase of PODADO) expect(t).not.toContain(frase);
};

describe("el formato de DOS LÍNEAS, en los 3 eventos y las 4 marcas", () => {
  it("hay exactamente 4 marcas en el motor", () => {
    expect(marcas.length).toBe(4);
  });

  for (const cfg of marcas) {
    it(`${cfg.label}: pedido DEL VENDEDOR — 2 líneas, sin N° de Switch (todavía no salió)`, () => {
      const t = avisoPedidoDeVendedor({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        cliente: "A-Amani, S.A.",
        total: TOTAL,
        numero: "X-005",
        piezas: PIEZAS,
      });
      expect(t.split("\n")).toEqual([
        `${cfg.telegramEmoji} Pedido X-005 · A-Amani, S.A.`,
        `${cfg.label} · $16,920 · 1128 piezas`,
      ]);
      sinLoPodado(t);
    });

    it(`${cfg.label}: pedido DEL LINK — mismas 2 líneas + la acción pendiente`, () => {
      const t = avisoPedidoDelLink({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        cliente: "Zapatería Central",
        total: TOTAL,
        numero: "X-006",
        piezas: PIEZAS,
      });
      expect(t.split("\n")).toEqual([
        `${cfg.telegramEmoji} Pedido X-006 · Zapatería Central`,
        `${cfg.label} · $16,920 · 1128 piezas`,
        // 🔴 NO ES EXPLICACIÓN, ES UNA ACCIÓN PENDIENTE. Desde el 14-ago-2026
        // el pedido del link espera a una persona: es lo único que hay entre el
        // pedido y el ERP, y sin decirlo se queda quieto y nadie se entera.
        "Falta ponerle el cliente y mandarlo a Switch — está en Borradores.",
      ]);
      sinLoPodado(t);
    });

    it(`${cfg.label}: PEDIDO enviado a Switch — 📦 + N° de Switch, sin "verificado"`, () => {
      const t = avisoPedidoEnviado({
        label: cfg.label,
        numero: "TOM-028",
        cliente: "Hafez, S.A.",
        total: 2760,
        piezas: 48,
        numeroSwitch: "16-000002058",
        verificado: true,
      });
      expect(t.split("\n")).toEqual([
        "📦 Pedido TOM-028 · Hafez, S.A.",
        `${cfg.label} · $2,760 · 48 piezas · Switch 16-000002058`,
      ]);
      sinLoPodado(t);
    });

    it(`${cfg.label}: COTIZACIÓN enviada a Switch — 📝 y la palabra «Cotización»`, () => {
      const t = avisoPedidoEnviado({
        label: cfg.label,
        numero: "TOM-027",
        cliente: "A-Amani, S.A.",
        total: 648,
        piezas: 12,
        numeroSwitch: "15-000000123",
        verificado: true,
        documento: "cotizacion",
      });
      expect(t.split("\n")).toEqual([
        "📝 Cotización TOM-027 · A-Amani, S.A.",
        `${cfg.label} · $648 · 12 piezas · Switch 15-000000123`,
      ]);
      sinLoPodado(t);
    });
  }
});

describe("el formato exacto que eligió Daniel, carácter por carácter", () => {
  it("la cotización de la captura", () => {
    expect(
      avisoPedidoEnviado({
        label: "Tommy Hilfiger", numero: "TOM-027", cliente: "A-Amani, S.A.",
        total: 648, piezas: 12, numeroSwitch: "15-000000123", verificado: true,
        documento: "cotizacion",
      }),
    ).toBe("📝 Cotización TOM-027 · A-Amani, S.A.\nTommy Hilfiger · $648 · 12 piezas · Switch 15-000000123");
  });

  it("el pedido de la captura", () => {
    expect(
      avisoPedidoEnviado({
        label: "Tommy Hilfiger", numero: "TOM-028", cliente: "Hafez, S.A.",
        total: 2760, piezas: 48, numeroSwitch: "16-000002058", verificado: true,
        documento: "pedido",
      }),
    ).toBe("📦 Pedido TOM-028 · Hafez, S.A.\nTommy Hilfiger · $2,760 · 48 piezas · Switch 16-000002058");
  });

  it("📦 y 📝 NO pueden ser el mismo emoji: es lo primero que se ve en la lista", () => {
    const base = {
      label: "Reebok", numero: "PED-1", cliente: "C", total: 1, piezas: 1,
      numeroSwitch: "05-1", verificado: true,
    } as const;
    const ped = avisoPedidoEnviado({ ...base, documento: "pedido" });
    const cot = avisoPedidoEnviado({ ...base, documento: "cotizacion" });
    expect(ped.startsWith("📦")).toBe(true);
    expect(cot.startsWith("📝")).toBe(true);
    // 🩸 `ped[0]` NO sirve: un emoji es un par sustituto y ambos empiezan con
    // el MISMO code unit alto (\uD83D) — la comparación daba iguales siempre.
    // Se compara el primer CARACTER real.
    expect([...ped][0]).not.toBe([...cot][0]);
    // …y la palabra también cambia, no solo el dibujito.
    expect(ped).toContain("Pedido PED-1");
    expect(cot).toContain("Cotización PED-1");
  });

  it("sin `documento` sigue siendo PEDIDO (los envíos viejos no cambian de significado)", () => {
    const t = avisoPedidoEnviado({
      label: "Reebok", numero: "PED-2", cliente: "C", total: 1, piezas: 1,
      numeroSwitch: "05-2", verificado: true,
    });
    expect(t.startsWith("📦 Pedido PED-2")).toBe(true);
  });

  it("el mismo pedido se lee avanzando: emoji de marca → 📦, mismo número", () => {
    const cfg = MARCAS_CONFIG.tommy;
    const creado = avisoPedidoDeVendedor({
      emoji: cfg.telegramEmoji, label: cfg.label, numero: "TOM-005",
      cliente: "Contado", total: TOTAL, piezas: PIEZAS,
    });
    const enviado = avisoPedidoEnviado({
      label: cfg.label, numero: "TOM-005", cliente: "Contado", total: TOTAL,
      piezas: PIEZAS, numeroSwitch: "16-000002012", verificado: true,
    });
    expect(creado.startsWith("🔵 Pedido TOM-005 · Contado")).toBe(true);
    expect(enviado.startsWith("📦 Pedido TOM-005 · Contado")).toBe(true);
    // La segunda línea solo se diferencia por el N° de Switch: eso ES la etapa.
    expect(enviado.split("\n")[1]).toBe(`${creado.split("\n")[1]} · Switch 16-000002012`);
  });
});

describe("bordes del formato", () => {
  it('"✓ verificado" NO se escribe, pero "⚠️ sin verificar" SÍ (solo la excepción informa)', () => {
    const t = avisoPedidoEnviado({
      label: "Reebok", numero: "PED-020", cliente: "C", total: 10, piezas: 12,
      numeroSwitch: "05-000000123", verificado: false,
    });
    expect(t.split("\n")[1]).toBe("Reebok · $10 · 12 piezas · Switch 05-000000123 ⚠️ sin verificar");
    expect(t).not.toContain("✓");
  });

  it("singular: 1 pieza", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒", label: "Reebok", cliente: "C", total: 38, numero: "PED-030", piezas: 1,
    });
    expect(t.split("\n")[1]).toBe("Reebok · $38 · 1 pieza");
    expect(t).not.toContain("1 piezas");
  });

  it("sin piezas NO se inventa un cero: queda marca + monto", () => {
    const t = avisoPedidoEnviado({
      label: "Joybees", numero: "JBP-001", cliente: "C", total: 500,
      numeroSwitch: "10-000000001", verificado: true,
    });
    expect(t.split("\n")[1]).toBe("Joybees · $500 · Switch 10-000000001");
    expect(t).not.toContain("0 piezas");
  });

  it("cliente vacío no deja un hueco raro", () => {
    const t = avisoPedidoDeVendedor({
      emoji: "🛒", label: "Reebok", cliente: null, total: 0, numero: "PED-021",
    });
    expect(t.split("\n")[0]).toBe("🛒 Pedido PED-021 · Sin nombre");
  });

  // 26-jul-2026: los montos de catálogo no muestran `.00` (regla de Daniel,
  // src/lib/catalogo/precio.ts). Miles sí; medio dólar conserva decimales.
  it("money usa el formato de precio de catálogo: miles sí, `.00` no", () => {
    expect(money(0)).toBe("$0");
    expect(money(980)).toBe("$980");
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(1000000)).toBe("$1,000,000");
  });

  it("son texto PLANO: el canal va sin parse_mode, así un `&` o un `<` del cliente no rompen nada", () => {
    const textos = [
      avisoPedidoDeVendedor({ emoji: "🛒", label: "Reebok", cliente: "C", total: 1, numero: "N", piezas: 1 }),
      avisoPedidoDelLink({ emoji: "🐝", label: "Joybees", cliente: "C", total: 1, numero: "N", piezas: 1 }),
      avisoPedidoEnviado({ label: "Tommy Hilfiger", numero: "N", cliente: "C", total: 1, piezas: 1, numeroSwitch: "16-1", verificado: true }),
    ];
    for (const t of textos) {
      expect(t).not.toMatch(/[<>]/);
      expect(t).not.toMatch(/[*_`[\]]/);
    }
    // Y el nombre del cliente pasa TAL CUAL, sin escapes que ensucien el texto.
    const conSimbolos = avisoPedidoEnviado({
      label: "Reebok", numero: "N", cliente: "Ropa & Más <Panamá>", total: 1,
      piezas: 1, numeroSwitch: "05-1", verificado: true,
    });
    expect(conSimbolos.split("\n")[0]).toBe("📦 Pedido N · Ropa & Más <Panamá>");
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

  it("los 3 emisores mandan las PIEZAS (si se pierden, el aviso queda sin tamaño)", () => {
    expect(src("app/api/catalogo/[marca]/orders/route.ts")).toMatch(/piezas:\s*resumenPed\.piezas/);
    expect(src("app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts")).toMatch(/piezas:\s*resumenLink\.piezas/);
    expect(src("lib/catalogo/switch-envio.ts")).toMatch(/piezas:\s*resumen\.piezas/);
  });

  it("🔴 EL AVISO DE ERROR NO SE PODA: sigue diciendo qué pasó y qué hacer", () => {
    // La poda del 25-ago-2026 es SOLO del aviso de éxito. Cuando Switch falla o
    // no responde, el detalle ES lo útil: sin él nadie sabe si el pedido se
    // creó. Estos textos salen por `enviarSistema` (canal de sistema), no por
    // el armador de dos líneas.
    const s = src("lib/catalogo/switch-envio.ts");
    expect(s).toContain("🚨 Envío a Switch FALLÓ");
    expect(s).toContain("se puede reintentar desde la confirmación");
    expect(s).toContain("🚨 Envío a Switch AMBIGUO");
    expect(s).toContain("REVISAR EL PANEL antes de reintentar");
    expect(s).toContain("shortError(");
  });
});
