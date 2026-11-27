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
    // Tres fallas: rechazo, ambiguo, y Switch lo creó pero no se pudo anotar.
    expect(s.match(/\benviarSistema\s*\(/g)).toHaveLength(3);
    expect(s).toContain("pero el sistema no pudo anotarlo");
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
});

/**
 * 🔒 Cambio de dirección (24-nov-2026, Daniel): el aviso por guía se APAGA y los
 * despachos van juntos en el resumen de las 7:00 p. m. (`RESUMEN_DEL_DIA_2026_11`).
 * Con el interruptor en `false` vuelve el aviso por guía: por eso el control de
 * arriba (el texto `<pre>` al privado) se conserva.
 */
describe("resumen del día (24-nov-2026)", () => {
  it("el aviso por guía se corta con el interruptor, antes de mandar", () => {
    const s = src("app/api/guias/[id]/route.ts");
    const cuerpo = s.slice(s.indexOf("async function notifyGuiaDespachada"));
    const corte = cuerpo.indexOf("if (RESUMEN_DEL_DIA_2026_11) return;");
    expect(corte).toBeGreaterThan(0);
    expect(corte).toBeLessThan(cuerpo.indexOf("enviarNegocioPrivado("));
  });
  it("el cron de cobros arma el resumen solo con el interruptor prendido", () => {
    const s = src("app/api/cron/cobros-del-dia/route.ts");
    expect(s).toMatch(/armarResumenDelDia\(fecha\)/);
    const a = src("lib/alertas/resumen-del-dia-armar.ts");
    expect(a).toMatch(/RESUMEN_DEL_DIA_2026_11\s*\?\s*resumenDelDia\(/);
    expect(a).toMatch(/partirParaTelegram\(s\)/);
    expect(s).toMatch(/enviarNegocioPrivado\(parte, "HTML"\)/);
  });
  it("el interruptor está prendido", async () => {
    const { RESUMEN_DEL_DIA_2026_11 } = await import("@/lib/alertas/resumen-del-dia");
    expect(RESUMEN_DEL_DIA_2026_11).toBe(true);
  });
  it("el aviso de guías pendientes de la mañana no se toca", () => {
    expect(src("app/api/cron/guias-pendientes/route.ts")).not.toMatch(/RESUMEN_DEL_DIA/);
  });
  it("«menos piezas de las pedidas» sigue en el grupo NEGOCIO", () => {
    expect(src(CONFIRMAR)).toMatch(/await enviarNegocio\(\s*`⚠️[^`]*menos piezas de las pedidas/);
  });
});
