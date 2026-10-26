/**
 * 🔴 CANDADO (25 y 26-oct-2026, Daniel). Pedido nuevo del vendedor, pedido o
 * cotización enviado a Switch y pedido del link confirmado YA NO SE MANDAN por
 * Telegram a ningún chat (26-oct-2026). Siguen igual: «guía despachada» en el
 * chat PRIVADO (`enviarNegocioPrivado`), «menos piezas de las pedidas» en el
 * grupo 📊 NEGOCIO (`enviarNegocio`) y los avisos de falla o ambiguo del envío
 * a Switch en 🔧 SISTEMA.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const src = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

const ORDERS = "app/api/catalogo/[marca]/orders/route.ts";
const ENVIO = "lib/catalogo/switch-envio.ts";
const CONFIRMAR = "app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts";

describe("pedido nuevo, enviado a Switch y confirmado del link: sin Telegram", () => {
  it("pedido nuevo del vendedor: la ruta no manda ningún Telegram", () => {
    expect(src(ORDERS)).not.toMatch(/\benviar(Negocio|NegocioPrivado|Sistema)\s*\(|sendTelegramAlert/);
  });
  it("enviado a Switch: solo quedan los avisos de falla y ambiguo, a SISTEMA", () => {
    const s = src(ENVIO);
    expect(s).not.toMatch(/\benviarNegocio(Privado)?\s*\(|sendTelegramAlert/);
    expect(s.match(/\benviarSistema\s*\(/g)).toHaveLength(2);
    expect(s).toContain("🚨 Envío a Switch FALLÓ");
    expect(s).toContain("🚨 Envío a Switch AMBIGUO");
  });
  it("confirmado del link: solo queda «menos piezas» (NEGOCIO) y el error (SISTEMA)", () => {
    const s = src(CONFIRMAR);
    expect(s).not.toMatch(/\benviarNegocioPrivado\s*\(|sendTelegramAlert/);
    expect(s.match(/\benviarNegocio\s*\(/g)).toHaveLength(1);
  });
  it("el armador de esos tres avisos ya no existe", () => {
    expect(existsSync(path.join(process.cwd(), "src/lib/catalogo/telegram-pedido.ts"))).toBe(false);
    for (const rel of [ORDERS, ENVIO, CONFIRMAR]) expect(src(rel)).not.toMatch(/avisoPedido|telegram-pedido/);
  });
});

describe("lo que se queda como estaba", () => {
  it("guía despachada: el único aviso de la ruta va al privado", () => {
    const s = src("app/api/guias/[id]/route.ts");
    expect(s).toMatch(/await enviarNegocioPrivado\(`<pre>/);
    expect(s).not.toMatch(/enviarNegocio\(/);
  });
  it("«menos piezas de las pedidas» sigue en el grupo NEGOCIO", () => {
    expect(src(CONFIRMAR)).toMatch(/await enviarNegocio\(\s*`⚠️[^`]*menos piezas de las pedidas/);
  });
});
