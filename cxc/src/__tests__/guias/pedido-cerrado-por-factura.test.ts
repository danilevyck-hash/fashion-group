// 🔴 24-nov-2026 (Daniel): cuando Switch factura un pedido, se cierra solo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Fila = Record<string, unknown> & { empresa_key: string; pedido_switch_id: number; estado: string };
let filas: Fila[] = [];
const logs: unknown[][] = [];
const factura = { secuencial: "05-00012345", tipo_comprobante: "Factura" };

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async (...a: unknown[]) => { logs.push(a); }) }));
vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = [];
    let cambio: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      update: (f: Record<string, unknown>) => { cambio = f; return q; },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q; },
      in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return q; },
      maybeSingle: () => {
        if (tabla === "switch_facturas") return Promise.resolve({ data: factura, error: null });
        return Promise.resolve({ data: filas.find((f) => filtros.every((p) => p(f))) ?? null, error: null });
      },
      then: (ok: (r: unknown) => unknown) => {
        const tocadas = filas.filter((f) => filtros.every((p) => p(f)));
        if (cambio) tocadas.forEach((f) => Object.assign(f, cambio));
        return Promise.resolve({ data: tocadas.map((f) => ({ pedido_switch_id: f.pedido_switch_id })), error: null }).then(ok);
      },
    };
    return q;
  };
  return { supabaseServer: { from: consulta } };
});

import { cerrarPedidoFacturado, firmaFacturado } from "@/lib/guias/pedido-cerrado-por-factura";

beforeEach(() => { filas = []; logs.length = 0; factura.tipo_comprobante = "Factura"; });

describe("el pedido facturado en Switch se cierra solo", () => {
  it("En preparación → Recibido con la firma del sistema, y quita la espera de muestra", async () => {
    filas = [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "en_preparacion", espera_muestra_desde: "2026-11-20T00:00:00Z" }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(true);
    expect(filas[0]).toMatchObject({
      estado: "recibido",
      recibido_por: "Facturado en Switch · 05-00012345",
      cambiado_por: "Facturado en Switch · 05-00012345",
      espera_muestra_desde: null,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0][1]).toBe("recibido_por_factura");
  });

  it("Preparado → Recibido y conserva la firma de bodega", async () => {
    filas = [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "preparado", preparado_por: "julio", bultos: 3 }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(true);
    expect(filas[0]).toMatchObject({ estado: "recibido", preparado_por: "julio", bultos: 3 });
  });

  it("un Recibido firmado por una persona no cambia", async () => {
    filas = [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "recibido", recibido_por: "angela", recibido_en: "2026-11-01T00:00:00Z" }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(false);
    expect(filas[0]).toMatchObject({ recibido_por: "angela", recibido_en: "2026-11-01T00:00:00Z" });
    expect(logs).toHaveLength(0);
  });

  it("correrlo dos veces no escribe nada nuevo", async () => {
    filas = [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "preparado" }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(true);
    const tras = { ...filas[0] };
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(false);
    expect(filas[0]).toEqual(tras);
    expect(logs).toHaveLength(1);
  });

  it("Pendiente (sin fila), otra empresa o sin pedido: no hace nada", async () => {
    filas = [{ empresa_key: "fashion_wear", pedido_switch_id: 2463, estado: "preparado" }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(false);
    expect(await cerrarPedidoFacturado("fashion_wear", 9151, null)).toBe(false);
    expect(filas).toHaveLength(1);
    expect(filas[0].estado).toBe("preparado");
  });

  it("una nota de crédito con referencia no cierra el pedido", async () => {
    factura.tipo_comprobante = "Nota de Crédito";
    filas = [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "preparado" }];
    expect(await cerrarPedidoFacturado("vistana", 9151, "16-000002463")).toBe(false);
    expect(filas[0].estado).toBe("preparado");
  });

  it("la firma sin N.° de factura dice solo «Facturado en Switch»", () => {
    expect(firmaFacturado(null)).toBe("Facturado en Switch");
  });

  it("se llama donde se guarda el pedido leído de la factura, detrás del interruptor", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/guias/pedido-de-factura.ts"), "utf8");
    expect(src).toMatch(/PEDIDO_SE_CIERRA_CON_FACTURA && pedido\) await cerrarPedidoFacturado\(/);
  });
});
